import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import cors from "cors";
import path from "path";
import * as dotenv from "dotenv";
import { aiService } from "./services/openai";
import { metaService } from "./services/meta";
import { dbService, supabase } from "./services/supabase";
import catalog from "../catalog.json";
import { saveLearnedCompatibility, parseTireSize } from "./services/tireCompatibility";


dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "admin.html"));
});

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || "smart_hanza_verify_token";

// --- Webhook Verification (for Meta) ---
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// Helper para dividir respuestas largas en 2 o 3 mensajes naturales
function splitIntoMessages(text: string): string[] {
  const paragraphs = text.split(/\n+/).map(p => p.trim()).filter(Boolean);
  const messages: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length < 220) {
      messages.push(paragraph);
    } else {
      const sentences = paragraph.match(/[^.!?]+[.!?]+(\s|$)/g) || [paragraph];
      let currentMessage = "";
      for (const sentence of sentences) {
        if ((currentMessage + sentence).length < 220) {
          currentMessage += (currentMessage ? " " : "") + sentence.trim();
        } else {
          if (currentMessage) messages.push(currentMessage);
          currentMessage = sentence.trim();
        }
      }
      if (currentMessage) messages.push(currentMessage);
    }
  }

  if (messages.length > 3) {
    const finalMessages = [
      messages[0],
      messages[1],
      messages.slice(2).join(" ")
    ];
    return finalMessages.filter(Boolean);
  }

  return messages.filter(Boolean);
}

// Extraer y guardar detalles (vehículo y medida de neumático) en segundo plano
function extractAndSaveDetails(conversationId: string, text: string) {
  try {
    const tireMatch = text.match(/(\d{3})[\/\s-]?(\d{2})[\/\s-]?R?(\d{2})/i);
    let tire_size_searched = undefined;
    if (tireMatch) {
      tire_size_searched = `${tireMatch[1]}/${tireMatch[2]} R${tireMatch[3]}`.toUpperCase();
    }

    const vehicles = ["corolla", "hilux", "sw4", "amarok", "ranger", "s10", "alaskan", "frontier", "toro", "cronos", "etios", "focus", "fiesta", "cruze", "tracker", "compass", "renegade", "duster", "sandero", "civic", "fit", "hr-v", "hrv", "golf", "vento", "polo"];
    let vehicle_info = undefined;
    
    const textLower = text.toLowerCase();
    for (const v of vehicles) {
      if (textLower.includes(v)) {
        const yearMatch = text.match(/\b(20\d{2})\b/);
        const year = yearMatch ? yearMatch[1] : "";
        const nameCapitalized = v.charAt(0).toUpperCase() + v.slice(1);
        vehicle_info = year ? `${nameCapitalized} ${year}` : nameCapitalized;
        break;
      }
    }

    if (tire_size_searched || vehicle_info) {
      const updates: any = {};
      if (tire_size_searched) updates.tire_size_searched = tire_size_searched;
      if (vehicle_info) updates.vehicle_info = vehicle_info;
      dbService.appendConversationDetails(conversationId, updates).catch(err => {
        console.error("Error in background appendConversationDetails:", err);
      });
    }
  } catch (err) {
    console.error("Error in extractAndSaveDetails:", err);
  }
}

// --- Simulator API ---
app.post("/api/chat", async (req, res) => {
  const { message, contactId = "simulador_cliente", contactName = "Cliente Simulador", delayMs } = req.body;
  try {
    // 1. Obtener o crear conversación en Supabase
    const conv = await dbService.getOrCreateConversation(contactId, "whatsapp", contactName);
    if (!conv) {
      return res.status(500).json({ error: "No se pudo iniciar la conversación en Supabase." });
    }

    // 2. Si el bot está apagado por control manual, avisar al simulador
    if (!conv.bot_enabled) {
      return res.json({ 
        responses: ["⚠️ Hancita está silenciada. (Control Manual Activado)"], 
        botSilenced: true 
      });
    }

    // 3. Guardar el mensaje del usuario en la base de datos
    await dbService.saveMessage(conv.id, "user", message || "");

    // Extraer y guardar detalles en segundo plano
    extractAndSaveDetails(conv.id, message || "");

    // 4. Obtener el historial completo real de Supabase
    const dbHistory = await dbService.getMessageHistory(conv.id, 15);
    
    // 5. Simular delay si está configurado
    if (delayMs && typeof delayMs === "number" && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    // 6. Generar respuesta de la IA
    const response = await aiService.generateResponse(message || "", dbHistory, conv.id);
    
    // 7. Guardar respuesta de la IA en la base de datos
    await dbService.saveMessage(conv.id, "assistant", response || "");
    
    // 8. Dividir la respuesta larga en mensajes individuales
    const individualResponses = splitIntoMessages(response || "");
    
    res.json({ responses: individualResponses, botSilenced: false });
  } catch (error: any) {
    console.error("Error in /api/chat simulator:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- Webhook Handling ---
app.post("/webhook", async (req, res) => {
  const body = req.body;
  console.log("Raw Webhook POST received:", JSON.stringify(body));

  // Handle WhatsApp messages
  if (body.object === "whatsapp_business_account") {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];
    const contact = value?.contacts?.[0];

    if (message) {
      const from = message.from;
      const type = message.type;
      const contactName = contact?.profile?.name || "Cliente de WhatsApp";

      try {
        // 1. Obtener o crear conversación en Supabase
        const conv = await dbService.getOrCreateConversation(from, "whatsapp", contactName);
        if (!conv) {
          console.error(`Error: No se pudo obtener conversación para ${from}`);
          return res.sendStatus(200);
        }

        // 2. Si el bot está silenciado para esta conversación, ignorar
        if (!conv.bot_enabled) {
          console.log(`[Manual Mode] Bot silenciado para ${from}. Ignorando respuesta automática.`);
          // Igualmente guardamos el mensaje del usuario en el historial para el panel
          if (type === "text") {
            await dbService.saveMessage(conv.id, "user", message.text.body);
          } else {
            await dbService.saveMessage(conv.id, "user", `[Envió un mensaje de tipo: ${type}]`);
          }
          return res.sendStatus(200);
        }

        if (type === "text") {
          const text = message.text.body;
          console.log(`WhatsApp text from ${from}: ${text}`);

          // Guardar mensaje entrante
          await dbService.saveMessage(conv.id, "user", text);

          // Extraer y guardar detalles en segundo plano
          extractAndSaveDetails(conv.id, text);

          // Obtener historial
          const dbHistory = await dbService.getMessageHistory(conv.id, 15);

          // Generar respuesta
          const aiResponse = await aiService.generateResponse(text || "", dbHistory, conv.id);
          
          // Guardar respuesta saliente
          await dbService.saveMessage(conv.id, "assistant", aiResponse || "");

          // Dividir respuestas
          const individualResponses = splitIntoMessages(aiResponse || "");

          // Enviar cada respuesta con delay humano mínimo entre ellas
          for (let i = 0; i < individualResponses.length; i++) {
            await metaService.sendWhatsAppMessage(from, individualResponses[i]);
            if (i < individualResponses.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5s entre burbujas
            }
          }

        } else if (type === "audio") {
          console.log(`WhatsApp audio from ${from}`);
          await metaService.sendWhatsAppMessage(from, "He recibido tu audio, dame un segundo que lo escucho...");
          
          const mediaId = message.audio?.id;
          const mimeType = message.audio?.mime_type || "audio/ogg";
          
          if (mediaId) {
            try {
              const audioUrl = await metaService.getMediaUrl(mediaId);
              const audioBuffer = await metaService.downloadMedia(audioUrl);
              const transcription = await aiService.transcribeAudio(audioBuffer, mimeType);
              console.log(`Whisper transcription: "${transcription}"`);
              
              if (transcription && transcription.trim().length > 0) {
                await dbService.saveMessage(conv.id, "user", `[Audio]: ${transcription}`, "audio");
                extractAndSaveDetails(conv.id, transcription);
                
                const dbHistory = await dbService.getMessageHistory(conv.id, 15);
                const aiResponse = await aiService.generateResponse(transcription, dbHistory, conv.id);
                await dbService.saveMessage(conv.id, "assistant", aiResponse || "");
                
                const individualResponses = splitIntoMessages(aiResponse || "");
                for (let i = 0; i < individualResponses.length; i++) {
                  await metaService.sendWhatsAppMessage(from, individualResponses[i]);
                  if (i < individualResponses.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                  }
                }
              } else {
                await metaService.sendWhatsAppMessage(from, "Disculpá, no logré escuchar bien tu audio. ¿Me lo podrías escribir en texto?");
              }
            } catch (err) {
              console.error("Error processing WhatsApp audio with Whisper:", err);
              await metaService.sendWhatsAppMessage(from, "Disculpá, tuve un problema al escuchar tu nota de voz. ¿Me la podrías escribir en texto?");
            }
          }
        } else if (type === "image") {
          console.log(`WhatsApp image from ${from}`);
          await dbService.saveMessage(conv.id, "user", "[Envió una imagen]", "image");
          
          const mediaId = message.image?.id;
          if (mediaId) {
            try {
              // Obtener URL de la imagen y descargarla
              const imageUrl = await metaService.getMediaUrl(mediaId);
              const imageBuffer = await metaService.downloadMedia(imageUrl);
              
              // Analizar imagen con GPT-4o Vision
              const detectedSize = await aiService.analyzeTireImage(imageBuffer);
              console.log(`OpenAI detected tire size: ${detectedSize}`);
              
              if (detectedSize && detectedSize !== "NO_DETECTADO") {
                // Notificar al cliente que se detectó la medida
                await metaService.sendWhatsAppMessage(
                  from,
                  `¡Buenísimo! Detecté que tu neumático es medida *${detectedSize}* en la foto. Dejame buscarte las opciones disponibles...`
                );
                
                // Actualizar la conversación en Supabase (agregando la medida)
                await dbService.appendConversationDetails(conv.id, { tire_size_searched: detectedSize });
                
                // Simular respuesta usando la medida detectada
                const dbHistory = await dbService.getMessageHistory(conv.id, 15);
                const aiResponse = await aiService.generateResponse(detectedSize, dbHistory, conv.id);
                
                // Guardar y enviar la respuesta
                await dbService.saveMessage(conv.id, "assistant", aiResponse || "");
                const individualResponses = splitIntoMessages(aiResponse || "");
                for (let i = 0; i < individualResponses.length; i++) {
                  await metaService.sendWhatsAppMessage(from, individualResponses[i]);
                  if (i < individualResponses.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                  }
                }
              } else {
                // No detectado
                await metaService.sendWhatsAppMessage(
                  from,
                  "No logré ver con total claridad la medida grabada en el lateral de la foto. ¿Me la podrías escribir por acá? (Ejemplo: 205/55 R16)."
                );
              }
            } catch (err) {
              console.error("Error processing WhatsApp image with vision:", err);
              await metaService.sendWhatsAppMessage(
                from,
                "Tuve un problema al procesar la imagen. ¿Me podrías escribir la medida por acá? (Ejemplo: 205/55 R16)."
              );
            }
          }
        }
      } catch (error) {
        console.error("Error processing WhatsApp message:", error);
      }
    }
    return res.sendStatus(200);
  }

  // Handle Instagram messages
  if (body.object === "instagram") {
    const entry = body.entry?.[0];
    const messaging = entry?.messaging?.[0];
    const senderId = messaging?.sender?.id;
    const message = messaging?.message;

    if (message && senderId) {
      try {
        const conv = await dbService.getOrCreateConversation(senderId, "instagram", "Cliente de Instagram");
        if (!conv) {
          console.error(`Error: No se pudo obtener conversación para IG ${senderId}`);
          return res.sendStatus(200);
        }

        if (!conv.bot_enabled) {
          console.log(`[Manual Mode] Bot silenciado para IG ${senderId}. Ignorando.`);
          if (message.text) {
            await dbService.saveMessage(conv.id, "user", message.text);
          }
          return res.sendStatus(200);
        }

        if (message.text) {
          console.log(`IG text from ${senderId}: ${message.text}`);
          await dbService.saveMessage(conv.id, "user", message.text);

          // Extraer y guardar detalles en segundo plano
          extractAndSaveDetails(conv.id, message.text);

          const dbHistory = await dbService.getMessageHistory(conv.id, 15);
          const aiResponse = await aiService.generateResponse(message.text || "", dbHistory, conv.id);
          await dbService.saveMessage(conv.id, "assistant", aiResponse || "");

          const individualResponses = splitIntoMessages(aiResponse || "");
          for (let i = 0; i < individualResponses.length; i++) {
            await metaService.sendInstagramMessage(senderId, individualResponses[i]);
            if (i < individualResponses.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 1500));
            }
          }
        } else if (message.attachments) {
          const imgAttachment = message.attachments.find((att: any) => att.type === "image");
          const audioAttachment = message.attachments.find((att: any) => att.type === "audio" || att.type === "voice");
          
          if (imgAttachment) {
            const imageUrl = imgAttachment.payload.url;
            console.log(`IG image from ${senderId}: ${imageUrl}`);
            await dbService.saveMessage(conv.id, "user", "[Envió una imagen]", "image");
            
            try {
              const imageBuffer = await metaService.downloadMedia(imageUrl);
              const detectedSize = await aiService.analyzeTireImage(imageBuffer);
              console.log(`OpenAI detected tire size from IG image: ${detectedSize}`);
              
              if (detectedSize && detectedSize !== "NO_DETECTADO") {
                await metaService.sendInstagramMessage(
                  senderId,
                  `¡Buenísimo! Detecté que tu neumático es medida *${detectedSize}* en la foto. Dejame buscarte las opciones disponibles...`
                );
                
                await dbService.appendConversationDetails(conv.id, { tire_size_searched: detectedSize });
                
                const dbHistory = await dbService.getMessageHistory(conv.id, 15);
                const aiResponse = await aiService.generateResponse(detectedSize, dbHistory, conv.id);
                await dbService.saveMessage(conv.id, "assistant", aiResponse || "");
                
                const individualResponses = splitIntoMessages(aiResponse || "");
                for (let i = 0; i < individualResponses.length; i++) {
                  await metaService.sendInstagramMessage(senderId, individualResponses[i]);
                  if (i < individualResponses.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                  }
                }
              } else {
                await metaService.sendInstagramMessage(
                  senderId,
                  "No logré ver con total claridad la medida grabada en el lateral de la foto. ¿Me la podrías escribir por acá? (Ejemplo: 205/55 R16)."
                );
              }
            } catch (err) {
              console.error("Error processing IG image with vision:", err);
              await metaService.sendInstagramMessage(
                senderId,
                "Tuve un problema al procesar la imagen. ¿Me podrías escribir la medida por acá? (Ejemplo: 205/55 R16)."
              );
            }
          } else if (audioAttachment) {
            const audioUrl = audioAttachment.payload.url;
            console.log(`IG audio from ${senderId}: ${audioUrl}`);
            await metaService.sendInstagramMessage(senderId, "He recibido tu audio, dame un segundo que lo escucho...");
            
            try {
              const audioBuffer = await metaService.downloadMedia(audioUrl);
              const transcription = await aiService.transcribeAudio(audioBuffer, "audio/m4a");
              console.log(`OpenAI transcribed IG audio: ${transcription}`);
              
              if (transcription && transcription.trim().length > 0) {
                await dbService.saveMessage(conv.id, "user", `[Audio]: ${transcription}`, "audio");
                extractAndSaveDetails(conv.id, transcription);
                
                const dbHistory = await dbService.getMessageHistory(conv.id, 15);
                const aiResponse = await aiService.generateResponse(transcription, dbHistory, conv.id);
                await dbService.saveMessage(conv.id, "assistant", aiResponse || "");
                
                const individualResponses = splitIntoMessages(aiResponse || "");
                for (let i = 0; i < individualResponses.length; i++) {
                  await metaService.sendInstagramMessage(senderId, individualResponses[i]);
                  if (i < individualResponses.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                  }
                }
              } else {
                await metaService.sendInstagramMessage(senderId, "Disculpá, no logré escuchar bien tu audio. ¿Me lo podrías escribir en texto?");
              }
            } catch (err) {
              console.error("Error processing IG audio with Whisper:", err);
              await metaService.sendInstagramMessage(senderId, "Disculpá, tuve un problema al escuchar tu nota de voz. ¿Me la podrías escribir en texto?");
            }
          }
        }
      } catch (error) {
        console.error("Error processing IG message:", error);
      }
    }
    return res.sendStatus(200);
  }

  res.sendStatus(404);
});

// --- ADMIN API ENDPOINTS ---
app.get("/api/conversations", async (req, res) => {
  try {
    const { data: conversations, error } = await supabase
      .from("conversations")
      .select("*")
      .order("last_message_at", { ascending: false });
    if (error) throw error;

    // Fetch pending consultations to merge them
    const pendingConsultations = await dbService.getPendingConsultations();

    const conversationsWithAlerts = (conversations || []).map((conv: any) => {
      const pending = pendingConsultations.find(p => p.conversation_id === conv.id);
      return {
        ...conv,
        pending_consultation: pending || null
      };
    });

    res.json(conversationsWithAlerts);
  } catch (err: any) {
    console.error("Error fetching conversations:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/conversations/:id/resolve-consultation", async (req, res) => {
  const { id } = req.params;
  const { vehicle, rim, tire_size } = req.body;

  try {
    if (!vehicle || !rim || !tire_size) {
      return res.status(400).json({ error: "Faltan datos obligatorios (vehicle, rim, tire_size)." });
    }

    // 1. Guardar/aprender compatibilidad en DB
    const learned = await saveLearnedCompatibility(vehicle, parseInt(rim, 10), tire_size);
    if (!learned) {
      return res.status(500).json({ error: "No se pudo registrar el aprendizaje de compatibilidad." });
    }

    // 2. Resolver consulta en DB
    await dbService.resolveConsultation(id);

    // 3. Reactivar bot
    await dbService.updateConversationDetails(id, { bot_enabled: true });

    // 4. Buscar neumáticos en el catálogo para esta medida
    const parsedSize = parseTireSize(tire_size);
    const results = (catalog as any[]).filter(item => {
      if (parsedSize) {
        return (
          item.Ancho === parsedSize.width &&
          item.Taco === parsedSize.aspect &&
          item.Llanta === parsedSize.rim
        );
      }
      return false;
    }).slice(0, 3);

    // 5. Formatear respuesta estilo Karim
    let responseText = `Hola! Ahi averigüe y para la ${vehicle} en rodado ${rim} lleva la medida *${tire_size}*.`;
    
    if (results.length > 0) {
      responseText += ` Tengo estas opciones de Michelin en stock:\n\n`;
      results.forEach((item, index) => {
        const price = Math.round(item["Precio con IVA"]).toLocaleString("es-AR");
        responseText += `${index + 1}. *${item.Modelo.trim()} (${item.Ancho}/${item.Taco} R${item.Llanta})* - $${price} cada uno.\n`;
      });
      responseText += `\nTodos los precios incluyen envío gratis. Te interesa alguna?`;
    } else {
      responseText += ` Por el momento no me quedo stock de esa medida exacta en Michelin ni BF Goodrich, pero te aviso apenas me entren!`;
    }

    // 6. Guardar mensaje en el historial
    await dbService.saveMessage(id, "assistant", responseText);

    // 7. Enviar mensaje a Meta según plataforma
    const conv = await dbService.getConversation(id);
    if (conv) {
      if (conv.platform === "whatsapp") {
        await metaService.sendWhatsAppMessage(conv.contact_id, responseText);
      } else if (conv.platform === "instagram") {
        await metaService.sendInstagramMessage(conv.contact_id, responseText);
      }
    }

    res.json({ success: true, responseText });
  } catch (err: any) {
    console.error("Error in /resolve-consultation:", err);
    res.status(500).json({ error: err.message });
  }
});


app.get("/api/conversations/:id/messages", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", req.params.id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/conversations/:id/toggle-bot", async (req, res) => {
  const { bot_enabled } = req.body;
  try {
    const { data, error } = await supabase
      .from("conversations")
      .update({ bot_enabled })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/conversations/:id/send-manual", async (req, res) => {
  const { message } = req.body;
  try {
    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", req.params.id)
      .single();
    if (convErr || !conv) throw new Error("Conversación no encontrada.");

    // 1. Silenciar el bot para esta conversación
    await supabase
      .from("conversations")
      .update({ bot_enabled: false })
      .eq("id", req.params.id);

    // 2. Guardar mensaje manual en la base de datos
    await dbService.saveMessage(req.params.id, "assistant", message);

    // 3. Enviar mensaje a Meta según plataforma
    if (conv.platform === "whatsapp") {
      await metaService.sendWhatsAppMessage(conv.contact_id, message);
    } else if (conv.platform === "instagram") {
      await metaService.sendInstagramMessage(conv.contact_id, message);
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error("Error sending manual message:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/test-send", async (req, res) => {
  const to = (req.query.to as string) || "5491166061827";
  const body = (req.query.body as string) || "Mensaje de prueba de conectividad directo desde el servidor de Render.";
  
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || "";
  const token = process.env.META_ACCESS_TOKEN?.trim() || "";
  const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;

  let formattedTo = to.trim();
  if (formattedTo.startsWith("549") && formattedTo.length === 13) {
    formattedTo = "54" + formattedTo.substring(3);
  }

  try {
    const response = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        to: formattedTo,
        type: "text",
        text: { body: body },
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    res.json({ success: true, formattedTo, response: response.data });
  } catch (error: any) {
    const errorDetails = error.response?.data || error.message;
    console.error("Test send error details:", errorDetails);
    res.status(500).json({ success: false, formattedTo, error: errorDetails });
  }
});

app.listen(PORT, () => {
  console.log(`Hanza AI Assistant listening on port ${PORT}`);
});
