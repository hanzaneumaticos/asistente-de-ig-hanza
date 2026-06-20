import assert from "node:assert/strict";
import { buildConversationContext, cleanAssistantText, detectCatalogIntent } from "./services/openai";
import { detectRim, detectVehicle, parseTireSize } from "./services/tireCompatibility";

function run() {
  const contextWithHistory = buildConversationContext(
    [
      { role: "assistant", content: "Hacemos envio gratis a todo el pais" },
      { role: "assistant", content: "Fijate el costado de la cubierta y confirmame la medida" },
    ],
    {
      contact_name: "Juan Perez",
      vehicle_info: "Amarok",
      tire_size_searched: "255/60 R18",
    },
  );

  assert.equal(contextWithHistory.alreadyMentionedShipping, true);
  assert.equal(contextWithHistory.alreadyAskedToCheckSidewall, true);
  assert.equal(contextWithHistory.customerNameKnown, true);
  assert.equal(contextWithHistory.vehicleInfo, "Amarok");
  assert.equal(contextWithHistory.tireSizeSearched, "255/60 R18");

  assert.equal(
    detectCatalogIntent("Y con factura A cuanto queda?", [], { tireSizeSearched: "255/60 R18", alreadyMentionedShipping: false, alreadyAskedToCheckSidewall: false, customerNameKnown: false }),
    true,
  );

  assert.equal(
    detectCatalogIntent("Le va 255/55 R19 a una Amarok?", [], { alreadyMentionedShipping: false, alreadyAskedToCheckSidewall: false, customerNameKnown: false }),
    true,
  );

  assert.equal(
    detectCatalogIntent("Mi nombre es Juan", [], { alreadyMentionedShipping: false, alreadyAskedToCheckSidewall: false, customerNameKnown: false }),
    false,
  );

  const parsed = parseTireSize("Tengo 265/65 R17");
  assert.ok(parsed);
  assert.equal(parsed?.width, 265);
  assert.equal(parsed?.aspect, 65);
  assert.equal(parsed?.rim, 17);

  const parsedCompact = parseTireSize("2556018");
  assert.ok(parsedCompact);
  assert.equal(parsedCompact?.width, 255);
  assert.equal(parsedCompact?.aspect, 60);
  assert.equal(parsedCompact?.rim, 18);

  assert.equal(detectVehicle("Tengo una Hilux SRX 2022"), "Hilux SRX");
  assert.equal(detectVehicle("Busco para Amarok V6"), "Amarok");
  assert.equal(detectVehicle("Necesito para un Bora"), "Bora");

  assert.equal(detectRim("rodado 20"), 20);
  assert.equal(detectRim("r17"), 17);
  assert.equal(detectRim("llanta 18"), 18);

  assert.equal(
    cleanAssistantText("Te queda en 6 cuotas sin interes."),
    "Te queda en hasta 6 cuotas sin interes.",
  );

  assert.equal(
    cleanAssistantText("Lo podes pagar en hasta 6 cuotas."),
    "Lo podes pagar en hasta 6 cuotas.",
  );

  console.log("Sales assistant tests passed.");
}

run();
