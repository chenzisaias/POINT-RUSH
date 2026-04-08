import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  GuildMember,
  MessageComponentInteraction,
  ModalBuilder,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { BotData, Session } from "./types.js";
import { loadData, saveData } from "./data.js";
import { recordResult, buildGeneralEmbed, buildDropEmbed } from "./points.js";
import { sendWebhooks, deleteAllWebhookMessages, deleteDropWebhookMessage } from "./webhooks.js";
import { buildPanelEmbed, buildPanelRow, updatePanel } from "./panel.js";

export const sessions = new Map<string, Session>();

export function isAdmin(member: GuildMember, data: BotData): boolean {
  const perms = member.permissions;
  return (
    perms.has("Administrator") ||
    perms.has("ManageGuild") ||
    data.config.adminIds.includes(member.id)
  );
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 7);
}

function getOccupiedPositions(data: BotData, dropNumber: number): Set<number> {
  const drop = data.drops.find((d) => d.number === dropNumber);
  const occupied = new Set<number>();
  if (drop) {
    for (const r of drop.results) occupied.add(r.position);
  }
  return occupied;
}

function getRegisteredTeamIds(data: BotData, dropNumber: number): Set<string> {
  const drop = data.drops.find((d) => d.number === dropNumber);
  const registered = new Set<string>();
  if (drop) {
    for (const r of drop.results) registered.add(r.teamId);
  }
  return registered;
}

function buildSettingsEmbed(data: BotData): EmbedBuilder {
  const color = parseInt(data.config.embedColor.replace("#", ""), 16);
  const admList = data.config.adminIds.length > 0
    ? data.config.adminIds.map((id) => `<@${id}>`).join(", ")
    : "Nenhum";
  return new EmbedBuilder()
    .setColor(color)
    .setTitle("⚙️ Configurações")
    .addFields(
      { name: "📊 Webhook Geral", value: data.config.webhookGeneral ? "✅ Configurado" : "❌ Não configurado", inline: true },
      { name: "🪂 Webhook Quedas", value: data.config.webhookDrops ? "✅ Configurado" : "❌ Não configurado", inline: true },
      { name: "🏢 Organização", value: data.config.orgName, inline: true },
      { name: "🎨 Cor", value: data.config.embedColor, inline: true },
      { name: "👤 ADMs Extra", value: admList, inline: false },
    );
}

function buildSettingsRows(): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  const row1 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("btn_cfg_webhook_general").setLabel("📊 Webhook Geral").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("btn_cfg_webhook_drops").setLabel("🪂 Webhook Quedas").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("btn_cfg_org").setLabel("🏢 Organização").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("btn_cfg_color").setLabel("🎨 Cor").setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("btn_cfg_admins").setLabel("👤 ADMs").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("btn_cfg_remove_team").setLabel("❌ Remover Time").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("btn_cfg_clear").setLabel("🧹 Limpar Resultados").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("btn_cfg_reset").setLabel("🔄 Resetar Campeonato").setStyle(ButtonStyle.Danger),
  );
  return [row1, row2];
}

async function showTeamSelect(
  interaction: MessageComponentInteraction,
  guildId: string,
  data: BotData,
  session: Session,
): Promise<void> {
  const registeredIds = getRegisteredTeamIds(data, session.dropNumber);
  const available = data.teams.filter((t) => !registeredIds.has(t.id)).slice(0, 25);
  if (available.length === 0) {
    await interaction.editReply({
      content: `✅ Todos os times já foram registrados na Queda ${session.dropNumber}!`,
      components: [],
    });
    sessions.delete(session.userId);
    return;
  }
  const select = new StringSelectMenuBuilder()
    .setCustomId("select_team")
    .setPlaceholder("Selecione um time...")
    .addOptions(available.map((t) => ({ label: t.name, value: t.id })));
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select);
  await interaction.editReply({
    content: `**Queda ${session.dropNumber}** — Selecione o time:`,
    components: [row],
  });
}

export async function afterKillsRecorded(
  client: Client,
  guildId: string,
  data: BotData,
  session: Session,
): Promise<void> {
  sendWebhooks(guildId, data, session.dropNumber).catch(() => {});
  saveData(guildId, data);
  await updatePanel(client, data);

  const registeredIds = getRegisteredTeamIds(data, session.dropNumber);
  const available = data.teams.filter((t) => !registeredIds.has(t.id));

  if (available.length === 0) {
    sessions.delete(session.userId);
    try {
      await session.interaction.editReply({
        content: `✅ Queda ${session.dropNumber} concluída! Tabelas atualizadas nos webhooks.`,
        components: [],
      });
    } catch {}
    return;
  }

  session.waitingForKills = false;
  session.teamId = undefined;
  session.teamName = undefined;
  session.position = undefined;
  session.cosmos = undefined;
  await showTeamSelect(session.interaction as MessageComponentInteraction, guildId, data, session);
}

export async function handleButton(
  client: Client,
  interaction: MessageComponentInteraction,
): Promise<void> {
  const guildId = interaction.guildId!;
  const data = loadData(guildId);
  const member = interaction.member as GuildMember;

  if (!isAdmin(member, data)) {
    await interaction.reply({ content: "❌ Você não tem permissão para usar isso.", ephemeral: true });
    return;
  }

  const id = interaction.customId;

  if (id === "btn_add_teams") {
    const modal = new ModalBuilder().setCustomId("modal_add_teams").setTitle("Adicionar Times");
    const input = new TextInputBuilder()
      .setCustomId("teams_input")
      .setLabel("Times (um por linha)")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Time Alpha\nTime Beta\nTime Gama")
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  if (id === "btn_register_results") {
    if (data.teams.length === 0) {
      await interaction.reply({ content: "❌ Nenhum time cadastrado. Adicione times primeiro!", ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const options = Array.from({ length: 10 }, (_, i) => {
      const n = i + 1;
      const drop = data.drops.find((d) => d.number === n);
      const hasResults = drop && drop.results.length > 0;
      return {
        label: `${hasResults ? "✅ " : ""}Queda ${n}`,
        value: String(n),
        description: hasResults ? "Já tem resultados" : "Sem resultados",
      };
    });
    const select = new StringSelectMenuBuilder()
      .setCustomId("select_drop")
      .setPlaceholder("Selecione a queda...")
      .addOptions(options);
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select);
    await interaction.editReply({ content: "Selecione a **Queda** para registrar resultados:", components: [row] });
    return;
  }

  if (id === "btn_settings") {
    await interaction.reply({
      embeds: [buildSettingsEmbed(data)],
      components: buildSettingsRows(),
      ephemeral: true,
    });
    return;
  }

  if (id.startsWith("btn_pos_")) {
    const session = sessions.get(interaction.user.id);
    if (!session) {
      await interaction.reply({ content: "❌ Sessão expirada. Use 📝 Registrar Resultados novamente.", ephemeral: true });
      return;
    }
    const pos = parseInt(id.replace("btn_pos_", ""), 10);
    session.position = pos;
    session.interaction = interaction;
    await interaction.deferUpdate();
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("btn_cosmos_yes").setLabel("✅ SIM +10pts").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("btn_cosmos_no").setLabel("❌ NÃO").setStyle(ButtonStyle.Danger),
    );
    await interaction.editReply({ content: `**${session.teamName}** — Posição **${pos}º**\nPegou o Cosmos? (+10 pts)`, components: [row] });
    return;
  }

  if (id === "btn_cosmos_yes" || id === "btn_cosmos_no") {
    const session = sessions.get(interaction.user.id);
    if (!session) {
      await interaction.reply({ content: "❌ Sessão expirada. Use 📝 Registrar Resultados novamente.", ephemeral: true });
      return;
    }
    session.cosmos = id === "btn_cosmos_yes";
    session.waitingForKills = true;
    session.interaction = interaction;
    await interaction.deferUpdate();
    await interaction.editReply({ content: "⌨️ Agora digite o número de kills no chat:", components: [] });
    return;
  }

  if (id === "btn_cfg_webhook_general") {
    const modal = new ModalBuilder().setCustomId("modal_cfg_webhook_general").setTitle("Webhook Geral");
    const input = new TextInputBuilder()
      .setCustomId("value")
      .setLabel("URL do Webhook Geral")
      .setStyle(TextInputStyle.Short)
      .setValue(data.config.webhookGeneral ?? "")
      .setRequired(false);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  if (id === "btn_cfg_webhook_drops") {
    const modal = new ModalBuilder().setCustomId("modal_cfg_webhook_drops").setTitle("Webhook Quedas");
    const input = new TextInputBuilder()
      .setCustomId("value")
      .setLabel("URL do Webhook Quedas")
      .setStyle(TextInputStyle.Short)
      .setValue(data.config.webhookDrops ?? "")
      .setRequired(false);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  if (id === "btn_cfg_org") {
    const modal = new ModalBuilder().setCustomId("modal_cfg_org").setTitle("Nome da Organização");
    const input = new TextInputBuilder()
      .setCustomId("value")
      .setLabel("Nome da Organização")
      .setStyle(TextInputStyle.Short)
      .setValue(data.config.orgName)
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  if (id === "btn_cfg_color") {
    const modal = new ModalBuilder().setCustomId("modal_cfg_color").setTitle("Cor do Embed");
    const input = new TextInputBuilder()
      .setCustomId("value")
      .setLabel("Cor em HEX (ex: #FFD700)")
      .setStyle(TextInputStyle.Short)
      .setValue(data.config.embedColor)
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  if (id === "btn_cfg_admins") {
    await interaction.deferReply({ ephemeral: true });
    const admList = data.config.adminIds.length > 0
      ? data.config.adminIds.map((id, i) => `${i + 1}. <@${id}> — \`${id}\``).join("\n")
      : "Nenhum ADM extra configurado.";
    const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("btn_add_adm").setLabel("➕ Adicionar ADM").setStyle(ButtonStyle.Success),
      ),
    ];
    if (data.config.adminIds.length > 0) {
      const select = new StringSelectMenuBuilder()
        .setCustomId("select_remove_admin")
        .setPlaceholder("Selecione ADM para remover...")
        .addOptions(data.config.adminIds.slice(0, 25).map((id) => ({ label: id, value: id })));
      rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select));
    }
    await interaction.editReply({ content: `👤 **ADMs do Bot:**\n${admList}`, components: rows });
    return;
  }

  if (id === "btn_add_adm") {
    const modal = new ModalBuilder().setCustomId("modal_add_adm").setTitle("Adicionar ADM");
    const input = new TextInputBuilder()
      .setCustomId("value")
      .setLabel("ID ou @menção do usuário")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  if (id === "btn_cfg_remove_team") {
    if (data.teams.length === 0) {
      await interaction.reply({ content: "❌ Nenhum time cadastrado.", ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const select = new StringSelectMenuBuilder()
      .setCustomId("select_remove_team")
      .setPlaceholder("Selecione o time para remover...")
      .addOptions(data.teams.slice(0, 25).map((t) => ({ label: t.name, value: t.id })));
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select);
    await interaction.editReply({ content: "Selecione o time a remover:", components: [row] });
    return;
  }

  if (id === "btn_cfg_clear") {
    await interaction.deferReply({ ephemeral: true });
    const options: { label: string; value: string }[] = [{ label: "🧹 Limpar TUDO", value: "all" }];
    for (const drop of data.drops) {
      options.push({ label: `❌ Limpar Queda ${drop.number}`, value: String(drop.number) });
    }
    const select = new StringSelectMenuBuilder()
      .setCustomId("select_clear_drop")
      .setPlaceholder("Selecione o que limpar...")
      .addOptions(options.slice(0, 25));
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select);
    await interaction.editReply({ content: "Selecione o que limpar:", components: [row] });
    return;
  }

  if (id === "btn_cfg_reset") {
    await interaction.reply({
      content: "⚠️ Isso APAGARÁ times e resultados. Confirmar?",
      components: [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder().setCustomId("btn_confirm_reset").setLabel("✅ Confirmar").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("btn_cancel").setLabel("❌ Cancelar").setStyle(ButtonStyle.Secondary),
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  if (id === "btn_confirm_reset") {
    await interaction.deferUpdate();
    await deleteAllWebhookMessages(guildId, data);
    data.teams = [];
    data.drops = [];
    saveData(guildId, data);
    await updatePanel(client, data);
    await interaction.editReply({ content: "✅ Campeonato resetado! Todas as tabelas removidas.", components: [] });
    return;
  }

  if (id === "btn_confirm_clear") {
    await interaction.deferUpdate();
    await deleteAllWebhookMessages(guildId, data);
    data.drops = [];
    saveData(guildId, data);
    await updatePanel(client, data);
    sendWebhooks(guildId, data).catch(() => {});
    await interaction.editReply({ content: "✅ Todos os resultados limpos! Tabelas atualizadas.", components: [] });
    return;
  }

  if (id.startsWith("btn_confirm_clear_drop_")) {
    const n = parseInt(id.replace("btn_confirm_clear_drop_", ""), 10);
    await interaction.deferUpdate();
    await deleteDropWebhookMessage(guildId, data, n);
    data.drops = data.drops.filter((d) => d.number !== n);
    saveData(guildId, data);
    await updatePanel(client, data);
    sendWebhooks(guildId, data).catch(() => {});
    await interaction.editReply({ content: `✅ Resultados da Queda ${n} limpos! Tabelas atualizadas.`, components: [] });
    return;
  }

  if (id === "btn_cancel") {
    await interaction.update({ content: "❌ Operação cancelada.", components: [] });
    return;
  }
}

export async function handleSelect(
  client: Client,
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const guildId = interaction.guildId!;
  const data = loadData(guildId);
  const member = interaction.member as GuildMember;

  if (!isAdmin(member, data)) {
    await interaction.reply({ content: "❌ Você não tem permissão.", ephemeral: true });
    return;
  }

  const id = interaction.customId;
  const value = interaction.values[0];

  if (id === "select_drop") {
    await interaction.deferUpdate();
    const dropNumber = parseInt(value, 10);
    let session = sessions.get(interaction.user.id);
    if (!session) {
      session = {
        userId: interaction.user.id,
        dropNumber,
        channelId: interaction.channelId,
        waitingForKills: false,
        interaction,
      };
      sessions.set(interaction.user.id, session);
    } else {
      session.dropNumber = dropNumber;
      session.teamId = undefined;
      session.teamName = undefined;
      session.position = undefined;
      session.cosmos = undefined;
      session.interaction = interaction;
    }
    await showTeamSelect(interaction, guildId, data, session);
    return;
  }

  if (id === "select_team") {
    const session = sessions.get(interaction.user.id);
    if (!session) {
      await interaction.reply({ content: "❌ Sessão expirada.", ephemeral: true });
      return;
    }
    await interaction.deferUpdate();
    const team = data.teams.find((t) => t.id === value);
    if (!team) {
      await interaction.editReply({ content: "❌ Time não encontrado.", components: [] });
      return;
    }
    session.teamId = team.id;
    session.teamName = team.name;
    session.interaction = interaction;

    const occupied = getOccupiedPositions(data, session.dropNumber);
    const buttons = Array.from({ length: 8 }, (_, i) => {
      const pos = i + 1;
      const isOccupied = occupied.has(pos);
      return new ButtonBuilder()
        .setCustomId(`btn_pos_${pos}`)
        .setLabel(`${pos}º`)
        .setStyle(isOccupied ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setDisabled(isOccupied);
    });
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...buttons);
    await interaction.editReply({
      content: `**${team.name}** na Queda ${session.dropNumber} — Selecione a posição:`,
      components: [row],
    });
    return;
  }

  if (id === "select_remove_admin") {
    await interaction.deferUpdate();
    data.config.adminIds = data.config.adminIds.filter((a) => a !== value);
    saveData(guildId, data);
    await interaction.editReply({ content: `✅ ADM <@${value}> removido.`, components: [] });
    return;
  }

  if (id === "select_remove_team") {
    await interaction.deferUpdate();
    data.teams = data.teams.filter((t) => t.id !== value);
    saveData(guildId, data);
    await updatePanel(client, data);
    await interaction.editReply({ content: "✅ Time removido!", components: [] });
    return;
  }

  if (id === "select_clear_drop") {
    await interaction.deferUpdate();
    if (value === "all") {
      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("btn_confirm_clear").setLabel("✅ Confirmar").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("btn_cancel").setLabel("❌ Cancelar").setStyle(ButtonStyle.Secondary),
      );
      await interaction.editReply({ content: "⚠️ Limpar TODOS os resultados? Isso não pode ser desfeito.", components: [row] });
    } else {
      const n = parseInt(value, 10);
      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`btn_confirm_clear_drop_${n}`).setLabel("✅ Confirmar").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("btn_cancel").setLabel("❌ Cancelar").setStyle(ButtonStyle.Secondary),
      );
      await interaction.editReply({ content: `⚠️ Limpar resultados da Queda ${n}? Isso não pode ser desfeito.`, components: [row] });
    }
    return;
  }
}

export async function handleModal(
  client: Client,
  interaction: ModalSubmitInteraction,
): Promise<void> {
  const guildId = interaction.guildId!;
  const data = loadData(guildId);
  const member = interaction.member as GuildMember;

  if (!isAdmin(member, data)) {
    await interaction.reply({ content: "❌ Você não tem permissão.", ephemeral: true });
    return;
  }

  const id = interaction.customId;

  if (id === "modal_add_teams") {
    await interaction.deferReply({ ephemeral: true });
    const raw = interaction.fields.getTextInputValue("teams_input");
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    const existingNames = new Set(data.teams.map((t) => t.name.toLowerCase()));
    let added = 0;
    for (const name of lines) {
      if (!existingNames.has(name.toLowerCase())) {
        data.teams.push({ id: `team_${Date.now()}_${randomId()}`, name });
        existingNames.add(name.toLowerCase());
        added++;
      }
    }
    saveData(guildId, data);
    await updatePanel(client, data);
    await interaction.editReply({ content: `✅ ${added} time(s) adicionado(s)! Total: ${data.teams.length} times.` });
    return;
  }

  if (id === "modal_cfg_webhook_general") {
    await interaction.deferReply({ ephemeral: true });
    const val = interaction.fields.getTextInputValue("value").trim();
    data.config.webhookGeneral = val || undefined;
    saveData(guildId, data);
    await interaction.editReply({ content: `✅ Webhook Geral ${val ? "atualizado" : "removido"}!` });
    return;
  }

  if (id === "modal_cfg_webhook_drops") {
    await interaction.deferReply({ ephemeral: true });
    const val = interaction.fields.getTextInputValue("value").trim();
    data.config.webhookDrops = val || undefined;
    saveData(guildId, data);
    await interaction.editReply({ content: `✅ Webhook Quedas ${val ? "atualizado" : "removido"}!` });
    return;
  }

  if (id === "modal_cfg_org") {
    await interaction.deferReply({ ephemeral: true });
    const val = interaction.fields.getTextInputValue("value").trim();
    if (!val) {
      await interaction.editReply({ content: "❌ Nome não pode ser vazio." });
      return;
    }
    data.config.orgName = val;
    saveData(guildId, data);
    await updatePanel(client, data);
    await interaction.editReply({ content: `✅ Organização atualizada para **${val}**!` });
    return;
  }

  if (id === "modal_cfg_color") {
    await interaction.deferReply({ ephemeral: true });
    const val = interaction.fields.getTextInputValue("value").trim();
    if (!/^#[0-9A-Fa-f]{6}$/.test(val)) {
      await interaction.editReply({ content: "❌ Cor inválida. Use formato HEX como #FFD700." });
      return;
    }
    data.config.embedColor = val;
    saveData(guildId, data);
    await updatePanel(client, data);
    await interaction.editReply({ content: `✅ Cor atualizada para **${val}**!` });
    return;
  }

  if (id === "modal_add_adm") {
    await interaction.deferReply({ ephemeral: true });
    let raw = interaction.fields.getTextInputValue("value").trim();
    raw = raw.replace(/^<@!?/, "").replace(/>$/, "");
    if (!raw || !/^\d+$/.test(raw)) {
      await interaction.editReply({ content: "❌ ID inválido." });
      return;
    }
    if (!data.config.adminIds.includes(raw)) {
      data.config.adminIds.push(raw);
      saveData(guildId, data);
    }
    await interaction.editReply({ content: `✅ ADM <@${raw}> adicionado.` });
    return;
  }
}

export async function handleCommand(
  client: Client,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (interaction.commandName !== "painel") return;
  const member = interaction.member as GuildMember;
  if (!member.permissions.has("ManageGuild")) {
    await interaction.reply({ content: "❌ Você precisa da permissão **Gerenciar Servidor** para usar este comando.", ephemeral: true });
    return;
  }

  const guildId = interaction.guildId!;
  const data = loadData(guildId);

  if (data.config.panelChannelId && data.config.panelMessageId) {
    try {
      const ch = await client.channels.fetch(data.config.panelChannelId);
      if (ch && ch.isTextBased()) {
        const msg = await (ch as import("discord.js").TextChannel).messages.fetch(data.config.panelMessageId);
        await msg.delete();
      }
    } catch {}
  }

  const msg = await interaction.channel!.send({
    embeds: [buildPanelEmbed(data)],
    components: [buildPanelRow()],
  });

  data.config.panelChannelId = interaction.channelId;
  data.config.panelMessageId = msg.id;
  saveData(guildId, data);

  await interaction.reply({ content: "✅ Painel criado!", ephemeral: true });
}
