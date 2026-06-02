import OpenAI from "openai";
import * as dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class VisionService {
  async analyzeTireImage(imageUrl: string, isBase64: boolean = false): Promise<string | null> {
    try {
      let imageContent;
      
      if (isBase64) {
        // If it's a base64 string, format it correctly for the API
        const base64Data = imageUrl.includes('base64,') ? imageUrl.split('base64,')[1] : imageUrl;
        imageContent = {
          url: `data:image/jpeg;base64,${base64Data}`
        };
      } else {
        // If it's a standard URL
        imageContent = {
          url: imageUrl
        };
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { 
                type: "text", 
                text: "Eres un experto en neumáticos. Analiza esta imagen y dime la medida exacta del neumático que ves (ejemplo: 265/65 R17 o 265 65 17). Si puedes identificar la marca (ej: Michelin, BF Goodrich) o el modelo, menciónalo también. Si no estás seguro de la medida porque no se ve clara en la foto, indícalo." 
              },
              {
                type: "image_url",
                image_url: imageContent
              }
            ],
          },
        ],
        max_tokens: 300,
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error("Error analizando imagen con GPT-4o Vision:", error);
      return null;
    }
  }
}

export const visionService = new VisionService();
