import OpenAI from "openai";
import * as dotenv from "dotenv";
import catalog from "../../catalog.json";
import { dbService } from "./supabase";
import { 
  getCompatibleSizes, 
  detectVehicle, 
  detectRim, 
  parseTireSize 
} from "./tireCompatibility";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_INSTRUCTION = `
Eres Hancita, la asistente de ventas de "Hanza Neumáticos". Tu tono debe copiar EXACTAMENTE el estilo de Karim: hablar de forma súper relajada, directa, al grano y amigable (como un vendedor de mostrador de gomería de Lomas de Zamora).

REGLAS DE ORO DE ESTILO (CRÍTICAS):
1. RESPUESTAS CORTÍSIMAS (REGLA DE ORO): La gente en WhatsApp no lee. Escribí mensajes súper breves, preferentemente de una o dos líneas cortas. Evitá explicaciones largas o introducciones formales. 
2. NUNCA uses los signos de interrogación o exclamación de apertura (¿ o ¡). Usá únicamente los de cierre (? o !), o no uses ninguno. Ejemplos correctos: "como estas?", "De que zona sos?", "Todo bien?". NUNCA digas "¿Cómo estás?".
3. DIALECTO Y VOCABULARIO: Usá el voseo argentino informal ("sos", "tenes", "como estas?", "decime", "pasame", "dale"). Usá el término "cubierta" (ej: "Tengo esa cubierta BF Goodrich...", "medida de la cubierta"). Evitá decir "neumático" a menos que el cliente lo diga.
4. EVITÁ EL LENGUAJE CORPORATIVO/MARKETING: No digas "¡Excelente elección!", "Es un placer asesorarte", "Contamos con stock de la mejor alternativa". Hablá directo y llano: "Sisi hay de esa medida", "Estamos en Lomas de Zamora, vos?", "Te incluí el envío en el precio".

REGLAS DE NEGOCIO Y COMPATIBILIDAD DE MEDIDAS (CRÍTICAS):
1. EXCLUSIVIDAD DE MARCAS: Comercializamos ÚNICAMENTE Michelin y BF Goodrich. Si te preguntan por otra marca (ej: Pirelli, Fate, Goodyear), explícales rápido que te especializás y sos distribuidor oficial de Michelin y BF Goodrich, y ofréceles la alternativa equivalente.
2. ENVÍOS GRATIS: Todos los envíos son gratis a todo el país. Decilo de forma simple: "Hacemos envios gratis a todo el pais" o "Te incluí el envío en el precio".
3. DOBLE STOCK: Si no hay en stock propio, deciles con naturalidad que demora 2 o 3 días hábiles en llegar de fábrica.
4. COMPATIBILIDAD Y MEDIDAS:
   - NUNCA inventes ni recomiendes medidas que no correspondan al vehículo del cliente.
   - Si el cliente te da la medida o el rodado de su vehículo, la herramienta de búsqueda corroborará si es compatible.
   - Si la herramienta "buscar_neumaticos" te responde con '{"escalate": true}', significa que no conocemos la medida para ese vehículo/rodado. Debés responderle amistosamente que lo vas a consultar y en unos minutos le confirmás (ej: "dejame que consulte que medida lleva esa camioneta con rodado 20 y te confirmo en un ratito!"). El bot se silenciará en segundo plano.
   - Si la herramienta te responde con '{"incompatible": true}', significa que esa medida no va en su vehículo. Debés decirle con tu tono relajado que esa medida no es la que lleva su camioneta y ofrecerle las que sí van (provistas por la herramienta).
   - Si no hay en stock la medida compatible exacta, no inventes ni ofrezcas otra medida incompatible. Decile con naturalidad que no te quedó stock de esa medida exacta.
5. CLIENTE NO SABE LA MEDIDA: NO pidas fotos de entrada. Sugerí enviar foto solo si el cliente dice explícitamente que no sabe la medida y no la encuentra.
6. DERIVACIÓN A KARIM: Si quiere pagar, reservar, hablar por teléfono, o si compra más de 8 cubiertas, indícale amablemente que lo derivás con Karim.
7. REGISTRO DE DATOS: Siempre que te mencionen vehículo o medida, llamá a la herramienta "actualizar_datos_cliente".
`;


export class OpenAIService {
  async generateResponse(userMessage: string, history: any[] = [], conversationId?: string) {
    let dynamicInstruction = SYSTEM_INSTRUCTION;

    if (conversationId) {
      try {
        const conv = await dbService.getConversation(conversationId);
        if (conv) {
          dynamicInstruction += `\n\nCONTEXTO DE ESTA CONVERSACIÓN:
- Vehículo registrado del cliente: ${conv.vehicle_info || "Aún no especificado"}
- Medida buscada registrada del cliente: ${conv.tire_size_searched || "Aún no especificada"}
`;
        }
      } catch (err) {
        console.error("Error loading conversation context:", err);
      }
    }

    let messages: any[] = [
      { role: "system", content: dynamicInstruction },
      ...history,
    ];

    // Evitar duplicar el último mensaje si ya está en el historial
    const lastHistoryMsg = history[history.length - 1];
    if (!lastHistoryMsg || lastHistoryMsg.role !== "user" || lastHistoryMsg.content !== userMessage) {
      messages.push({ role: "user", content: userMessage });
    }

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: messages,
        tools: [
          {
            type: "function",
            function: {
              name: "buscar_neumaticos",
              description: "Busca neumáticos por medida, rodado o modelo en el catálogo aplicando reglas estrictas de compatibilidad con el vehículo del cliente si se conoce.",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string", description: "Medida (ej: 255 55 19), rodado (ej: rodado 20) o modelo a buscar." },
                },
                required: ["query"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "actualizar_datos_cliente",
              description: "Registra o actualiza la información del vehículo del cliente (ej: Toyota SW4 2020) y/o la medida de neumático que busca (ej: 265/65 R17) en la base de datos de la conversación.",
              parameters: {
                type: "object",
                properties: {
                  vehicle_info: { type: "string", description: "Marca, modelo y/o año del vehículo del cliente." },
                  tire_size_searched: { type: "string", description: "Medida del neumático que busca (ej: '205/55 R16')." }
                }
              }
            }
          }
        ],
      });

      let message = response.choices[0].message;

      if (message.tool_calls) {
        console.log("AI called tools:", message.tool_calls.map((t: any) => ({ name: t.function.name, arguments: t.function.arguments })));
        messages.push(message);

        for (const toolCall of message.tool_calls) {
          const tc = toolCall as any;
          const name = tc.function.name;
          const args = JSON.parse(tc.function.arguments);

          if (name === "buscar_neumaticos") {
            const query = args.query || "";
            
            // 1. Resolver contexto del vehículo y rodado
            let detectedVeh = detectVehicle(query) || detectVehicle(userMessage);
            let detectedR = detectRim(query) || detectRim(userMessage);

            if (conversationId) {
              try {
                const conv = await dbService.getConversation(conversationId);
                if (conv) {
                  if (!detectedVeh && conv.vehicle_info) {
                    detectedVeh = detectVehicle(conv.vehicle_info);
                  }
                  if (!detectedR && conv.tire_size_searched) {
                    detectedR = detectRim(conv.tire_size_searched);
                  }
                }
              } catch (e) {
                console.error("Error reading context for tool:", e);
              }
            }

            // Buscar en el historial
            if (!detectedVeh) {
              for (let i = history.length - 1; i >= 0; i--) {
                const m = detectVehicle(history[i].content);
                if (m) {
                  detectedVeh = m;
                  break;
                }
              }
            }
            if (!detectedR) {
              for (let i = history.length - 1; i >= 0; i--) {
                const r = detectRim(history[i].content);
                if (r) {
                  detectedR = r;
                  break;
                }
              }
            }

            console.log(`Resolved search context - Vehicle: ${detectedVeh}, Rim: ${detectedR}`);

            let results: any[] = [];
            let escalationFlag = false;
            let incompatibilityFlag = false;
            let compatibleSizesList: string[] = [];

            if (detectedVeh) {
              const allCompatSizes = await getCompatibleSizes(detectedVeh);

              if (detectedR) {
                const exactCompatSizes = await getCompatibleSizes(detectedVeh, detectedR);
                compatibleSizesList = exactCompatSizes;

                if (exactCompatSizes.length > 0) {
                  // Filtrar catálogo estrictamente por las medidas compatibles con ese rodado
                  results = (catalog as any[]).filter(item => {
                    const sizeStr = `${item.Ancho}/${item.Taco} R${item.Llanta}`.toUpperCase();
                    return exactCompatSizes.includes(sizeStr);
                  });
                } else {
                  // No conocemos medidas compatibles con ese rodado para el vehículo -> Escalar!
                  escalationFlag = true;
                  if (conversationId) {
                    await dbService.createPendingConsultation(
                      conversationId,
                      detectedVeh,
                      detectedR,
                      `El cliente preguntó por medidas compatibles para una ${detectedVeh} con rodado ${detectedR}.`
                    );
                    // Silenciar bot
                    await dbService.updateConversationDetails(conversationId, { bot_enabled: false });
                  }
                }
              } else {
                // Hay vehículo pero no rodado especificado. Ver si hay una medida de neumático en la consulta
                const parsedSize = parseTireSize(query) || parseTireSize(userMessage);
                if (parsedSize) {
                  const sizeStr = `${parsedSize.width}/${parsedSize.aspect} R${parsedSize.rim}`.toUpperCase();
                  if (allCompatSizes.includes(sizeStr)) {
                    results = (catalog as any[]).filter(item => 
                      item.Ancho === parsedSize.width &&
                      item.Taco === parsedSize.aspect &&
                      item.Llanta === parsedSize.rim
                    );
                  } else {
                    // Medida incompatible con la camioneta
                    incompatibilityFlag = true;
                    compatibleSizesList = allCompatSizes;
                  }
                } else {
                  // Sin medida ni rodado. Traer las medidas estándar típicas registradas
                  results = (catalog as any[]).filter(item => {
                    const sizeStr = `${item.Ancho}/${item.Taco} R${item.Llanta}`.toUpperCase();
                    return allCompatSizes.includes(sizeStr);
                  });
                }
              }
            } else {
              // Sin vehículo en contexto. Buscar por medida exacta o rodado para evitar falsos positivos
              const parsedSize = parseTireSize(query) || parseTireSize(userMessage);
              if (parsedSize) {
                results = (catalog as any[]).filter(item => 
                  item.Ancho === parsedSize.width &&
                  item.Taco === parsedSize.aspect &&
                  item.Llanta === parsedSize.rim
                );
              } else if (detectedR) {
                results = (catalog as any[]).filter(item => item.Llanta === detectedR);
              } else {
                // Búsqueda de texto libre, desinfectando números sueltos de CAI/Precios
                const cleanQuery = query.toLowerCase().trim();
                const numbers = cleanQuery.match(/\d+/g) || [];

                results = (catalog as any[]).filter(item => {
                  const itemStr = JSON.stringify(item).toLowerCase();
                  if (numbers.length >= 2) {
                    return (
                      numbers.includes(String(item.Ancho)) ||
                      numbers.includes(String(item.Taco)) ||
                      numbers.includes(String(item.Llanta))
                    );
                  }
                  return itemStr.includes(cleanQuery);
                });
              }
            }

            // Limitar a 5 resultados y compactar para ahorrar tokens
            results = results.slice(0, 5);

            let toolResponse = "";
            if (escalationFlag) {
              toolResponse = JSON.stringify({ escalate: true, vehicle: detectedVeh, rim: detectedR });
            } else if (incompatibilityFlag) {
              toolResponse = JSON.stringify({ incompatible: true, compatible_sizes: compatibleSizesList });
            } else {
              const compacted = results.map(item => ({
                cai: item.CAI,
                marca: item.Marca,
                modelo: item.Modelo.trim(),
                medida: `${item.Ancho}/${item.Taco} R${item.Llanta}`,
                precio: Math.round(item["Precio con IVA"]),
                stock: item.Stock
              }));
              toolResponse = JSON.stringify(compacted);
            }

            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: toolResponse,
            });
          } 
          else if (name === "actualizar_datos_cliente") {
            const { vehicle_info, tire_size_searched } = args;
            let success = false;
            if (conversationId) {
              const updates: any = {};
              if (vehicle_info) updates.vehicle_info = vehicle_info;
              if (tire_size_searched) updates.tire_size_searched = tire_size_searched;

              if (Object.keys(updates).length > 0) {
                const updated = await dbService.appendConversationDetails(conversationId, updates);
                if (updated) success = true;
              }
            }
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({ success }),
            });
          }
        }

        const finalResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: messages,
        });

        const responseText = finalResponse.choices[0].message.content || "Perdon, me distraje. me repetis?";
        return responseText.replace(/[¿¡]/g, "");
      }

      const responseText = message.content || "Hola! En que puedo ayudarte?";
      return responseText.replace(/[¿¡]/g, "");

    } catch (error: any) {
      console.error("AI Error:", error);
      return "Estoy teniendo un pequeño problema técnico, pero dejame tu número y te contactamos en un ratito.";
    }
  }


  async processAudio(audioBuffer: Buffer) {
    // Implementación futura
  }

  async analyzeTireImage(imageBuffer: Buffer): Promise<string> {
    try {
      const base64Image = imageBuffer.toString("base64");
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { 
                type: "text", 
                text: "Analiza esta imagen de un neumático. Identifica la medida de neumático (por ejemplo: 205/55 R16, 265/65 R17, 175/65 R14, etc.) grabada en el lateral de la cubierta. Responde ÚNICAMENTE con la medida formateada si la encontrás de forma clara (ej. '205/55 R16'). Si no la podés leer con total seguridad y claridad, responde únicamente con 'NO_DETECTADO'." 
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
      });

      return response.choices[0].message.content?.trim() || "NO_DETECTADO";
    } catch (error) {
      console.error("Error analyzing tire image with OpenAI:", error);
      return "NO_DETECTADO";
    }
  }

  async transcribeAudio(audioBuffer: Buffer, mimeType: string = "audio/ogg"): Promise<string> {
    try {
      const extension = mimeType.includes("mp3") ? "mp3" : mimeType.includes("m4a") ? "m4a" : "ogg";
      const file = await OpenAI.toFile(audioBuffer, `audio.${extension}`, { type: mimeType });
      
      const transcription = await openai.audio.transcriptions.create({
        file: file,
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

