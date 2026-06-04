import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_KEY || "";

if (!supabaseUrl || !supabaseKey) {
  console.warn("Supabase URL or Key is missing in environment variables.");
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export class SupabaseService {
  // --- CONVERSATIONS ---
  async getOrCreateConversation(contactId: string, platform: 'whatsapp' | 'instagram', contactName?: string) {
    try {
      // Intentar buscar conversación existente
      const { data: existing, error: searchError } = await supabase
        .from("conversations")
        .select("*")
        .eq("contact_id", contactId)
        .eq("platform", platform)
        .maybeSingle();

      if (searchError) throw searchError;
      if (existing) return existing;

      // Crear nueva conversación si no existe
      const { data: created, error: insertError } = await supabase
        .from("conversations")
        .insert({
          contact_id: contactId,
          platform,
          contact_name: contactName || null,
          bot_enabled: true
        })
        .select()
        .single();

      if (insertError) throw insertError;
      return created;
    } catch (error) {
      console.error("Error in getOrCreateConversation:", error);
      return null;
    }
  }

  async getConversation(id: string) {
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Error in getConversation:", error);
      return null;
    }
  }

  async appendConversationDetails(id: string, updates: { vehicle_info?: string; tire_size_searched?: string }) {
    try {
      const current = await this.getConversation(id);
      const finalUpdates: any = {};

      if (updates.vehicle_info) {
        const currentVehicles = current?.vehicle_info ? current.vehicle_info.split(",").map((v: string) => v.trim()) : [];
        const newVehicle = updates.vehicle_info.trim();
        if (newVehicle && !currentVehicles.includes(newVehicle)) {
          currentVehicles.push(newVehicle);
          finalUpdates.vehicle_info = currentVehicles.join(", ");
        }
      }

      if (updates.tire_size_searched) {
        const currentSizes = current?.tire_size_searched ? current.tire_size_searched.split(",").map((s: string) => s.trim()) : [];
        const newSize = updates.tire_size_searched.trim();
        if (newSize && !currentSizes.includes(newSize)) {
          currentSizes.push(newSize);
          finalUpdates.tire_size_searched = currentSizes.join(", ");
        }
      }

      if (Object.keys(finalUpdates).length > 0) {
        return await this.updateConversationDetails(id, finalUpdates);
      }
      return current;
    } catch (error) {
      console.error("Error in appendConversationDetails:", error);
      return null;
    }
  }

  async updateConversationDetails(id: string, updates: { vehicle_info?: string; tire_size_searched?: string; bot_enabled?: boolean }) {
    try {
      const { data, error } = await supabase
        .from("conversations")
        .update({
          ...updates,
          last_message_at: new Date().toISOString()
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Error updating conversation details:", error);
      return null;
    }
  }

  // --- MESSAGES ---
  async saveMessage(conversationId: string, role: 'user' | 'assistant' | 'system_log', content: string, messageType: string = 'text') {
    try {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          role,
          content,
          message_type: messageType
        })
        .select()
        .single();

      if (error) throw error;

      // Actualizar timestamp de la conversación
      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversationId);

      return data;
    } catch (error) {
      console.error("Error saving message:", error);
      return null;
    }
  }

  async getMessageHistory(conversationId: string, limit: number = 10) {
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("role, content")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []).reverse();
    } catch (error) {
      console.error("Error getting message history:", error);
      return [];
    }
  }

  // --- MESSAGE QUEUE (DELAYS) ---
  async addToQueue(conversationId: string, text: string, delaySeconds: number) {
    try {
      const scheduledFor = new Date(Date.now() + delaySeconds * 1000).toISOString();
      const { data, error } = await supabase
        .from("message_queue")
        .insert({
          conversation_id: conversationId,
          pending_text: text,
          scheduled_for: scheduledFor,
          is_processed: false
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Error adding to queue:", error);
      return null;
    }
  }

  async getPendingQueueMessages() {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("message_queue")
        .select("*, conversations(contact_id, platform, bot_enabled)")
        .eq("is_processed", false)
        .lte("scheduled_for", now);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Error getting pending queue messages:", error);
      return [];
    }
  }

  async markQueueAsProcessed(queueId: string) {
    try {
      const { data, error } = await supabase
        .from("message_queue")
        .update({ is_processed: true })
        .eq("id", queueId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Error marking queue as processed:", error);
      return null;
    }
  }

  // --- KNOWLEDGE BASE ---
  async getKnowledgeBase() {
    try {
      const { data, error } = await supabase
        .from("knowledge_base")
        .select("*");

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Error getting knowledge base:", error);
      return [];
    }
  }

  // --- CONSULTATIONS ---
  async createPendingConsultation(conversationId: string, vehicle: string, rim: number | null, query: string) {
    try {
      const topic = `consultation:${conversationId}`;
      const content = JSON.stringify({
        vehicle,
        rim,
        query,
        status: "pending",
        created_at: new Date().toISOString()
      });

      const { data: existing } = await supabase
        .from("knowledge_base")
        .select("id")
        .eq("topic", topic)
        .maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from("knowledge_base")
          .update({ content, updated_at: new Date().toISOString() })
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("knowledge_base")
          .insert({ topic, content })
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    } catch (error) {
      console.error("Error creating pending consultation:", error);
      return null;
    }
  }

  async getPendingConsultations() {
    try {
      const { data, error } = await supabase
        .from("knowledge_base")
        .select("*")
        .like("topic", "consultation:%");

      if (error) throw error;
      
      const pending: any[] = [];
      for (const row of (data || [])) {
        try {
          const parsed = JSON.parse(row.content);
          if (parsed && parsed.status === "pending") {
            const conversationId = row.topic.split(":")[1];
            pending.push({
              id: row.id,
              conversation_id: conversationId,
              ...parsed
            });
          }
        } catch (e) {
          // ignore parsing error
        }
      }
      return pending;
    } catch (error) {
      console.error("Error getting pending consultations:", error);
      return [];
    }
  }

  async resolveConsultation(conversationId: string) {
    try {
      const topic = `consultation:${conversationId}`;
      const { data: existing } = await supabase
        .from("knowledge_base")
        .select("*")
        .eq("topic", topic)
        .maybeSingle();

      if (existing) {
        try {
          const parsed = JSON.parse(existing.content);
          parsed.status = "resolved";
          parsed.resolved_at = new Date().toISOString();

          const { error } = await supabase
            .from("knowledge_base")
            .update({
              content: JSON.stringify(parsed),
              updated_at: new Date().toISOString()
            })
            .eq("id", existing.id);

          if (error) throw error;
          return true;
        } catch (e) {
          await supabase.from("knowledge_base").delete().eq("id", existing.id);
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error("Error resolving consultation:", error);
      return false;
    }
  }
}

export const dbService = new SupabaseService();

