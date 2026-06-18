import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN?.trim() || "";
const API_VERSION = "v19.0";

function sanitizeOutboundText(message: string): string {
  return message.replace(/[¿¡]/g, "");
}

function normalizeArgentinianSandboxNumber(phone: string): string {
  const normalized = phone.trim();
  if (normalized.startsWith("549") && normalized.length === 13) {
    return `54${normalized.substring(3)}`;
  }
  return normalized;
}

export class MetaService {
  async sendWhatsAppMessage(to: string, message: string) {
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || "";
    const url = `https://graph.facebook.com/${API_VERSION}/${phoneId}/messages`;
    const formattedTo = normalizeArgentinianSandboxNumber(to);

    try {
      await axios.post(
        url,
        {
          messaging_product: "whatsapp",
          to: formattedTo,
          type: "text",
          text: { body: sanitizeOutboundText(message) },
        },
        {
          headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` },
        },
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
          message: { text: sanitizeOutboundText(message) },
        },
        {
          headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` },
        },
      );
    } catch (error: any) {
      console.error("Error sending Instagram message:", error.response?.data || error.message);
    }
  }

  async getMediaUrl(mediaId: string): Promise<string> {
    const url = `https://graph.facebook.com/${API_VERSION}/${mediaId}`;
    try {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` },
      });
      return response.data.url;
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
