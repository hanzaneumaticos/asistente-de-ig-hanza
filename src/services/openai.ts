import OpenAI from "openai";
import * as dotenv from "dotenv";
import catalog from "../../catalog.json";
import { dbService } from "./supabase";
import {
  detectRim,
  detectVehicle,
  getCompatibleSizes,
  parseTireSize,
} from "./tireCompatibility";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PRIMARY_TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-5.5";
const SECONDARY_TEXT_MODEL = process.env.OPENAI_SECONDARY_MODEL || PRIMARY_TEXT_MODEL;
const VISION_MODEL = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
const TEXT_MODEL_FALLBACKS = [
  PRIMARY_TEXT_MODEL,
  "gpt-5",
  "gpt-5-mini",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4o-mini",
];
const SECONDARY_MODEL_FALLBACKS = [
  SECONDARY_TEXT_MODEL,
  PRIMARY_TEXT_MODEL,
  "gpt-5-mini",
  "gpt-4.1-mini",
  "gpt-4o-mini",
];
const VISION_MODEL_FALLBACKS = [VISION_MODEL, "gpt-4o-mini", "gpt-4.1-mini"];

type ConversationContext = {
  vehicleInfo?: string;
  tireSizeSearched?: string;
  alreadyMentionedShipping: boolean;
  alreadyAskedToCheckSidewall: boolean;
  customerNameKnown: boolean;
};

type SearchResult = {
  cai: string;
  marca: string;
  modelo: string;
  medida: string;
  compatibilidad: string;
  precio_contado: number;
  precio_factura: number;
  precio_tarjeta_un_pago: number;
  precio_tarjeta_lista: number;
  stock_banfield: number;
  stock_michelin: number;
};

type SearchToolPayload = {
  query: string;
  detected_vehicle: string | null;
  detected_rim: number | null;
  query_size: string | null;
  escalate: boolean;
  incompatible: boolean;
  compatible_sizes: string[];
  results: SearchResult[];
};

const MODELS_WITH_PRIORITY = ["ko3", "trail terrain", "ltx trail", "ltx force", "primacy"];

const SALES_SYSTEM_PROMPT = `
Sos Hancita, la asistente de ventas de Hanza Neumaticos.

Habla como vendedor de mostrador de gomeria en Argentina:
- mensajes cortos y faciles de leer
- tono directo, relajado y amable
- voseo argentino: tenes, sos, decime, pasame, fijate, dale
- usa "cubierta" como termino principal
- no uses lenguaje corporativo ni vendedor acartonado
- no uses signos de apertura

Reglas comerciales:
- Hanza vende solo Michelin y BF Goodrich
- nunca inventes precios, stock, medidas ni compatibilidades
- si la consulta es de precios, medidas, marcas, compatibilidad, cuotas, tarjeta o factura, usa la herramienta buscar_neumaticos
- si el cliente menciona vehiculo o medida, usa la herramienta actualizar_datos_cliente
- si no sabe la medida, primero pregunta si puede verla en la cubierta actual
- solo sugeri foto si te dice que no encuentra la medida
- si una medida no es compatible, decilo corto y ofrece solo las compatibles
- si no hay stock, decilo claro y no inventes reemplazos incompatibles
- si no tenemos compatibilidad cargada para ese vehiculo o rodado, deci que lo vas a chequear y confirmar en un rato
- deriva a Karim solo si quiere reservar/comprar, pide link de pago/CBU/alias, quiere hablar por telefono o compra mas de 8 cubiertas

Formato de respuesta:
- respuestas de 1 a 4 parrafos cortos
- cuando pases precios, cada precio va en un parrafo separado
- el parrafo de precio debe incluir solo marca, modelo, medida y precio
- si corresponde, cerra con una sola pregunta util para seguir la venta
- no repitas envio gratis, ni pedir revisar el costado, si ya se dijo antes

Ejemplos de estilo:
Cliente: "tenes 265/65 r17?"
Respuesta: "Sisi, tengo opciones en esa medida.

BF Goodrich KO3 265/65 R17 $123456

De que zona sos?"

Cliente: "y con factura A?"
Respuesta: "BF Goodrich KO3 265/65 R17 $135000"

Cliente: "no se que medida lleva mi Amarok"
Respuesta: "Tenes idea que medida tiene puesta ahora?"
`;

function cleanAssistantText(text: string): string {
  return text
    .replace(/[¿¡]/g, "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeSearchString(value?: string | null): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function uniqueModels(models: string[]): string[] {
  return Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)));
}

function isRetryableModelError(error: any): boolean {
  const message = String(error?.response?.data?.error?.message || error?.message || "").toLowerCase();
  return (
    message.includes("model") ||
    message.includes("not found") ||
    message.includes("does not exist") ||
    message.includes("access") ||
    message.includes("permission") ||
    message.includes("unsupported")
  );
}

async function createChatCompletionWithFallback(params: any, modelCandidates: string[]) {
  const models = uniqueModels(modelCandidates);
  let lastError: any;

  for (const model of models) {
    try {
      return await openai.chat.completions.create({
        ...params,
        model,
      });
    } catch (error) {
      lastError = error;
      console.error(`OpenAI model failed (${model}):`, error);
      if (!isRetryableModelError(error)) {
        throw error;
      }
    }
  }

  throw lastError;
}

function formatSize(width: number, aspect: number | string, rim: number): string {
  return `${width}/${aspect} R${rim}`.toUpperCase();
}

function getHistoryText(history: Array<{ content?: string }>): string {
  return history.map((item) => item.content || "").join("\n").toLowerCase();
}

export function detectCatalogIntent(userMessage: string, history: Array<{ content?: string }>, context?: ConversationContext): boolean {
  const message = userMessage.toLowerCase();
  const fullContext = `${message}\n${getHistoryText(history)}\n${context?.tireSizeSearched || ""}\n${context?.vehicleInfo || ""}`.toLowerCase();

  const priceKeywords = ["precio", "sale", "valor", "contado", "efectivo", "transferencia", "tarjeta", "cuotas", "factura", "stock", "disponible"];
  const productKeywords = ["michelin", "bf", "goodrich", "ko3", "trail terrain", "ltx", "primacy", "cubierta", "cubiertas", "neumatico", "neumaticos"];
  const compatibilityKeywords = ["le va", "sirve", "compatib", "medida", "rodado", "llanta", "rinde"];

  const hasSize = !!parseTireSize(userMessage) || /\b\d{3}[\/\s-]?\d{2}[\/\s-]?r?\d{2}\b/i.test(userMessage);
  const hasVehicle = !!detectVehicle(userMessage) || !!context?.vehicleInfo;

  return (
    hasSize ||
    priceKeywords.some((keyword) => fullContext.includes(keyword)) ||
    productKeywords.some((keyword) => fullContext.includes(keyword)) ||
    (hasVehicle && compatibilityKeywords.some((keyword) => fullContext.includes(keyword)))
  );
}

export function buildConversationContext(history: Array<{ role?: string; content?: string }>, conversation?: any): ConversationContext {
  const historyText = getHistoryText(history);
  const vehicleInfo = normalizeSearchString(conversation?.vehicle_info);
  const tireSizeSearched = normalizeSearchString(conversation?.tire_size_searched);
  const contactName = normalizeSearchString(conversation?.contact_name);

  return {
    vehicleInfo: vehicleInfo || undefined,
    tireSizeSearched: tireSizeSearched || undefined,
    alreadyMentionedShipping: /(envio|envios|gratis)/i.test(historyText),
    alreadyAskedToCheckSidewall: /(costado|lateral|fijate|mira el costado|revisa la cubierta)/i.test(historyText),
    customerNameKnown: !!contactName && !/cliente/i.test(contactName),
  };
}

function buildRuntimeInstructions(userMessage: string, history: Array<{ content?: string }>, context: ConversationContext): string {
  const hints: string[] = [];

  if (context.vehicleInfo) {
    hints.push(`Vehiculo guardado: ${context.vehicleInfo}`);
  }
  if (context.tireSizeSearched) {
    hints.push(`Medida guardada: ${context.tireSizeSearched}`);
  }
  if (context.alreadyMentionedShipping) {
    hints.push("No vuelvas a mencionar envio gratis salvo que el cliente lo pida otra vez.");
  }
  if (context.alreadyAskedToCheckSidewall) {
    hints.push("No vuelvas a pedir que revise el costado de la cubierta.");
  }
  if (context.customerNameKnown) {
    hints.push("No preguntes el nombre, ya esta registrado.");
  }
  if (detectCatalogIntent(userMessage, history, context)) {
    hints.push("En este turno tenes que usar buscar_neumaticos si necesitas confirmar precios, stock, medidas o compatibilidad.");
  }

  return hints.length > 0 ? `\nContexto operativo:\n- ${hints.join("\n- ")}` : "";
}

function getToolDefinitions() {
  return [
    {
      type: "function" as const,
      function: {
        name: "buscar_neumaticos",
        description: "Busca cubiertas en el catalogo usando medida, vehiculo, rodado, marca o modelo, y devuelve precios y compatibilidad real.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Busqueda principal: medida, rodado, marca o modelo.",
            },
            vehicle: {
              type: "string",
              description: "Vehiculo mencionado por el cliente si existe.",
            },
            rim: {
              type: "integer",
              description: "Rodado o llanta mencionada si existe.",
            },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "actualizar_datos_cliente",
        description: "Guarda vehiculo y/o medida mencionada por el cliente en la conversacion.",
        parameters: {
          type: "object",
          properties: {
            vehicle_info: {
              type: "string",
              description: "Marca, modelo o version del vehiculo del cliente.",
            },
            tire_size_searched: {
              type: "string",
              description: "Medida de cubierta consultada por el cliente.",
            },
          },
        },
      },
    },
  ];
}

async function resolveSearchContext(
  args: { query?: string; vehicle?: string; rim?: number },
  userMessage: string,
  history: Array<{ content?: string }>,
  conversationId?: string,
): Promise<{ query: string; detectedVehicle: string | null; detectedRim: number | null; parsedSize: ReturnType<typeof parseTireSize> }> {
  const query = normalizeSearchString(args.query || userMessage);
  const parsedSize = parseTireSize(query) || parseTireSize(userMessage);
  const explicitVehicle = normalizeSearchString(args.vehicle);
  const normalizedExplicitVehicle = explicitVehicle ? detectVehicle(explicitVehicle) || explicitVehicle : null;

  let detectedVehicle = normalizedExplicitVehicle || detectVehicle(query) || detectVehicle(userMessage);
  let detectedRim = args.rim ? Number(args.rim) : detectRim(query) || detectRim(userMessage);

  if (detectedRim && (detectedRim < 12 || detectedRim > 24)) {
    detectedRim = null;
  }

  if (conversationId) {
    const conversation = await dbService.getConversation(conversationId);
    if (conversation) {
      if (!detectedVehicle && conversation.vehicle_info) {
        detectedVehicle = detectVehicle(conversation.vehicle_info) || normalizeSearchString(conversation.vehicle_info);
      }
      if (!detectedRim && conversation.tire_size_searched) {
        detectedRim = detectRim(conversation.tire_size_searched);
      }
    }
  }

  if (!detectedVehicle) {
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const candidate = detectVehicle(history[index].content || "");
      if (candidate) {
        detectedVehicle = candidate;
        break;
      }
    }
  }

  if (!detectedRim) {
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const candidate = detectRim(history[index].content || "");
      if (candidate) {
        detectedRim = candidate;
        break;
      }
    }
  }

  return {
    query,
    detectedVehicle,
    detectedRim,
    parsedSize,
  };
}

function scoreCatalogItem(item: any, query: string, userMessage: string, compatibleSizes: string[]): number {
  let score = 0;
  const hasStock = item.StockBanfield > 0 || item.StockMichelin > 0;
  const sizeStr = formatSize(item.Ancho, item.Taco, item.Llanta);
  const model = String(item.Modelo || "").toLowerCase();
  const brand = String(item.Marca || "").toLowerCase();
  const fullText = `${query} ${userMessage}`.toLowerCase();

  if (hasStock) score += 10000;
  if (compatibleSizes.includes(sizeStr)) score += 2500;

  if (fullText.includes("michelin") && brand.includes("michelin")) score += 600;
  if ((fullText.includes("bf") || fullText.includes("goodrich")) && brand.includes("goodrich")) score += 600;

  for (const modelHint of MODELS_WITH_PRIORITY) {
    if (fullText.includes(modelHint) && model.includes(modelHint)) {
      score += 900;
    }
  }

  if (brand.includes("goodrich")) {
    score += 150;
    if (model.includes("ko3")) score += 100;
    if (model.includes("trail")) score += 80;
  }

  if (brand.includes("michelin")) {
    score += 80;
  }

  return score;
}

function hasStrongConsultationSignal(userMessage: string, detectedVehicle: string | null, detectedRim: number | null, parsedSize: ReturnType<typeof parseTireSize>): boolean {
  const normalized = normalizeSearchString(userMessage).toLowerCase();
  const genericFollowUps = [
    "hola",
    "buenas",
    "estas ahi",
    "estás ahi",
    "estas ahi?",
    "estás ahí",
    "estás ahí?",
    "dale",
    "gracias",
    "ok",
    "oka",
    "bueno",
    "si",
    "sí",
    "aja",
    "ajá",
  ];

  if (genericFollowUps.includes(normalized)) {
    return false;
  }

  if (parsedSize) {
    return true;
  }

  if (detectedVehicle) {
    return true;
  }

  if (detectedRim && /\b(rodado|llanta|r\d{2}|\d{2})\b/i.test(userMessage)) {
    return true;
  }

  return /\b(cubierta|cubiertas|neumatico|neumaticos|medida|rodado|llanta|sw4|hilux|amarok|ranger|corolla|cla)\b/i.test(userMessage);
}

async function executeSearchTool(
  args: { query?: string; vehicle?: string; rim?: number },
  userMessage: string,
  history: Array<{ content?: string }>,
  conversationId?: string,
): Promise<SearchToolPayload> {
  const { query, detectedVehicle, detectedRim, parsedSize } = await resolveSearchContext(args, userMessage, history, conversationId);

  const allCompatibleSizes = detectedVehicle ? await getCompatibleSizes(detectedVehicle) : [];
  const exactCompatibleSizes = detectedVehicle && detectedRim ? await getCompatibleSizes(detectedVehicle, detectedRim) : [];
  const compatibleSizes = (detectedRim ? exactCompatibleSizes : allCompatibleSizes).map((value) =>
    value.replace(/\s*\([^)]*\)/g, "").trim().toUpperCase(),
  );

  let escalate = false;
  let incompatible = false;

  if (detectedVehicle) {
    if (allCompatibleSizes.length === 0) {
      escalate = true;
    } else if (detectedRim && exactCompatibleSizes.length === 0) {
      escalate = true;
    }
  }

  if (escalate && conversationId && detectedVehicle && hasStrongConsultationSignal(userMessage, detectedVehicle, detectedRim, parsedSize)) {
    await dbService.createPendingConsultation(conversationId, detectedVehicle, detectedRim, userMessage);
    await dbService.updateConversationDetails(conversationId, {
      bot_enabled: false,
      vehicle_info: detectedVehicle,
      tire_size_searched: detectedRim ? `Rodado ${detectedRim}` : undefined,
    });
  }

  let matchedItems: any[] = [];

  if (!escalate) {
    if (parsedSize) {
      matchedItems = (catalog as any[]).filter(
        (item) => item.Ancho === parsedSize.width && item.Taco === parsedSize.aspect && item.Llanta === parsedSize.rim,
      );

      if (detectedVehicle) {
        const requestedSize = formatSize(parsedSize.width, parsedSize.aspect, parsedSize.rim);
        incompatible = compatibleSizes.length > 0 && !compatibleSizes.includes(requestedSize);
      }
    } else if (detectedRim) {
      matchedItems = (catalog as any[]).filter((item) => item.Llanta === detectedRim);
    } else {
      const cleanQuery = query.toLowerCase();
      const numbers: string[] = cleanQuery.match(/\d+/g) || [];

      matchedItems = (catalog as any[]).filter((item) => {
        const serialized = JSON.stringify(item).toLowerCase();
        if (numbers.length >= 2) {
          return (
            numbers.includes(String(item.Ancho)) ||
            numbers.includes(String(item.Taco)) ||
            numbers.includes(String(item.Llanta))
          );
        }
        return serialized.includes(cleanQuery);
      });
    }

    if (matchedItems.length === 0 && compatibleSizes.length > 0) {
      matchedItems = (catalog as any[]).filter((item) => compatibleSizes.includes(formatSize(item.Ancho, item.Taco, item.Llanta)));
    }
  }

  const scoredItems = matchedItems
    .map((item) => {
      const medida = formatSize(item.Ancho, item.Taco, item.Llanta);
      const compatibilidad = compatibleSizes.includes(medida)
        ? medida
        : detectedVehicle
          ? `Incompatible con ${detectedVehicle}`
          : "General";

      return {
        item,
        score: scoreCatalogItem(item, query, userMessage, compatibleSizes),
        compatibilidad,
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 6);

  const results: SearchResult[] = scoredItems.map(({ item, compatibilidad }) => ({
    cai: String(item.CAI),
    marca: String(item.Marca),
    modelo: String(item.Modelo || "").trim(),
    medida: formatSize(item.Ancho, item.Taco, item.Llanta),
    compatibilidad,
    precio_contado: Math.round(item.PrecioSF),
    precio_factura: Math.round(item.PrecioCF),
    precio_tarjeta_un_pago: Math.round(item.PrecioUnPagoCF),
    precio_tarjeta_lista: Math.round(item.PrecioLista),
    stock_banfield: Number(item.StockBanfield || 0),
    stock_michelin: Number(item.StockMichelin || 0),
  }));

  return {
    query,
    detected_vehicle: detectedVehicle,
    detected_rim: detectedRim,
    query_size: parsedSize ? formatSize(parsedSize.width, parsedSize.aspect, parsedSize.rim) : null,
    escalate,
    incompatible,
    compatible_sizes: compatibleSizes,
    results,
  };
}

export class OpenAIService {
  async generateResponse(userMessage: string, history: any[] = [], conversationId?: string) {
    let conversation: any = null;

    if (conversationId) {
      try {
        conversation = await dbService.getConversation(conversationId);
      } catch (error) {
        console.error("Error loading conversation context:", error);
      }
    }

    const conversationContext = buildConversationContext(history, conversation);
    const systemInstruction = `${SALES_SYSTEM_PROMPT}${buildRuntimeInstructions(userMessage, history, conversationContext)}`;

    const messages: any[] = [
      { role: "system", content: systemInstruction },
      ...history.map((item) => ({
        role: item.role,
        content: item.content,
      })),
    ];

    const lastHistoryMsg = history[history.length - 1];
    if (!lastHistoryMsg || lastHistoryMsg.role !== "user" || lastHistoryMsg.content !== userMessage) {
      messages.push({ role: "user", content: userMessage });
    }

    try {
      const firstPass = await createChatCompletionWithFallback({
        messages,
        tools: getToolDefinitions(),
      }, TEXT_MODEL_FALLBACKS);

      const firstMessage = firstPass.choices[0].message;

      if (firstMessage.tool_calls?.length) {
        messages.push({
          role: "assistant",
          content: firstMessage.content || "",
          tool_calls: firstMessage.tool_calls,
        });

        for (const toolCall of firstMessage.tool_calls as any[]) {
          const toolName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments || "{}");

          if (toolName === "buscar_neumaticos") {
            const toolPayload = await executeSearchTool(args, userMessage, history, conversationId);
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(toolPayload),
            });
          }

          if (toolName === "actualizar_datos_cliente") {
            let success = false;
            if (conversationId) {
              const updates: { vehicle_info?: string; tire_size_searched?: string } = {};
              if (args.vehicle_info) updates.vehicle_info = String(args.vehicle_info);
              if (args.tire_size_searched) updates.tire_size_searched = String(args.tire_size_searched);

              if (Object.keys(updates).length > 0) {
                const updated = await dbService.appendConversationDetails(conversationId, updates);
                success = !!updated;
              }
            }

            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({ success }),
            });
          }
        }

        const secondPass = await createChatCompletionWithFallback({
          messages,
        }, TEXT_MODEL_FALLBACKS);

        return cleanAssistantText(secondPass.choices[0].message.content || "Perdon, me repetis?");
      }

      return cleanAssistantText(firstMessage.content || "Hola! En que te puedo ayudar?");
    } catch (error) {
      console.error("AI Error:", error);
      return "Estoy con un problema tecnico ahora. Si queres dejame tu consulta y te respondemos en un rato.";
    }
  }

  async processAudio(audioBuffer: Buffer) {
    return audioBuffer;
  }

  async analyzeTireImage(imageBuffer: Buffer): Promise<string> {
    try {
      const base64Image = imageBuffer.toString("base64");
      const response = await createChatCompletionWithFallback({
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Mira la foto y devolve solo la medida de la cubierta si se lee con claridad. Ejemplo: 265/65 R17. Si no se ve seguro, responde solo NO_DETECTADO.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 20,
      }, VISION_MODEL_FALLBACKS);

      return cleanAssistantText(response.choices[0].message.content || "NO_DETECTADO") || "NO_DETECTADO";
    } catch (error) {
      console.error("Error analyzing tire image with OpenAI:", error);
      return "NO_DETECTADO";
    }
  }

  async summarizeConversation(history: { role: string; content: string }[]): Promise<{ summary: string; location: string }> {
    try {
      if (history.length === 0) {
        return { summary: "Sin mensajes todavia.", location: "No especificada" };
      }

      const formattedHistory = history.map((item) => `${item.role === "user" ? "Cliente" : "Hancita"}: ${item.content}`).join("\n");

      const response = await createChatCompletionWithFallback({
        messages: [
          {
            role: "system",
            content: `Analiza esta conversacion y devolve solo JSON.
{
  "summary": "resumen corto de lo que busca el cliente y estado actual",
  "location": "zona mencionada o No especificada"
}`,
          },
          {
            role: "user",
            content: formattedHistory,
          },
        ],
        response_format: { type: "json_object" },
      }, SECONDARY_MODEL_FALLBACKS);

      const parsed = JSON.parse(response.choices[0].message.content || "{}");
      return {
        summary: parsed.summary || "No se pudo generar el resumen.",
        location: parsed.location || "No especificada",
      };
    } catch (error) {
      console.error("Error in summarizeConversation:", error);
      return { summary: "Error al generar resumen.", location: "No especificada" };
    }
  }

  async processAdminResponse(
    adminResponse: string,
    vehicle: string,
    rim: string,
  ): Promise<{ extracted_tire_sizes?: string[]; extracted_tire_size?: string | null; client_response: string }> {
    try {
      const response = await createChatCompletionWithFallback({
        messages: [
          {
            role: "system",
            content: `Sos asistente administrativo de Hanza Neumaticos.
Vehiculo: "${vehicle}"
Rodado: "${rim}"

Hace dos cosas y responde solo JSON:
1. Extrae todas las medidas mencionadas en formato ANCHO/PERFIL RLLANTA.
2. Redacta el mensaje para el cliente con tono corto, relajado, vendedor y en voseo argentino.

Formato:
{
  "extracted_tire_sizes": ["255/50 R20"],
  "client_response": "texto listo para enviar"
}`,
          },
          {
            role: "user",
            content: adminResponse,
          },
        ],
        response_format: { type: "json_object" },
      }, SECONDARY_MODEL_FALLBACKS);

      const parsed = JSON.parse(response.choices[0].message.content || "{}");
      return {
        extracted_tire_sizes: parsed.extracted_tire_sizes || [],
        extracted_tire_size: parsed.extracted_tire_size || null,
        client_response: cleanAssistantText(parsed.client_response || "Dejame que lo chequeo bien y te confirmo en un rato."),
      };
    } catch (error) {
      console.error("Error in processAdminResponse:", error);
      return {
        extracted_tire_sizes: [],
        extracted_tire_size: null,
        client_response: "Dejame que lo chequeo bien y te confirmo en un rato.",
      };
    }
  }

  async transcribeAudio(audioBuffer: Buffer, mimeType: string = "audio/ogg"): Promise<string> {
    try {
      const extension = mimeType.includes("mp3") ? "mp3" : mimeType.includes("m4a") ? "m4a" : "ogg";
      const file = await OpenAI.toFile(audioBuffer, `audio.${extension}`, { type: mimeType });

      const transcription = await openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
        language: "es",
      });

      return transcription.text || "";
    } catch (error) {
      console.error("Error transcribing audio with Whisper:", error);
      throw error;
    }
  }
}

export const aiService = new OpenAIService();
