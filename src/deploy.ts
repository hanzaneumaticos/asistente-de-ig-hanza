import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

const RENDER_API_KEY = "rnd_GES3VXt8dyGIIPemN1gRIRrbcMsN";
const REPO_URL = "https://github.com/hanzaneumaticos/asistente-de-ig-hanza";

async function deploy() {
  console.log("=== INICIANDO DESPLIEGUE EN RENDER ===");

  const headers = {
    Authorization: `Bearer ${RENDER_API_KEY}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  try {
    // 1. Obtener el ownerId (workspace)
    console.log("1. Obteniendo ID de propietario en Render...");
    const ownersRes = await axios.get("https://api.render.com/v1/owners", { headers });
    if (!ownersRes.data || ownersRes.data.length === 0) {
      throw new Error("No se encontraron propietarios en tu cuenta de Render.");
    }
    const ownerId = ownersRes.data[0].owner.id;
    console.log(`✅ Owner ID encontrado: ${ownerId}`);

    // 2. Preparar variables de entorno desde el .env local
    const envVars = [
      { key: "OPENAI_API_KEY", value: process.env.OPENAI_API_KEY || "" },
      { key: "OPENAI_TEXT_MODEL", value: process.env.OPENAI_TEXT_MODEL || "gpt-5.5" },
      { key: "OPENAI_SECONDARY_MODEL", value: process.env.OPENAI_SECONDARY_MODEL || "gpt-5-mini" },
      { key: "OPENAI_VISION_MODEL", value: process.env.OPENAI_VISION_MODEL || "gpt-4o-mini" },
      { key: "META_ACCESS_TOKEN", value: process.env.META_ACCESS_TOKEN || "" },
      { key: "META_VERIFY_TOKEN", value: process.env.META_VERIFY_TOKEN || "smart_hanza_verify_token" },
      { key: "WHATSAPP_PHONE_NUMBER_ID", value: process.env.WHATSAPP_PHONE_NUMBER_ID || "1134838283046364" },
      { key: "SUPABASE_URL", value: process.env.SUPABASE_URL || "" },
      { key: "SUPABASE_KEY", value: process.env.SUPABASE_KEY || "" },
    ];

    console.log("Variables de entorno a configurar:");
    envVars.forEach(v => console.log(` - ${v.key}: ${v.value ? "***" : "VACIO (Alerta!)"}`));

    // 3. Crear el servicio web
    console.log("\n2. Creando Servicio Web en Render...");
    const payload = {
      type: "web_service",
      name: "asistente-de-ig-hanza",
      ownerId: ownerId,
      repo: REPO_URL,
      branch: "main",
      autoDeploy: "yes",
      envVars: envVars,
      serviceDetails: {
        env: "node",
        region: "oregon", // Región por defecto (gratuita)
        plan: "free",     // Plan gratuito
        envSpecificDetails: {
          buildCommand: "npm install",
          startCommand: "npm start",
        }
      },
    };

    const serviceRes = await axios.post("https://api.render.com/v1/services", payload, { headers });
    const serviceUrl = serviceRes.data.service.url;
    console.log("\n🎉 ¡SERVICIO WEB CREADO EXITOSAMENTE EN RENDER!");
    console.log(`URL pública de tu bot: ${serviceUrl}`);
    console.log(`Configuración Webhook de Meta: ${serviceUrl}/webhook`);
    console.log(`Dashboard de Render para ver la consola de despliegue: https://dashboard.render.com/web/${serviceRes.data.service.id}`);

  } catch (error: any) {
    console.error("💥 Error durante el despliegue:");
    if (error.response) {
      console.error(JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

deploy();
