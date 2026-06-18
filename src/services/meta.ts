import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN?.trim() || "";
const API_VERSION = "v19.0";

function sanitizeOutboundText(message: string): string {
  return message.replace(/[¿¡]/g, "");
}

export function normalizeArgentinianSandboxNumber(phone: string): string {
  const digitsOnly = phone.replace(/\D/g, "");
  const normalized = digitsOnly.startsWith("00") ? digitsOnly.substring(2) : digitsOnly;

  if (normalized.startsWith("549") && normalized.length >= 13) {
    return `54${normalized.substring(3)}`;
  }

  return normalized;
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export class MetaService {
  async sendWhatsAppMessage(to: string, message: string) {
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || "";
    const url = `https://graph.facebook.com/${API_VERSION}/${phoneId}/messages`;
    const formattedTo = normalizeArgentinianSandboxNumber(to);

    let lastError: any;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await axios.post(
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

        console.log("WhatsApp message sent:", {
          to: formattedTo,
          attempt,
          messageId: response.data?.messages?.[0]?.id || null,
        });

        return response.data;
      } catch (error: any) {
        lastError = error;
        console.error("Error sending WhatsApp message:", {
          to: formattedTo,
          attempt,
          error: error.response?.data || error.message,
        });

        if (attempt < 2) {
          await delay(800);
        }
      }
    }

    throw lastError;
  }

  async sendInstagramMessage(recipientId: string, message: string) {
    const url = `https://graph.facebook.com/${API_VERSION}/me/messages`;

    try {
      const response = await axios.post(
        url,
        {
          recipient: { id: recipientId },
          message: { text: sanitizeOutboundText(message) },
        },
        {
          headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` },
        },
      );

      return response.data;
    } catch (error: any) {
      console.error("Error sending Instagram message:", error.response?.data || error.message);
      throw error;
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
