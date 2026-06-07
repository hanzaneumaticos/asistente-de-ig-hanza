import { aiService } from "./services/openai";
import * as dotenv from "dotenv";

dotenv.config();

async function runIntegrativeTests() {
  console.log("=== INICIANDO PRUEBAS INTEGRADORAS DE COMPATIBILIDAD Y PRECIOS ===\n");

  // TEST 1: Compatibilidad de Bora 1.8T con 225/45 R17 (Debe dar compatible!)
  console.log("--- TEST 1: Bora 1.8T con 225/45 R17 (Debe responder que sí es compatible y dar precios contado) ---");
  const history1 = [
    { role: "user", content: "Hola, tenes en stock las 225/45 R17 Primacy?" },
    { role: "assistant", content: "Sisi, tengo stock en 225/45 R17 de las Michelin Primacy a $226340 de contado. De que zona sos?" }
  ];
  const query1 = "Joyita, y esa medida le va a un bora 1.8t?";
  try {
    const res1 = await aiService.generateResponse(query1, history1);
    console.log(`Hancita:\n${res1}\n`);
  } catch (err: any) {
    console.error("Error en Test 1:", err.message);
  }

  // TEST 2: Vehículo desconocido (Cherokee) -> Debe derivar a consulta (escalate: true) y silenciarse
  console.log("--- TEST 2: Vehículo desconocido Cherokee (Debe escalar y decir que lo va a consultar) ---");
  const history2 = [
    { role: "user", content: "Hola, tenes en stock las 225/45 R17 Primacy?" },
    { role: "assistant", content: "Sisi, tengo stock en 225/45 R17 de las Michelin Primacy a $226340 de contado. De que zona sos?" }
  ];
  const query2 = "Y esa medida le va a una Cherokee?";
  try {
    const res2 = await aiService.generateResponse(query2, history2);
    console.log(`Hancita:\n${res2}\n`);
  } catch (err: any) {
    console.error("Error en Test 2:", err.message);
  }

  // TEST 3: Precios Contado vs Facturado A
  console.log("--- TEST 3: Factura A vs Contado (Debe mostrar precio con IVA: $226340 contado sin fc, y $226340 con factura? No, con factura debe mostrar el Precio C/F) ---");
  const history3 = [
    { role: "user", content: "Hola, tenes en stock las 225/45 R17 Primacy?" },
    { role: "assistant", content: "Sisi, tengo stock en 225/45 R17 de las Michelin Primacy a $226340 de contado. De que zona sos?" }
  ];
  const query3 = "Haces factura A? Cuanto me queda?";
  try {
    const res3 = await aiService.generateResponse(query3, history3);
    console.log(`Hancita:\n${res3}\n`);
  } catch (err: any) {
    console.error("Error en Test 3:", err.message);
  }

  console.log("=== PRUEBAS FINALIZADAS ===");
}

runIntegrativeTests().catch(console.error);
