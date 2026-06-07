import { aiService } from "./services/openai";
import * as dotenv from "dotenv";

dotenv.config();

async function runTests() {
  console.log("=== INICIANDO PRUEBAS DE COMPATIBILIDAD, STOCK Y NO REPETICIÓN ===\n");

  // TEST 1: Hilux SRX (debe ofrecer rodado 18, no rodado 17 de entrada, y encontrar KO3 con stock)
  console.log("--- TEST 1: Hilux SRX Rodado 18 y búsqueda de KO3 ---");
  const history1: any[] = [];
  const query1 = "Che me compré una Hilux srx, que tenes en ko3?";
  console.log(`Cliente: ${query1}`);
  try {
    const res1 = await aiService.generateResponse(query1, history1);
    console.log(`Hancita:\n${res1}\n`);
  } catch (err: any) {
    console.error("Error en Test 1:", err.message);
  }

  // TEST 2: Incompatibilidad y consulta de otra medida (Corolla 205/55 R16 cuando el contexto es Hilux)
  console.log("--- TEST 2: Consulta de medida Corolla (205/55 R16) teniendo Hilux en contexto ---");
  const history2 = [
    { role: "user", content: "Che me compré una Hilux srx, que tenes en ko3?" },
    { role: "assistant", content: "Para la Hilux SRX en rodado 18 tengo las All-Terrain KO3 en 265/60 R18 a $440697 cada una. Pásame tu nombre si te sirve." }
  ];
  const query2 = "Y tenes 205/55 r16 Michelin Primacy para el auto de mi señora?";
  console.log(`Cliente: ${query2}`);
  try {
    const res2 = await aiService.generateResponse(query2, history2);
    console.log(`Hancita:\n${res2}\n`);
  } catch (err: any) {
    console.error("Error en Test 2:", err.message);
  }

  // TEST 3: No repetición de Envíos Gratis y Chequeo de Cubierta
  console.log("--- TEST 3: Regla de no repetición (Envio gratis y chequeo lateral ya se dijeron) ---");
  const history3 = [
    { role: "user", content: "Hola, tenes en stock 265/60 R18?" },
    { role: "assistant", content: "Sisi, tengo las KO3 a $440697. Hacemos envios gratis a todo el pais! Por las dudas fijate en el costado de tu cubierta si es esa medida. De que zona sos?" },
    { role: "user", content: "Soy de Lomas. Y en Michelin tenes?" }
  ];
  const query3 = "Si, pasame el precio de la Michelin en esa misma medida";
  console.log(`Cliente: ${query3}`);
  try {
    const res3 = await aiService.generateResponse(query3, history3);
    console.log(`Hancita:\n${res3}\n`);
  } catch (err: any) {
    console.error("Error en Test 3:", err.message);
  }

  // TEST 4: Sin stock (medida inexistente o sin stock 285/65 R18)
  console.log("--- TEST 4: Medida sin stock (285/65 R18) - debe responder ultra corto sin repetir precios anteriores ---");
  const history4 = [
    { role: "user", content: "Hola, tenes en stock 265/60 R18?" },
    { role: "assistant", content: "Sisi, tengo las KO3 a $440697. Hacemos envios gratis a todo el pais! Por las dudas fijate en el costado de tu cubierta si es esa medida. De que zona sos?" }
  ];
  const query4 = "Bf Goodrich 285/65/18 tenes?";
  console.log(`Cliente: ${query4}`);
  try {
    const res4 = await aiService.generateResponse(query4, history4);
    console.log(`Hancita:\n${res4}\n`);
  } catch (err: any) {
    console.error("Error en Test 4:", err.message);
  }

  console.log("=== PRUEBAS FINALIZADAS ===");
}

runTests().catch(console.error);
