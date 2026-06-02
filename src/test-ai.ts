import { aiService } from "./services/openai";
import * as dotenv from "dotenv";

dotenv.config();

async function testAssistant() {
  console.log("--- Probando Asistente Hanza (OpenAI GPT-4o) ---");
  
  const queries = [
    "Hola! Tenés algo para un Corolla 2020?",
    "Me hacés un descuento si llevo las 4 Michelin?",
    "Qué me recomendás para una camioneta que uso mucho en ripio?"
  ];

  for (const query of queries) {
    console.log(`\nCliente: ${query}`);
    try {
      const response = await aiService.generateResponse(query);
      console.log(`Hancita (AI): ${response}`);
    } catch (error: any) {
      console.error("Error:", error.message);
      if (error.message.includes("api_key") || error.message.includes("401")) {
        console.log("⚠️  Parece que falta (o es incorrecta) la OPENAI_API_KEY en el archivo .env");
      }
    }
  }
}

testAssistant();
