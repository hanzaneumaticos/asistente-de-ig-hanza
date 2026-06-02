import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import path from "path";
import * as dotenv from "dotenv";
import { aiService } from "./services/openai";
import { metaService } from "./services/meta";
import { dbService } from "./services/supabase";

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
      dbService.updateConversationDetails(conversationId, updates).catch(err => {
        console.error("Error in background updateConversationDetails:", err);
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
          await dbService.saveMessage(conv.id, "user", "[Envió una nota de voz]", "audio");
          await metaService.sendWhatsAppMessage(from, "He recibido tu audio, dame un segundo que lo escucho...");
          
          // Transcripción futura e integración Whisper vendrán aquí
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
        }
      } catch (error) {
        console.error("Error processing IG message:", error);
      }
    }
    return res.sendStatus(200);
  }

  res.sendStatus(404);
});

app.listen(PORT, () => {
  console.log(`Hanza AI Assistant listening on port ${PORT}`);
});
