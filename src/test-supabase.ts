import { dbService } from "./services/supabase";

async function runTest() {
  console.log("Starting Supabase connection and write test...");
  
  try {
    // 1. Intentar crear o recuperar una conversación de prueba
    console.log("Testing getOrCreateConversation with test_contact...");
    const conv = await dbService.getOrCreateConversation("test_contact_123", "whatsapp", "Cliente de Prueba SQL");
    
    if (conv) {
      console.log("✅ Success! Conversation obtained/created:", conv);
      
      // 2. Intentar guardar un mensaje en la conversación de prueba
      console.log("Testing saveMessage...");
      const msg = await dbService.saveMessage(conv.id, "user", "Hola, esto es un mensaje de prueba de conexión.");
      if (msg) {
        console.log("✅ Success! Message saved:", msg);
      } else {
        console.log("❌ Failed to save message.");
      }
    } else {
      console.log("❌ Failed to obtain/create conversation.");
    }
  } catch (err: any) {
    console.error("💥 Unhandled error during test execution:", err);
  }
}

runTest();
