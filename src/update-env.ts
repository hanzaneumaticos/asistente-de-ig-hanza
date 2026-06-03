import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

const RENDER_API_KEY = "rnd_GES3VXt8dyGIIPemN1gRIRrbcMsN";
const SERVICE_ID = "srv-d8g6ct0jo6nc73dqm7og";

async function updateEnv() {
  console.log("=== ACTUALIZANDO VARIABLES DE ENTORNO EN RENDER ===");
  
  const headers = {
    Authorization: `Bearer ${RENDER_API_KEY}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  const envVars = [
    { key: "OPENAI_API_KEY", value: process.env.OPENAI_API_KEY || "" },
    { key: "META_ACCESS_TOKEN", value: process.env.META_ACCESS_TOKEN || "" },
    { key: "META_VERIFY_TOKEN", value: process.env.META_VERIFY_TOKEN || "smart_hanza_verify_token" },
    { key: "WHATSAPP_PHONE_NUMBER_ID", value: process.env.WHATSAPP_PHONE_NUMBER_ID || "1134838283046364" },
    { key: "SUPABASE_URL", value: process.env.SUPABASE_URL || "" },
    { key: "SUPABASE_KEY", value: process.env.SUPABASE_KEY || "" },
  ];

  console.log("Variables de entorno a configurar:");
  envVars.forEach(v => console.log(` - ${v.key}: ${v.value ? "***" : "VACIO (Alerta!)"}`));

  try {
    const res = await axios.put(
      `https://api.render.com/v1/services/${SERVICE_ID}/env-vars`,
      envVars,
      { headers }
    );
    console.log("✅ Variables de entorno actualizadas exitosamente en Render!");
    console.log("Respuesta de Render:", JSON.stringify(res.data, null, 2));
  } catch (error: any) {
    console.error("💥 Error actualizando variables de entorno:");
    if (error.response) {
      console.error(JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

updateEnv();
