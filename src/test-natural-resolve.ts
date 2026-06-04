import { aiService } from "./services/openai";
import * as dotenv from "dotenv";

dotenv.config();

async function runTest() {
  console.log("=== PROBANDO PROCESAMIENTO DE RESPUESTA EN LENGUAJE NATURAL CON PRIORIDADES Y LÍMITE DE UN MODELO ===");
  
  const adminInput = "para esa Amarok v6 rodado 18 ponele la medida 255/60 R18. Tenemos Michelin Primacy a 290.000 pesos cada una, y en BF Goodrich tenemos la Trail Terrain a 310.000 y si prefiere la KO3 que es mas reforzada a 380.000 pesos. Decile que el envio es gratis como siempre";
  console.log(`\nEntrada de Karim (Admin): "${adminInput}"`);

  try {
    const result = await aiService.processAdminResponse(adminInput, "Amarok v6", "18");
    console.log("\n--- RESULTADO OBTENIDO ---");
    console.log(`Medida extraída: ${result.extracted_tire_size}`);
    console.log(`Respuesta redactada para el cliente:\n`);
    console.log(result.client_response);
    console.log("\n--------------------------");

    // Validaciones
    const paragraphs = result.client_response.split(/\n+/).map(p => p.trim()).filter(Boolean);
    console.log(`\nCantidad de mensajes individuales detectados: ${paragraphs.length}`);
    
    // Verificar orden e inclusión
    const bfIndex = result.client_response.indexOf("BF");
    const michelinIndex = result.client_response.indexOf("Michelin");
    const ko3Index = result.client_response.indexOf("KO3");
    const trailIndex = result.client_response.indexOf("Trail");

    console.log("\n--- VALIDACIÓN DE PRIORIDADES Y LÍMITES ---");
    
    if (bfIndex !== -1 && michelinIndex !== -1) {
      if (bfIndex < michelinIndex) {
        console.log("✅ BF Goodrich aparece ANTES que Michelin (Correcto)");
      } else {
        console.log("❌ BF Goodrich aparece DESPUÉS de Michelin (Incorrecto)");
      }
    } else {
      console.log("⚠️ No se encontraron ambas marcas en la respuesta");
    }

    // El modelo prioritario de BF Goodrich (KO3) debe estar y el secundario (Trail Terrain) debe ser OMITIDO
    if (ko3Index !== -1) {
      console.log("✅ Se incluyó la opción prioritaria KO3 (Correcto)");
    } else {
      console.log("❌ NO se incluyó la opción prioritaria KO3 (Incorrecto)");
    }

    if (trailIndex === -1) {
      console.log("✅ Se omitió la opción Trail Terrain inicialmente por límite de un modelo por marca (Correcto)");
    } else {
      console.log("❌ Se incluyeron múltiples modelos de BF Goodrich de entrada (Incorrecto)");
    }

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
