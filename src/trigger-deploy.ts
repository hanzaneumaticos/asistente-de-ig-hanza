import axios from "axios";

const RENDER_API_KEY = "rnd_GES3VXt8dyGIIPemN1gRIRrbcMsN";
const SERVICE_ID = "srv-d8g6ct0jo6nc73dqm7og";

async function triggerDeploy() {
  console.log("=== DISPARANDO NUEVO DESPLIEGUE EN RENDER ===");
  
  const headers = {
    Authorization: `Bearer ${RENDER_API_KEY}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  try {
    const res = await axios.post(
      `https://api.render.com/v1/services/${SERVICE_ID}/deploys`,
      {},
      { headers }
    );
    console.log("✅ Despliegue disparado exitosamente!");
    console.log("Detalles del despliegue:", JSON.stringify(res.data, null, 2));
  } catch (error: any) {
    console.error("💥 Error disparando despliegue:");
    if (error.response) {
      console.error(JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

triggerDeploy();
