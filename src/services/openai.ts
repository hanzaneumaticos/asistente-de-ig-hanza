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
1. DETECCIÓN DE VEHÍCULO: Si el cliente te menciona el modelo de su camioneta o vehículo, debes sugerir de inmediato la medida estándar del mismo y confirmar educadamente si es la que está buscando. Aquí tienes las equivalencias de fábrica más comunes de Argentina:
   - Toyota SW4 / Hilux: 265/65 R17 (estándar común) o 265/60 R18 (en versiones más nuevas).
   - Volkswagen Amarok: 245/65 R17, 255/60 R18 o 255/50 R20.
   - Ford Ranger: 265/65 R17, 255/70 R16 o 265/60 R18.
   - Chevrolet S10: 265/60 R18 o 245/70 R16.
   - Renault Alaskan / Nissan Frontier: 255/60 R18 o 255/70 R16.
   Si te menciona alguna de estas camionetas, dile por ejemplo: "Excelente vehículo. De fábrica suele venir con la medida [medida estándar]. ¿Tenés colocada esa medida actualmente o estás buscando otra para cambiar?".
2. CLIENTE NO SABE LA MEDIDA: Si el cliente no sabe qué medida tiene colocada su camioneta, pídele cordialmente que le saque una foto al lateral/costado de su cubierta actual donde figuren grabados los números (ancho/perfil/llanta) y te la envíe por acá para fijarte y asesorarlo perfectamente.
3. BÚSQUEDA Y PRECIOS: Utiliza la herramienta "buscar_neumaticos" para ver el stock. Cotiza siempre con amabilidad ofreciendo las opciones disponibles (menciona el precio de contado como un precio especial bonificado en efectivo, y también la opción en 6 cuotas o con tarjeta).
4. DERIVACIÓN A KARIM: Si detectas molestia en el cliente, si te solicita hablar por teléfono ("llamame", "¿te puedo llamar?"), si consulta por 8 o más cubiertas (flota), o si está decidido a realizar el pago o coordinar la reserva, indícale amablemente que ya mismo lo derivás con Karim (el encargado principal de ventas) para finalizar todo por teléfono o chat privado de forma preferencial.
5. REGISTRO DE DATOS: Siempre que el cliente te mencione el modelo/año de su vehículo o la medida de neumático que busca, debés llamar inmediatamente a la herramienta "actualizar_datos_cliente" para registrar esta información en la base de datos.
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
                const updated = await dbService.updateConversationDetails(conversationId, updates);
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
}

export const aiService = new OpenAIService();
