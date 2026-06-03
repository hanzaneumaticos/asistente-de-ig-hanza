import axios from "axios";

const RENDER_API_KEY = "rnd_GES3VXt8dyGIIPemN1gRIRrbcMsN";
const SERVICE_ID = "srv-d8g6ct0jo6nc73dqm7og";

async function checkEnv() {
  const headers = {
    Authorization: `Bearer ${RENDER_API_KEY}`,
    Accept: "application/json",
  };

  try {
    const res = await axios.get(`https://api.render.com/v1/services/${SERVICE_ID}/env-vars`, { headers });
    console.log("Render Environment Variables:", JSON.stringify(res.data, null, 2));
  } catch (error: any) {
    console.error("Error:", error.message);
  }
}

checkEnv();
