import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_KEY || "";

export const isSupabaseConfigured = !!supabaseUrl && !!supabaseKey;

if (!isSupabaseConfigured) {
  console.warn("Supabase URL or Key is missing. Running with in-memory fallback.");
}

export const supabase = createClient(supabaseUrl || "https://placeholder.local", supabaseKey || "placeholder-key");

type ConversationRecord = {
  id: string;
  contact_id: string;
  platform: "whatsapp" | "instagram";
  contact_name?: string | null;
  vehicle_info?: string;
  tire_size_searched?: string;
  bot_enabled: boolean;
  last_message_at: string;
};

type MessageRecord = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system_log";
  content: string;
  message_type: string;
  created_at: string;
};

type KnowledgeRecord = {
  id: string;
  topic: string;
  content: string;
  updated_at: string;
};

const memoryConversations = new Map<string, ConversationRecord>();
const memoryMessages = new Map<string, MessageRecord[]>();
const memoryKnowledge = new Map<string, KnowledgeRecord>();

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getConversationKey(contactId: string, platform: "whatsapp" | "instagram"): string {
  return `${platform}:${contactId}`;
}

function sortByLastMessage(left: ConversationRecord, right: ConversationRecord): number {
  return new Date(right.last_message_at).getTime() - new Date(left.last_message_at).getTime();
}

export class SupabaseService {
  async getOrCreateConversation(contactId: string, platform: "whatsapp" | "instagram", contactName?: string) {
    if (!isSupabaseConfigured) {
      const key = getConversationKey(contactId, platform);
      const existing = memoryConversations.get(key);
      if (existing) return existing;

      const created: ConversationRecord = {
        id: makeId("conv"),
        contact_id: contactId,
        platform,
        contact_name: contactName || null,
        bot_enabled: true,
        last_message_at: new Date().toISOString(),
      };

      memoryConversations.set(key, created);
      memoryMessages.set(created.id, []);
      return created;
    }

    try {
      const { data: existing, error: searchError } = await supabase
        .from("conversations")
        .select("*")
        .eq("contact_id", contactId)
        .eq("platform", platform)
        .maybeSingle();

      if (searchError) throw searchError;
      if (existing) return existing;

      const { data: created, error: insertError } = await supabase
        .from("conversations")
        .insert({
          contact_id: contactId,
          platform,
          contact_name: contactName || null,
          bot_enabled: true,
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
    if (!isSupabaseConfigured) {
      for (const conversation of memoryConversations.values()) {
        if (conversation.id === id) return conversation;
      }
      return null;
    }

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
        const currentVehicles = current?.vehicle_info ? current.vehicle_info.split(",").map((value: string) => value.trim()) : [];
        const newVehicle = updates.vehicle_info.trim();
        if (newVehicle && !currentVehicles.includes(newVehicle)) {
          currentVehicles.push(newVehicle);
          finalUpdates.vehicle_info = currentVehicles.join(", ");
        }
      }

      if (updates.tire_size_searched) {
        const currentSizes = current?.tire_size_searched ? current.tire_size_searched.split(",").map((value: string) => value.trim()) : [];
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
    if (!isSupabaseConfigured) {
      for (const [key, conversation] of memoryConversations.entries()) {
        if (conversation.id === id) {
          const updated = {
            ...conversation,
            ...updates,
            last_message_at: new Date().toISOString(),
          };
          memoryConversations.set(key, updated);
          return updated;
        }
      }
      return null;
    }

    try {
      const { data, error } = await supabase
        .from("conversations")
        .update({
          ...updates,
          last_message_at: new Date().toISOString(),
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

  async saveMessage(conversationId: string, role: "user" | "assistant" | "system_log", content: string, messageType: string = "text") {
    if (!isSupabaseConfigured) {
      const currentMessages = memoryMessages.get(conversationId) || [];
      const message: MessageRecord = {
        id: makeId("msg"),
        conversation_id: conversationId,
        role,
        content,
        message_type: messageType,
        created_at: new Date().toISOString(),
      };
      currentMessages.push(message);
      memoryMessages.set(conversationId, currentMessages);
      await this.updateConversationDetails(conversationId, {});
      return message;
    }

    try {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          role,
          content,
          message_type: messageType,
        })
        .select()
        .single();

      if (error) throw error;

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
    if (!isSupabaseConfigured) {
      const messages = memoryMessages.get(conversationId) || [];
      return messages.slice(-limit).map((message) => ({
        role: message.role,
        content: message.content,
      }));
    }

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

  async addToQueue(conversationId: string, text: string, delaySeconds: number) {
    if (!isSupabaseConfigured) {
      return {
        id: makeId("queue"),
        conversation_id: conversationId,
        pending_text: text,
        scheduled_for: new Date(Date.now() + delaySeconds * 1000).toISOString(),
        is_processed: false,
      };
    }

    try {
      const scheduledFor = new Date(Date.now() + delaySeconds * 1000).toISOString();
      const { data, error } = await supabase
        .from("message_queue")
        .insert({
          conversation_id: conversationId,
          pending_text: text,
          scheduled_for: scheduledFor,
          is_processed: false,
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
    if (!isSupabaseConfigured) {
      return [];
    }

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
    if (!isSupabaseConfigured) {
      return { id: queueId, is_processed: true };
    }

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

  async getKnowledgeBase() {
    if (!isSupabaseConfigured) {
      return Array.from(memoryKnowledge.values());
    }

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

  async createPendingConsultation(conversationId: string, vehicle: string, rim: number | null, query: string) {
    const topic = `consultation:${conversationId}`;
    const content = JSON.stringify({
      vehicle,
      rim,
      query,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    if (!isSupabaseConfigured) {
      const record: KnowledgeRecord = {
        id: memoryKnowledge.get(topic)?.id || makeId("kb"),
        topic,
        content,
        updated_at: new Date().toISOString(),
      };
      memoryKnowledge.set(topic, record);
      return record;
    }

    try {
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
      }

      const { data, error } = await supabase
        .from("knowledge_base")
        .insert({ topic, content })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Error creating pending consultation:", error);
      return null;
    }
  }

  async getPendingConsultations() {
    if (!isSupabaseConfigured) {
      const pending: any[] = [];
      for (const record of memoryKnowledge.values()) {
        if (!record.topic.startsWith("consultation:")) continue;
        try {
          const parsed = JSON.parse(record.content);
          if (parsed.status === "pending") {
            pending.push({
              id: record.id,
              conversation_id: record.topic.split(":")[1],
              ...parsed,
            });
          }
        } catch {
          // ignore parse errors
        }
      }
      return pending;
    }

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
              ...parsed,
            });
          }
        } catch {
          // ignore parse errors
        }
      }
      return pending;
    } catch (error) {
      console.error("Error getting pending consultations:", error);
      return [];
    }
  }

  async resolveConsultation(conversationId: string) {
    const topic = `consultation:${conversationId}`;

    if (!isSupabaseConfigured) {
      const existing = memoryKnowledge.get(topic);
      if (!existing) return false;
      try {
        const parsed = JSON.parse(existing.content);
        parsed.status = "resolved";
        parsed.resolved_at = new Date().toISOString();
        memoryKnowledge.set(topic, {
          ...existing,
          content: JSON.stringify(parsed),
          updated_at: new Date().toISOString(),
        });
        return true;
      } catch {
        memoryKnowledge.delete(topic);
        return true;
      }
    }

    try {
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
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);

          if (error) throw error;
          return true;
        } catch {
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

  async listConversationsFallback() {
    return Array.from(memoryConversations.values()).sort(sortByLastMessage);
  }

  async listMessagesFallback(conversationId: string) {
    return memoryMessages.get(conversationId) || [];
  }
}

export const dbService = new SupabaseService();
