import { aiService } from "./services/openai";
import * as dotenv from "dotenv";

dotenv.config();

async function runPricingTests() {
  console.log("=== INICIANDO PRUEBAS DE REGLAS DE PRECIOS Y FACTURACIÓN ===\n");

  // TEST 1: Precio de contado por defecto
  console.log("--- TEST 1: Precio contado/efectivo por defecto (Debe mostrar $440697 para KO3 265/60 R18) ---");
  const history1: any[] = [];
  const query1 = "Hola, tenes en stock las 265/60 R18 KO3? Cuanto salen?";
  try {
    const res1 = await aiService.generateResponse(query1, history1);
    console.log(`Hancita:\n${res1}\n`);
  } catch (err: any) {
    console.error("Error en Test 1:", err.message);
  }

  // TEST 2: Consulta por Factura A (Debe mostrar el precio con factura $468241 e indicar IVA)
  console.log("--- TEST 2: Factura A (Debe mostrar $468241) ---");
  const history2 = [
    { role: "user", content: "Hola, tenes en stock las 265/60 R18 KO3? Cuanto salen?" },
    { role: "assistant", content: "Sisi, tengo stock de las KO3 en 265/60 R18 a $440697 cada una.\n\nDe qué zona sos?" }
  ];
  const query2 = "Haces Factura A? Que precio me quedaria?";
  try {
    const res2 = await aiService.generateResponse(query2, history2);
    console.log(`Hancita:\n${res2}\n`);
  } catch (err: any) {
    console.error("Error en Test 2:", err.message);
  }

  // TEST 3: Consulta por Tarjeta en 1 Pago (Debe mostrar el precio de tarjeta en 1 pago $480360)
  console.log("--- TEST 3: Tarjeta en un pago (Debe mostrar $480360) ---");
  const history3 = [
    { role: "user", content: "Hola, tenes en stock las 265/60 R18 KO3? Cuanto salen?" },
    { role: "assistant", content: "Sisi, tengo stock de las KO3 en 265/60 R18 a $440697 cada una.\n\nDe qué zona sos?" }
  ];
  const query3 = "Se puede pagar con tarjeta en un pago? Cuanto queda?";
  try {
    const res3 = await aiService.generateResponse(query3, history3);
    console.log(`Hancita:\n${res3}\n`);
  } catch (err: any) {
    console.error("Error en Test 3:", err.message);
  }

  // TEST 4: Consulta por Cuotas (Debe mostrar que hay hasta 6 cuotas con precio de lista $550872, SIN derivar a Karim)
  console.log("--- TEST 4: Cuotas con tarjeta (Debe mostrar hasta 6 cuotas con lista a $550872, NO derivar a Karim) ---");
  const history4 = [
    { role: "user", content: "Hola, tenes en stock las 265/60 R18 KO3? Cuanto salen?" },
    { role: "assistant", content: "Sisi, tengo stock de las KO3 en 265/60 R18 a $440697 cada una.\n\nDe qué zona sos?" }
  ];
  const query4 = "Tienen cuotas? Pasame los precios con tarjeta en cuotas porfa";
  try {
    const res4 = await aiService.generateResponse(query4, history4);
    console.log(`Hancita:\n${res4}\n`);
  } catch (err: any) {
    console.error("Error en Test 4:", err.message);
  }

  // TEST 5: Intención de compra concreta (Debe derivar amablemente a Karim)
  console.log("--- TEST 5: Intención de compra (Debe derivar a Karim) ---");
  const history5 = [
    { role: "user", content: "Hola, tenes en stock las 265/60 R18 KO3? Cuanto salen?" },
    { role: "assistant", content: "Sisi, tengo stock de las KO3 en 265/60 R18 a $440697 cada una.\n\nDe qué zona sos?" },
    { role: "user", content: "Soy de Avellaneda. Pasame en 6 cuotas" },
    { role: "assistant", content: "Buenisimo! En hasta 6 cuotas con tarjeta te quedan a $550872 cada una.\n\nTe sirve ese modelo?" }
  ];
  const query5 = "Dale joya, quiero comprarlas, pasame el link o los datos para pagar";
  try {
    const res5 = await aiService.generateResponse(query5, history5);
    console.log(`Hancita:\n${res5}\n`);
  } catch (err: any) {
    console.error("Error en Test 5:", err.message);
  }

  console.log("=== PRUEBAS DE PRECIOS FINALIZADAS ===");
}

runPricingTests().catch(console.error);
