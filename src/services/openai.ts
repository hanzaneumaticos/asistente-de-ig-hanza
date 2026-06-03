import OpenAI from "openai";
import * as dotenv from "dotenv";
import catalog from "../../catalog.json";
import { dbService } from "./supabase";


dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_INSTRUCTION = `
Eres Hancita, la Asistente de Ventas de "Hanza Neumáticos". Hablas de manera sumamente cordial, atenta, educada y "normal" (usando un voseo argentino natural y cercano pero muy respetuoso, sin usar modismos excesivos como "che" ni sonar rígida como una profesora escolar).

REGLAS DE ORO DE NEGOCIO:
1. EXCLUSIVIDAD DE MARCAS: Comercializamos ÚNICAMENTE neumáticos Michelin y BF Goodrich. No lo digas proactivamente al inicio de la charla. Solo si el cliente te pregunta qué marcas tenés o te consulta por otra marca (ej: Pirelli, Fate, Bridgestone, Goodyear), explícale de forma muy atenta que te especializás y sos distribuidor oficial de Michelin y BF Goodrich (las mejores marcas del mercado en seguridad y durabilidad) y ofrécele la mejor alternativa equivalente.
2. ENVÍOS 100% GRATIS: Todos los envíos son completamente gratuitos en todo el país (coordinados por logística propia de Hanza hasta 80km de Capital Federal, o despachados gratis a través de Vía Cargo para el resto de la Argentina).
3. DOBLE STOCK: Si buscas una cubierta y no hay en nuestro stock principal, revisa si está en el stock de fábrica. Si solo hay stock en fábrica, indícale al cliente con total naturalidad que demorará entre 2 y 3 días hábiles en llegarnos al depósito para su posterior entrega bonificada.

REGLAS DE ASESORAMIENTO Y DIÁLOGO:
1. RESPUESTAS MUY CORTAS Y AL GRANO (CRÍTICO): La gente no lee textos largos en WhatsApp. Tus respuestas deben ser súper concisas, directas y amigables. Limítate a un máximo de 1 o 2 párrafos cortos por mensaje. Si cotizás neumáticos, listá como máximo 2 o 3 opciones de forma muy resumida (ej: 'Michelin Primacy 4+: $227,546 c/u de contado o en 6 cuotas de ...'), sin rodeos ni explicaciones técnicas a menos que te las pidan.
2. DETECCIÓN DE VEHÍCULO: Si el cliente te menciona el modelo de su camioneta o vehículo, debes sugerir de inmediato la medida estándar del mismo y confirmar educadamente si es la que está buscando. Aquí tienes las equivalencias de fábrica más comunes de Argentina:
   - Toyota SW4 / Hilux: 265/65 R17 o 265/60 R18.
   - Volkswagen Amarok: 245/65 R17, 255/60 R18 o 255/50 R20.
   - Ford Ranger: 265/65 R17, 255/70 R16 o 265/60 R18.
   - Chevrolet S10: 265/60 R18 o 245/70 R16.
   - Renault Alaskan / Nissan Frontier: 255/60 R18 o 255/70 R16.
   Si te menciona alguna de estas camionetas, dile por ejemplo: "Excelente vehículo. De fábrica suele venir con la medida [medida estándar]. ¿Tenés colocada esa medida actualmente o estás buscando otra para cambiar?".
3. CLIENTE NO SABE LA MEDIDA Y FOTOS: NO pidas fotos de neumáticos de entrada, ni si el cliente ya te dijo la medida o el modelo de su vehículo. ÚNICAMENTE debés sugerirle enviar una foto si el cliente te manifiesta de forma explícita que NO sabe qué medida tiene colocada y no tiene forma de leerla en la cubierta. En ese caso, pídele cordialmente que le saque una foto al lateral/costado de su cubierta actual donde figuren grabados los números (ancho/perfil/llanta) y te la envíe.
4. BÚSQUEDA Y PRECIOS: Utiliza la herramienta "buscar_neumaticos" para ver el stock. Cotiza siempre con amabilidad ofreciendo las opciones disponibles de forma simplificada.
5. DERIVACIÓN A KARIM: Si detectas molestia en el cliente, si te solicita hablar por teléfono ("llamame", "¿te puedo llamar?"), si consulta por 8 o más cubiertas (flota), o si está decidido a realizar el pago o coordinar la reserva, indícale amablemente que ya mismo lo derivás con Karim (el encargado principal de ventas) para finalizar todo por teléfono o chat privado de forma preferencial.
6. REGISTRO DE DATOS: Siempre que el cliente te mencione el modelo/año de su vehículo o la medida de neumático que busca, debés llamar inmediatamente a la herramienta "actualizar_datos_cliente" para registrar esta información en la base de datos.
`;


export class OpenAIService {
  async generateResponse(userMessage: string, history: any[] = [], conversationId?: string) {
    let messages: any[] = [
      { role: "system", content: SYSTEM_INSTRUCTION },
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
              description: "Busca neumáticos por medida (ej: 265 65 17), marca o modelo en el catálogo.",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string", description: "Término de búsqueda" },
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
            const numbers = query.match(/\d+/g) || [];
            
            const results = (catalog as any[]).filter(item => {
              const itemStr = JSON.stringify(item).toLowerCase();
              if (numbers.length >= 2) {
                return numbers.every((n: string) => itemStr.includes(n));
              }
              return itemStr.includes(query.toLowerCase());
            }).slice(0, 10);

            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(results),
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

        return finalResponse.choices[0].message.content || "Perdón, me distraje. ¿Me repetís?";
      }

      return message.content || "¡Hola! ¿En qué puedo ayudarte?";

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

