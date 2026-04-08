import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { BotData } from "./types.js";

export function buildPanelEmbed(data: BotData): EmbedBuilder {
  const color = parseInt(data.config.embedColor.replace("#", ""), 16);
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`🏆 ${data.config.orgName}`)
    .setDescription("Painel de Controle do Campeonato")
    .addFields(
      { name: "Times Cadastrados", value: String(data.teams.length), inline: true },
      { name: "Quedas Registradas", value: String(data.drops.length), inline: true },
      { name: "Organização", value: data.config.orgName, inline: true },
      { name: "Cor", value: data.config.embedColor, inline: true },
    )
    .setFooter({ text: "LIGA PRIME RUSH | Painel de Controle" });
}

export function buildPanelRow(): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("btn_add_teams").setLabel("➕ Adicionar Times").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("btn_register_results").setLabel("📝 Registrar Resultados").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("btn_settings").setLabel("⚙️ Configurações").setStyle(ButtonStyle.Secondary),
  );
}

export async function updatePanel(client: Client, data: BotData): Promise<void> {
  if (!data.config.panelChannelId || !data.config.panelMessageId) return;
  try {
    const channel = await client.channels.fetch(data.config.panelChannelId);
    if (!channel || !channel.isTextBased()) return;
    const msg = await (channel as import("discord.js").TextChannel).messages.fetch(data.config.panelMessageId);
    await msg.edit({ embeds: [buildPanelEmbed(data)], components: [buildPanelRow()] });
  } catch {
  }
}
