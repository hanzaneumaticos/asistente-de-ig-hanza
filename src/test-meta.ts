import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || "";
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const TO_NUMBER = "5491166061827";

async function testMeta() {
  console.log("=== PROBANDO ENVIO DE MENSAJE META ===");
  console.log(`Phone ID: ${WHATSAPP_PHONE_NUMBER_ID}`);
  console.log(`To Number: ${TO_NUMBER}`);

  const url = `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

  // Aplicar la misma regla de formato que tiene meta.ts
  let formattedTo = TO_NUMBER.trim();
  if (formattedTo.startsWith("549") && formattedTo.length === 13) {
    formattedTo = "54" + formattedTo.substring(3);
  }
  console.log(`Formatted To: ${formattedTo}`);

  try {
    const res = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        to: formattedTo,
        type: "text",
        text: { body: "Hola, esto es una prueba de envío directo desde el servidor para verificar la conexión con WhatsApp." },
      },
      {
        headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` },
      }
    );
    console.log("✅ Success! Meta Response:", JSON.stringify(res.data, null, 2));
  } catch (error: any) {
    console.error("❌ Error sending message:");
    if (error.response) {
      console.error(JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

testMeta();
