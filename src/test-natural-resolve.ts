import { aiService } from "./services/openai";
import * as dotenv from "dotenv";

dotenv.config();

async function runTest() {
  console.log("=== PROBANDO RESPUESTA EN LENGUAJE NATURAL - PRECIOS AISLADOS Y SEGUIMIENTO ACTIVO ===");
  
  const adminInput = "para esa Amarok v6 rodado 18 ponele la medida 255/60 R18. Tenemos Michelin Primacy a 290.000 pesos cada una, y en BF Goodrich tenemos la Trail Terrain a 310.000 y si prefiere la KO3 que es mas reforzada a 380.000 pesos. Decile que el envio es gratis como siempre";
  console.log(`\nEntrada de Karim (Admin): "${adminInput}"`);

  try {
    const result = await aiService.processAdminResponse(adminInput, "Amarok v6", "18");
    console.log("\n--- RESULTADO OBTENIDO ---");
    console.log(`Medida extraída: ${result.extracted_tire_size}`);
    console.log(`Respuesta redactada para el cliente:\n`);
    console.log(result.client_response);
    console.log("\n--------------------------");

    const paragraphs = result.client_response.split(/\n+/).map(p => p.trim()).filter(Boolean);
    console.log(`\nCantidad de mensajes individuales detectados: ${paragraphs.length}`);
    
    console.log("\n--- VALIDACIÓN DE REGLAS DE NEGOCIO Y ESTRATEGIA ---");
    
    // 1. Verificar que no contenga frases de cierre muerto
    const deadEnds = ["cualquier cosa decime", "cualquier duda", "avisame", "disposición"];
    let hasDeadEnd = false;
    for (const phrase of deadEnds) {
      if (result.client_response.toLowerCase().includes(phrase)) {
        console.log(`❌ Se detectó frase de cierre prohibida: "${phrase}"`);
        hasDeadEnd = true;
      }
    }
    if (!hasDeadEnd) {
      console.log("✅ Sin frases de cierre plano (Correcto)");
    }

    // 2. Verificar que los precios estén 100% aislados
    let pricesIsolated = true;
    for (const paragraph of paragraphs) {
      const isPriceLine = paragraph.includes("$") || paragraph.includes("pesos");
      if (isPriceLine) {
        const containsShipping = paragraph.toLowerCase().includes("envio") || paragraph.toLowerCase().includes("gratis");
        const containsQuestion = paragraph.includes("?") || paragraph.toLowerCase().includes("como") || paragraph.toLowerCase().includes("zona") || paragraph.toLowerCase().includes("nombre");
        
        if (containsShipping || containsQuestion) {
          console.log(`❌ El párrafo de precio no está aislado: "${paragraph}"`);
          pricesIsolated = false;
        }
      }
    }
    if (pricesIsolated) {
      console.log("✅ Párrafos de precios 100% aislados de envíos y preguntas (Correcto)");
    }

    // 3. Verificar que tenga una pregunta estratégica final
    const finalParagraph = paragraphs[paragraphs.length - 1] || "";
    const hasQuestion = finalParagraph.includes("?") || finalParagraph.toLowerCase().includes("cómo") || finalParagraph.toLowerCase().includes("zona") || finalParagraph.toLowerCase().includes("nombre");
    if (hasQuestion) {
      console.log(`✅ Párrafo final contiene pregunta de seguimiento estratégica: "${finalParagraph}" (Correcto)`);
    } else {
      console.log("❌ El párrafo final NO contiene una pregunta de seguimiento estratégica (Incorrecto)");
    }

    // 4. Límite de mensajes
    if (paragraphs.length >= 2 && paragraphs.length <= 5) {
      console.log(`✅ La respuesta se dividió correctamente en ${paragraphs.length} mensajes (máximo 5)`);
    } else {
      console.log(`❌ La respuesta tiene un número incorrecto de mensajes (${paragraphs.length})`);
    }

  } catch (error: any) {
    console.error("Error al ejecutar la prueba:", error.message);
  }
}

runTest();
