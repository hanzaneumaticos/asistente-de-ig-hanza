import { aiService } from "./services/openai";
import * as dotenv from "dotenv";

dotenv.config();

// Re-creamos la función splitIntoMessages aquí para probar su comportamiento de división
function simulateSplitIntoMessages(text: string): string[] {
  let formattedText = text;

  // 1. Si hay un precio con signo $ seguido de texto (nueva oración que empieza con mayúscula), insertar un doble salto de línea
  formattedText = formattedText.replace(/(\$\d+[\d.,]*(?:\s*cada\s*un[oa]|\s*c\/u)?)([.!?]*\s+)([A-ZÁÉÍÓÚÑ])/g, "$1$2\n\n$3");

  // 2. Si hay un precio expresado en pesos seguido de nueva oración que empieza con mayúscula
  formattedText = formattedText.replace(/(\b\d+[\d.,]*\s*pesos(?:\s*cada\s*un[oa]|\s*c\/u)?)([.!?]*\s+)([A-ZÁÉÍÓÚÑ])/g, "$1$2\n\n$3");

  const paragraphs = formattedText.split(/\n+/).map(p => p.trim()).filter(Boolean);
  const messages: string[] = [];

  for (const paragraph of paragraphs) {
    const isPriceLine = paragraph.includes("$") || paragraph.toLowerCase().includes("pesos");

    if (isPriceLine) {
      messages.push(paragraph);
    } else if (paragraph.length < 220) {
      messages.push(paragraph);
    } else {
      const sentences = paragraph.match(/[^.!?]+[.!?]+(\s|$)/g) || [paragraph];
      let currentMessage = "";
      for (const sentence of sentences) {
        const sentenceContainsPrice = sentence.includes("$") || sentence.toLowerCase().includes("pesos");

        if (!sentenceContainsPrice && (currentMessage + sentence).length < 220) {
          currentMessage += (currentMessage ? " " : "") + sentence.trim();
        } else {
          if (currentMessage) messages.push(currentMessage);
          currentMessage = sentence.trim();
        }
      }
      if (currentMessage) messages.push(currentMessage);
    }
  }

  return messages.filter(Boolean).slice(0, 5);
}

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

    const paragraphs = simulateSplitIntoMessages(result.client_response);
    console.log(`\nCantidad de mensajes individuales detectados: ${paragraphs.length}`);
    paragraphs.forEach((p, idx) => console.log(`Mensaje ${idx + 1}: "${p}"`));
    
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
      const isPriceLine = paragraph.includes("$") || paragraph.toLowerCase().includes("pesos");
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

    // --- TEST 2: Simulación de caso problemático (Agrupado por la IA) ---
    console.log("\n=== TEST 2: SIMULACIÓN DE RESPUESTA AGRUPADA POR LA IA ===");
    const groupedResponse = "Mirá, para la Frontier está la medida 265/65 R17.\nBF Goodrich TRAIL-TERRAIN T/A 265/65 R17: $489499\nMichelin LTX TRAIL ST 265/65 R17: $306071 Hacemos envíos gratis a todo el país. Igual por las dudas, decile que mire el costado de su cubierta para confirmar la medida exacta. ¿De qué zona son?";
    console.log(`Respuesta agrupada original:\n"${groupedResponse}"`);
    
    const splitGrouped = simulateSplitIntoMessages(groupedResponse);
    console.log(`\nCantidad de mensajes individuales divididos: ${splitGrouped.length}`);
    splitGrouped.forEach((p, idx) => console.log(`Mensaje ${idx + 1}: "${p}"`));

    // Aserción del Test 2: el mensaje que contiene $306071 no debe contener "envíos" ni "zona"
    let michelinIsolated = true;
    splitGrouped.forEach(msg => {
      if (msg.includes("$306071")) {
        if (msg.includes("envíos") || msg.includes("zona")) {
          michelinIsolated = false;
        }
      }
    });

    if (michelinIsolated) {
      console.log("✅ TEST 2 PASÓ: El precio de Michelin se separó programáticamente de forma correcta.");
    } else {
      console.log("❌ TEST 2 FALLÓ: El precio de Michelin sigue agrupado con envío o preguntas.");
    }

  } catch (error: any) {
    console.error("Error al ejecutar la prueba:", error.message);
  }
}

runTest();
