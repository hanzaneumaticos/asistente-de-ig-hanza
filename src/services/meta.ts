import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN?.trim() || "";
const API_VERSION = "v19.0";

export class MetaService {
  async sendWhatsAppMessage(to: string, message: string) {
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || "";
    const url = `https://graph.facebook.com/${API_VERSION}/${phoneId}/messages`;
    
    // CORRECCIÓN PARA ARGENTINA EN SANDBOX:
    // Si viene en formato 54911... (13 dígitos), removemos el '9' intermedio para transformarlo en 5411... (12 dígitos)
    // Esto es debido a que Meta Sandbox requiere el número sin el '9' para coincidir con la lista de autorizados.
    let formattedTo = to.trim();
    if (formattedTo.startsWith("549") && formattedTo.length === 13) {
      formattedTo = "54" + formattedTo.substring(3);
    }

    try {
      await axios.post(
        url,
        {
          messaging_product: "whatsapp",
          to: formattedTo,
          type: "text",
          text: { body: message.replace(/[¿¡]/g, "") },
        },
        {
          headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` },
        }
      );
    } catch (error: any) {
      console.error("Error sending WhatsApp message:", error.response?.data || error.message);
    }
  }

  async sendInstagramMessage(recipientId: string, message: string) {
    const url = `https://graph.facebook.com/${API_VERSION}/me/messages`;
    try {
      await axios.post(
        url,
        {
          recipient: { id: recipientId },
          message: { text: message.replace(/[¿¡]/g, "") },
        },
        {
          headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` },
        }
      );
    } catch (error: any) {
      console.error("Error sending Instagram message:", error.response?.data || error.message);
    }
  }

  async getMediaUrl(mediaId: string): Promise<string> {
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || "";
    const url = `https://graph.facebook.com/${API_VERSION}/${mediaId}`;
    try {
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` }
      });
      return res.data.url;
    } catch (error: any) {
      console.error("Error fetching media URL from Meta:", error.response?.data || error.message);
      throw error;
    }
  }

  async downloadMedia(url: string): Promise<Buffer> {
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` },
      responseType: "arraybuffer",
    });
    return Buffer.from(response.data);
  }
}

export const metaService = new MetaService();

