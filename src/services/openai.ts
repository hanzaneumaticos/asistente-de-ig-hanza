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
   - OBLIGACIÓN DE BÚSQUEDA REAL: NUNCA ofrezcas opciones de cubiertas, medidas, marcas, modelos o precios de memoria. Para responder cualquier consulta sobre cubiertas, marcas, precios o vehículos, debés llamar OBLIGATORIAMENTE a la herramienta "buscar_neumaticos" para corroborar qué es compatible y qué hay en stock en el catálogo antes de dar cualquier respuesta.
   - Si el cliente te pregunta por cubiertas para un vehículo (ej: una Trafic, una Amarok o cualquier auto) pero no especifica la medida exacta de cubierta, lo primero que debés hacer es preguntarle amablemente si sabe qué medida tiene colocada actualmente (ej: "tenes idea que medida tiene puesta?", "sabes que medida de cubierta lleva ahora?").
   - Si el cliente te responde indicando la medida, buscala directamente con la herramienta.
   - Si el cliente te dice que no sabe la medida, ahí recién intentás averiguar:
     - Si la camioneta está en el sistema y tiene medidas típicas registradas (provistas por la herramienta), decile las opciones.
     - Si es un rodado o vehículo que no conocemos (la herramienta de búsqueda devuelve '{"escalate": true}'), debés responderle amistosamente que lo vas a consultar y en unos minutos le confirmás (ej: "dejame que consulte bien que medida lleva y te confirmo en un ratito!"). El bot se silenciará en segundo plano.
    - VERIFICACIÓN DEL CLIENTE: Siempre que ofrezcas o sugieras una medida de cubierta (porque el cliente te preguntó qué medida lleva, porque te dijo que no sabe cuál tiene, o porque te consulta la medida original de su vehículo), debés pasarle la información de stock y precios pero obligatoriamente pedirle que corrobore en el lateral de su cubierta actual para estar 100% seguros y no venderle algo que no le vaya (ej: "igual por las dudas fijate en el costado de tu cubierta si es esa medida, asi estamos seguros y no le erramos", "pasame la medida que dice en el costado de tu rueda actual para confirmar 100%"). No cierres ventas ni confirmes pedidos sin que el cliente haya corroborado físicamente su medida.
    - NUNCA inventes ni recomiendes medidas que no correspondan al vehículo del cliente.
   - Si la herramienta te responde con '{"incompatible": true}', significa que esa medida no va en su vehículo. Debés decirle con tu tono relajado que esa medida no es la que lleva su camioneta y ofrecerle las que sí van (provistas por la herramienta).
   - Si no hay en stock la medida compatible exacta, no inventes ni ofrezcas otra medida incompatible. Decile con naturalidad que no te quedó stock de esa medida exacta.
5. CLIENTE NO SABE LA MEDIDA: NO pidas fotos de entrada. Sugerí enviar foto solo si el cliente dice explícitamente que no sabe la medida y no la encuentra.
6. DERIVACIÓN A KARIM: Si quiere pagar, reservar, hablar por teléfono, o si compra más de 8 cubiertas, indícale amablemente que lo derivás con Karim.
7. REGISTRO DE DATOS: Siempre que te mencionen vehículo o medida, llamá a la herramienta "actualizar_datos_cliente".
8. PRIORIZACIÓN Y PRESENTACIÓN DE PRECIOS:
   - LÍMITE DE UN MODELO POR MARCA: De entrada, NUNCA ofrezcas más de un modelo de cubierta por marca. Ofrece únicamente la de mayor prioridad que haya en stock.
   - PRIORIDAD DE MARCA: Si vas a ofrecer o pasar opciones de ambas marcas (Michelin y BF Goodrich), dale prioridad absoluta a BF Goodrich. Menciónala y ofrécela siempre primero.
   - PRIORIDAD DE MODELOS BF GOODRICH: Dentro de BF Goodrich, ofrece únicamente el modelo KO3 si hay stock disponible. Si no hay KO3 en stock, ofrece únicamente el modelo Trail Terrain. NUNCA ofrezcas ambos modelos de entrada.
   - PRIORIDAD DE MODELOS MICHELIN: Ofrece únicamente un solo modelo (el principal en stock).
   - OFERTA DE ALTERNATIVAS: Solo si el cliente consulta por otro modelo, pide algo más económico o solicita explícitamente más opciones, buscas en el catálogo y le pasas las alternativas.
   - MENSAJES DE PRECIOS TOTALMENTE AISLADOS (CRÍTICO): Cada opción de precio de cubierta debe ir en un párrafo estrictamente independiente y no debe contener ningún otro tipo de texto (como detalles de envío, saludos, cierres o preguntas). El párrafo que contiene el precio debe contener ÚNICAMENTE la marca, modelo, medida y precio de la cubierta.
   - SEPARACIÓN DE MENSAJES (CRÍTICO): Debés estructurar tu respuesta en párrafos independientes separados estrictamente por dos saltos de línea (\n\n) para que el sistema los envíe como burbujas de WhatsApp individuales. Si es necesario podés enviar 3, 4 o hasta un máximo absoluto de 5 mensajes en total (NUNCA superes el límite de 5 burbujas de mensajes):
     - Párrafo de precio de BF Goodrich aislado (KO3 primero, o en su defecto Trail Terrain).
     - Párrafo de precio de Michelin aislado.
     - Párrafo con información de envíos gratis únicamente.
     - Párrafo final con la pregunta de seguimiento estratégica (vendedor experto).

9. ESTRATEGIA DE VENTAS Y SEGUIMIENTO ACTIVO (CRÍTICO):
   - NUNCA uses frases de cierre plano como "Cualquier cosa decime", "Avisame cualquier duda", "Cualquier duda a tu disposición" o similares, ya que cortan la conversación con el cliente de forma prematura.
   - Actúa como un experto en ventas de mostrador: debes estar dispuesto a continuar el diálogo y guiar al cliente de forma sutil y amigable.
   - Para mantener el contacto vivo, haz una pregunta de seguimiento estratégica al final de tu respuesta (solo una pregunta, nunca acumules varias preguntas en el mismo mensaje):
     - Si no conocés su nombre: "¿Cómo es tu nombre?"
     - Si no conocés su ubicación: "¿De qué zona sos?" (para coordinar el envío gratis o retiro).
     - Si no conocés su camioneta/vehículo exacto: "¿Para qué camioneta las estás buscando?"
     - Preguntarle si es el modelo que tenía pensado colocarle o si le da un uso más de ruta o de ripio/offroad para asesorarlo mejor.
   - Dosifica las preguntas a lo largo del chat, guardándote cartas bajo la manga para no abrumar al cliente pero siempre dándole pie a que te responda algo.
   - Si el cliente demuestra explícitamente que no tiene interés, no insistas. Pero mientras responda, mantén la interacción abierta con preguntas adecuadas.
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
                  vehicle: { type: "string", description: "Marca y/o modelo del vehículo si fue mencionado (ej: 'Trafic', 'Amarok', 'Hilux')." },
                  rim: { type: "integer", description: "Tamaño del rodado/llanta si fue mencionado (ej: 15, 20)." }
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
            let argVeh = args.vehicle ? args.vehicle.trim() : null;
            let argRim = args.rim ? parseInt(args.rim, 10) : null;
            if (argRim && (argRim < 12 || argRim > 24)) argRim = null;

            // Normalizar el vehículo si es reconocido, sino mantener la cadena cruda
            let normalizedArgVeh = argVeh ? (detectVehicle(argVeh) || argVeh) : null;

            let detectedVeh = normalizedArgVeh || detectVehicle(query) || detectVehicle(userMessage);
            let detectedR = argRim || detectRim(query) || detectRim(userMessage);

            const hasNewVehicleMention = !!argVeh || !!detectVehicle(query) || !!detectVehicle(userMessage);
            const hasNewRimMention = !!argRim || !!detectRim(query) || !!detectRim(userMessage);

            if (conversationId) {
              try {
                const conv = await dbService.getConversation(conversationId);
                if (conv) {
                  // Solo usar base de datos si no se mencionó nada nuevo en el mensaje actual
                  if (!detectedVeh && !hasNewVehicleMention && conv.vehicle_info) {
                    detectedVeh = detectVehicle(conv.vehicle_info) || conv.vehicle_info;
                  }
                  if (!detectedR && !hasNewRimMention && conv.tire_size_searched) {
                    detectedR = detectRim(conv.tire_size_searched);
                  }
                }
              } catch (e) {
                console.error("Error reading context for tool:", e);
              }
            }

            // Buscar en el historial
            if (!detectedVeh && !hasNewVehicleMention) {
              for (let i = history.length - 1; i >= 0; i--) {
                const m = detectVehicle(history[i].content);
                if (m) {
                  detectedVeh = m;
                  break;
                }
              }
            }
            if (!detectedR && !hasNewRimMention) {
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
                    // Silenciar bot y forzar que guarde el vehículo nuevo detectado en la DB para el panel
                    await dbService.updateConversationDetails(conversationId, { 
                      bot_enabled: false,
                      vehicle_info: detectedVeh,
                      tire_size_searched: detectedR ? `Rodado ${detectedR}` : undefined
                    });
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

  async summarizeConversation(history: { role: string; content: string }[]): Promise<{ summary: string; location: string }> {
    try {
      if (history.length === 0) {
        return { summary: "Sin mensajes aún.", location: "No especificada" };
      }
      
      const formattedHistory = history.map(h => `${h.role === 'user' ? 'Cliente' : 'Hancita'}: ${h.content}`).join("\n");
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Analiza la conversación de WhatsApp/Instagram adjunta entre un cliente de "Hanza Neumáticos" y Hancita.
Debes extraer:
1. Un resumen súper breve (máximo 1 o 2 líneas) de lo que busca el cliente y en qué estado está (ej: "Busca cubiertas para Hilux rodado 17, consultó precio de Michelin y está decidiendo").
2. La ubicación/zona del cliente si la mencionó en sus mensajes (ej: "Lomas de Zamora", "Avellaneda"). Si no la mencionó, pon "No especificada".

Responde ÚNICAMENTE con un objeto JSON en este formato:
{
  "summary": "resumen aquí",
  "location": "ubicación aquí"
}`
          },
          {
            role: "user",
            content: formattedHistory
          }
        ],
        response_format: { type: "json_object" }
      });
      
      const content = response.choices[0].message.content || "{}";
      const parsed = JSON.parse(content);
      return {
        summary: parsed.summary || "No se pudo generar el resumen.",
        location: parsed.location || "No especificada"
      };
    } catch (error) {
      console.error("Error in summarizeConversation:", error);
      return { summary: "Error al generar resumen.", location: "No especificada" };
    }
  }

  async processAdminResponse(adminResponse: string, vehicle: string, rim: string): Promise<{ extracted_tire_size: string | null; client_response: string }> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Eres el asistente administrativo de "Hanza Neumáticos". Karim (el dueño/administrador) te da una indicación en lenguaje natural para responder una consulta sobre un vehículo.
El vehículo consultado es: "${vehicle}"
El rodado/llanta consultado es: "${rim}"

Tus tareas:
1. Extraer del texto de Karim la medida exacta de cubierta compatible si la menciona (ej: "255/50 R20", "225 45 17"). Debe tener formato estándar "ANCHO/PERFIL RLLANTA" (ej: "255/50 R20"). Si Karim no indica una medida exacta de cubierta, devuelve null en ese campo.
2. Redactar el mensaje para el cliente en el tono exacto de Karim:
   - Sé directo, relajado y amigable (como un vendedor de gomería en Lomas de Zamora).
   - Usa el voseo argentino ("tenes", "sos", "fijate", "avisame").
   - NUNCA uses los signos de interrogación o exclamación de apertura (¿ o ¡).
   - PRIORIZACIÓN Y PRESENTACIÓN DE PRECIOS (CRÍTICO):
     - LÍMITE DE UN MODELO POR MARCA: De entrada, nunca ofrezcas más de un modelo de cubierta por marca. Ofrece únicamente la de mayor prioridad.
     - PRIORIDAD DE MARCA: Si vas a ofrecer o pasar opciones de ambas marcas (Michelin y BF Goodrich), ofrece siempre BF Goodrich primero y Michelin segundo.
     - PRIORIDAD DE MODELOS BF GOODRICH: Dentro de BF Goodrich, ofrece únicamente el modelo KO3 si hay stock disponible. Si no hay KO3 en stock, ofrece únicamente el modelo Trail Terrain. Nunca ofrezcas ambos modelos de entrada.
     - PRIORIDAD DE MODELOS MICHELIN: Ofrece únicamente un modelo (el principal disponible).
     - OFERTA DE ALTERNATIVAS: Solo si el cliente solicita "algo más económico", "otro modelo" o solicita más opciones, puedes ofrecer alternativas adicionales.
     - MENSAJES DE PRECIOS TOTALMENTE AISLADOS (CRÍTICO): Cada opción de precio de cubierta debe ir en un párrafo estrictamente independiente y no debe contener ningún otro tipo de texto (como detalles de envío, cierres o preguntas). El párrafo que contiene el precio debe contener ÚNICAMENTE la marca, modelo, medida y precio de la cubierta.
     - SEPARACIÓN DE MENSAJES: Debes estructurar tu respuesta en párrafos independientes separados estrictamente por dos saltos de línea (\\n\\n) para que el sistema los envíe como burbujas de chat individuales. Si es necesario podés enviar 3, 4 o hasta un máximo absoluto de 5 mensajes en total (NUNCA superes el límite de 5 burbujas de mensajes):
       - Párrafo de precio de BF Goodrich aislado.
       - Párrafo de precio de Michelin aislado.
       - Párrafo con información de envíos gratis únicamente.
       - Párrafo final con la pregunta de seguimiento estratégica (vendedor experto) y la solicitud de corroborar la medida en el lateral de su rueda (ej: "igual por las dudas mirá el costado de tu cubierta para confirmar. Como es tu nombre?").
   - ESTRATEGIA DE VENTAS Y SEGUIMIENTO ACTIVO (CRÍTICO):
     - NUNCA uses frases de cierre plano como "Cualquier cosa decime", "Avisame cualquier duda", "Cualquier duda a tu disposición" o similares, ya que cortan la conversación con el cliente de forma prematura.
     - Actúa como un experto en ventas de mostrador: debes estar dispuesto a continuar el diálogo y guiar al cliente de forma sutil y amigable.
     - Para mantener el contacto vivo, haz una pregunta de seguimiento estratégica al final de tu respuesta (solo una pregunta, nunca acumules varias preguntas en el mismo mensaje):
       - Si no conocés su nombre: "¿Cómo es tu nombre?"
       - Si no conocés su ubicación: "¿De qué zona sos?" (para coordinar el envío gratis o retiro).
       - Si no conocés su camioneta/vehículo exacto: "¿Para qué camioneta las estás buscando?"
       - Preguntarle si es el modelo que tenía pensado colocarle o si le da un uso más de ruta o de ripio/offroad para asesorarlo mejor.

Responde ÚNICAMENTE con un objeto JSON en este formato:
{
  "extracted_tire_size": "ANCHO/PERFIL RLLANTA" o null,
  "client_response": "texto redactado para enviar al cliente"
}`
          },
          {
            role: "user",
            content: adminResponse
          }
        ],
        response_format: { type: "json_object" }
      });

      const content = response.choices[0].message.content || "{}";
      const parsed = JSON.parse(content);
      return {
        extracted_tire_size: parsed.extracted_tire_size || null,
        client_response: parsed.client_response || "Hola! Ahi te averiguo bien."
      };
    } catch (error) {
      console.error("Error in processAdminResponse:", error);
      return {
        extracted_tire_size: null,
        client_response: "Dejame que consulte bien y te confirmo en un ratito."
      };
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

