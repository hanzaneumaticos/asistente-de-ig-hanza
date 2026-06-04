import { 
  detectVehicle, 
  detectRim, 
  parseTireSize, 
  getCompatibleSizes, 
  saveLearnedCompatibility 
} from "./services/tireCompatibility";

async function runTests() {
  console.log("=== STARTING TIRE COMPATIBILITY TESTS ===\n");

  // 1. Test vehicle detection
  console.log("Testing vehicle detection:");
  const v1 = detectVehicle("Tengo una Amarok v6 2020");
  const v2 = detectVehicle("Quiero cubiertas para Hilux 4x4");
  const v3 = detectVehicle("Medidas de toyota sw4");
  console.log(`- 'Tengo una Amarok v6 2020' -> Detected: ${v1} (Expected: Amarok)`);
  console.log(`- 'Quiero cubiertas para Hilux 4x4' -> Detected: ${v2} (Expected: Hilux)`);
  console.log(`- 'Medidas de toyota sw4' -> Detected: ${v3} (Expected: SW4)`);
  console.log("");

  // 2. Test rim detection
  console.log("Testing rim detection:");
  const r1 = detectRim("la camioneta tiene rodado 20");
  const r2 = detectRim("el modelo tiene llanta 19");
  const r3 = detectRim("la mia lleva r18");
  console.log(`- 'la camioneta tiene rodado 20' -> Detected: ${r1} (Expected: 20)`);
  console.log(`- 'el modelo tiene llanta 19' -> Detected: ${r2} (Expected: 19)`);
  console.log(`- 'la mia lleva r18' -> Detected: ${r3} (Expected: 18)`);
  console.log("");

  // 3. Test tire size parsing
  console.log("Testing tire size parsing:");
  const s1 = parseTireSize("busco medida 255/55 R19");
  const s2 = parseTireSize("tenes 265 65 17?");
  const s3 = parseTireSize("31x10.5 r15 mud terrain");
  console.log(`- '255/55 R19' -> Parsed: ${JSON.stringify(s1)} (Expected: {"width":255,"aspect":55,"rim":19})`);
  console.log(`- '265 65 17?' -> Parsed: ${JSON.stringify(s2)} (Expected: {"width":265,"aspect":65,"rim":17})`);
  console.log(`- '31x10.5 r15' -> Parsed: ${JSON.stringify(s3)} (Expected: {"width":31,"aspect":10.5,"rim":15})`);
  console.log("");

  // 4. Test compatibility mapping
  console.log("Testing compatibility mapping:");
  const comp1 = await getCompatibleSizes("Amarok", 19);
  const comp2 = await getCompatibleSizes("Hilux", 17);
  console.log(`- Amarok R19 -> ${JSON.stringify(comp1)} (Expected: ["255/55 R19"])`);
  console.log(`- Hilux R17 -> ${JSON.stringify(comp2)} (Expected: ["265/65 R17","225/70 R17"])`);
  console.log("");

  // 5. Test dynamic learning
  console.log("Testing dynamic learning and database persistence:");
  const testVehicle = "Compass";
  const testRim = 19;
  const testSize = "235/45 R19";
  
  console.log(`Learning compatibility: ${testVehicle} R${testRim} -> ${testSize}`);
  const learnSuccess = await saveLearnedCompatibility(testVehicle, testRim, testSize);
  console.log(`- Save success: ${learnSuccess}`);
  
  if (learnSuccess) {
    const loadedSizes = await getCompatibleSizes(testVehicle, testRim);
    console.log(`- Retrieve from DB: ${JSON.stringify(loadedSizes)} (Expected to contain "${testSize}")`);
  }
  
  console.log("\n=== COMPATIBILITY TESTS COMPLETED ===");
}

runTests().catch(console.error);
