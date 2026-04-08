import { BotData } from "./types.js";
import { buildGeneralEmbed, buildDropEmbed } from "./points.js";
import { saveData } from "./data.js";

async function deleteWebhookMessage(webhookUrl: string, messageId: string): Promise<void> {
  try {
    await fetch(`${webhookUrl}/messages/${messageId}`, { method: "DELETE" });
  } catch {
  }
}

async function postWebhookEmbed(webhookUrl: string, embed: object): Promise<string | null> {
  try {
    const res = await fetch(`${webhookUrl}?wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
    if (!res.ok) return null;
    const json = await res.json() as { id?: string };
    return json.id ?? null;
  } catch {
    return null;
  }
}

export async function sendWebhooks(guildId: string, data: BotData, dropNumber?: number): Promise<void> {
  if (data.config.webhookGeneral) {
    if (data.config.webhookGeneralMessageId) {
      await deleteWebhookMessage(data.config.webhookGeneral, data.config.webhookGeneralMessageId);
    }
    const embed = buildGeneralEmbed(data);
    const newId = await postWebhookEmbed(data.config.webhookGeneral, embed);
    if (newId) {
      data.config.webhookGeneralMessageId = newId;
      saveData(guildId, data);
    }
  }

  if (data.config.webhookDrops && dropNumber !== undefined) {
    const drop = data.drops.find((d) => d.number === dropNumber);
    if (drop) {
      const oldId = data.config.webhookDropsMessageIds[String(dropNumber)];
      if (oldId) {
        await deleteWebhookMessage(data.config.webhookDrops, oldId);
      }
      const embed = buildDropEmbed(data, drop);
      const newId = await postWebhookEmbed(data.config.webhookDrops, embed);
      if (newId) {
        data.config.webhookDropsMessageIds[String(dropNumber)] = newId;
        saveData(guildId, data);
      }
    }
  }
}

export async function deleteAllWebhookMessages(guildId: string, data: BotData): Promise<void> {
  if (data.config.webhookDrops) {
    for (const [, msgId] of Object.entries(data.config.webhookDropsMessageIds)) {
      await deleteWebhookMessage(data.config.webhookDrops, msgId);
    }
  }
  if (data.config.webhookGeneral && data.config.webhookGeneralMessageId) {
    await deleteWebhookMessage(data.config.webhookGeneral, data.config.webhookGeneralMessageId);
  }
  data.config.webhookDropsMessageIds = {};
  data.config.webhookGeneralMessageId = undefined;
  saveData(guildId, data);
}

export async function deleteDropWebhookMessage(guildId: string, data: BotData, dropNumber: number): Promise<void> {
  const msgId = data.config.webhookDropsMessageIds[String(dropNumber)];
  if (msgId && data.config.webhookDrops) {
    await deleteWebhookMessage(data.config.webhookDrops, msgId);
    delete data.config.webhookDropsMessageIds[String(dropNumber)];
    saveData(guildId, data);
  }
}
