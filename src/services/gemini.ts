import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";

import catalog from "../../catalog.json";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const SYSTEM_INSTRUCTION = `
Eres el Asistente de Ventas de "Hanza Neumáticos", una tienda experta en neumáticos para autos, camionetas y SUVs.
Tu objetivo es ser súper humano, empático y profesional. No parezcas un robot aburrido.

CATÁLOGO ACTUAL:
${JSON.stringify(catalog)}

REGLAS:
- Usa un lenguaje cercano, pero educado (estilo argentino - "Hanzita").
- Si te hablan de audio, demuéstrales que los escuchaste con atención.
- Tu prioridad es calificar al cliente (saber qué auto tiene, qué medida busca o para qué uso necesita los neumáticos).
- Usa los precios y stock del catálogo para asesorar.
- Si no encuentras la medida en el catálogo, di que vas a consultar disponibilidad con el depósito y pide su número de contacto.
- IMPORTANTE: Si recibes una consulta técnica muy específica, pide el modelo y año del vehículo.
`;

export class GeminiService {
  private model;

  constructor() {
    this.model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro",
      systemInstruction: SYSTEM_INSTRUCTION,
    });
  }

  async generateResponse(prompt: string, history: any[] = []) {
    const chat = this.model.startChat({
      history: history,
    });

    const result = await chat.sendMessage(prompt);
    const response = await result.response;
    return response.text();
  }

  async processAudio(audioBuffer: Buffer, mimeType: string, textContext: string = "") {
    // Para procesar audio, necesitamos enviar los datos en formato inlineData
    const result = await this.model.generateContent([
      {
        inlineData: {
          data: audioBuffer.toString("base64"),
          mimeType: mimeType,
        },
      },
      { text: `Escucha este audio del cliente. La última parte de la conversación fue: ${textContext || 'Inicio de charla'}. Responde de forma humana y vendedora.` },
    ]);

    const response = await result.response;
    return response.text();
  }
}

export const geminiService = new GeminiService();
