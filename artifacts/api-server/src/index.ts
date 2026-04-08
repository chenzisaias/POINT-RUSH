import http from "node:http";
import {
  Client,
  GatewayIntentBits,
  GuildMember,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuInteraction,
  Events,
} from "discord.js";
import { loadData, saveData } from "./data.js";
import { isAdmin, sessions, handleButton, handleSelect, handleModal, handleCommand, afterKillsRecorded } from "./handlers.js";

const token = process.env["DISCORD_TOKEN"];
if (!token) {
  console.error("DISCORD_TOKEN environment variable is required.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Bot online como ${c.user.tag}`);

  const command = new SlashCommandBuilder()
    .setName("painel")
    .setDescription("Cria o painel de controle do campeonato")
    .setDefaultMemberPermissions("32");

  const rest = new REST({ version: "10" }).setToken(token!);

  for (const guild of c.guilds.cache.values()) {
    try {
      await rest.put(Routes.applicationGuildCommands(c.user.id, guild.id), {
        body: [command.toJSON()],
      });
    } catch (err) {
      console.error(`Falha ao registrar comando na guild ${guild.id}:`, err);
    }
  }
});

client.on(Events.GuildCreate, async (guild) => {
  const command = new SlashCommandBuilder()
    .setName("painel")
    .setDescription("Cria o painel de controle do campeonato")
    .setDefaultMemberPermissions("32");

  const rest = new REST({ version: "10" }).setToken(token!);
  try {
    await rest.put(Routes.applicationGuildCommands(client.user!.id, guild.id), {
      body: [command.toJSON()],
    });
  } catch (err) {
    console.error(`Falha ao registrar comando na guild ${guild.id}:`, err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(client, interaction);
    } else if (interaction.isButton()) {
      await handleButton(client, interaction);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelect(client, interaction as StringSelectMenuInteraction);
    } else if (interaction.isModalSubmit()) {
      await handleModal(client, interaction);
    }
  } catch (err) {
    console.error("Erro na interação:", err);
    try {
      const i = interaction as { replied?: boolean; deferred?: boolean; reply?: (o: object) => Promise<void> };
      if (!i.replied && !i.deferred && i.reply) {
        await i.reply({ content: "❌ Ocorreu um erro interno.", ephemeral: true } as object);
      }
    } catch {}
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const guildId = message.guild.id;
  const data = loadData(guildId);
  const member = message.member as GuildMember;
  const content = message.content.trim();

  if (content.startsWith(".adms")) {
    if (!isAdmin(member, data)) return;
    if (data.config.adminIds.length === 0) {
      await message.reply("Nenhum ADM extra configurado.");
    } else {
      const list = data.config.adminIds.map((id, i) => `${i + 1}. <@${id}> — \`${id}\``).join("\n");
      await message.reply(`👤 Lista de ADMs do Bot:\n${list}`);
    }
    return;
  }

  if (content.toLowerCase().startsWith(".radm")) {
    if (!isAdmin(member, data)) return;
    const mentioned = message.mentions.users.first();
    if (!mentioned) {
      await message.reply("❌ Mencione o usuário: .Radm @usuário");
      return;
    }
    if (!data.config.adminIds.includes(mentioned.id)) {
      await message.reply(`❌ <@${mentioned.id}> não é ADM do bot.`);
      return;
    }
    data.config.adminIds = data.config.adminIds.filter((id) => id !== mentioned.id);
    saveData(guildId, data);
    await message.reply(`✅ <@${mentioned.id}> removido dos ADMs do bot!`);
    return;
  }

  if (content.toLowerCase().startsWith(".adm")) {
    if (!isAdmin(member, data)) return;
    const mentioned = message.mentions.users.first();
    if (!mentioned) {
      await message.reply("❌ Mencione o usuário: .adm @usuário");
      return;
    }
    if (!data.config.adminIds.includes(mentioned.id)) {
      data.config.adminIds.push(mentioned.id);
      saveData(guildId, data);
    }
    await message.reply(`✅ <@${mentioned.id}> adicionado como ADM do bot!`);
    return;
  }

  if (content.toLowerCase().startsWith(".id")) {
    const mentioned = message.mentions.users.first();
    if (mentioned) {
      await message.reply(`🆔 ID de <@${mentioned.id}>: \`${mentioned.id}\``);
    } else {
      await message.reply(`🆔 Seu ID: \`${message.author.id}\``);
    }
    return;
  }

  const session = sessions.get(message.author.id);
  if (session && session.waitingForKills && session.channelId === message.channelId) {
    const kills = parseInt(content, 10);
    if (isNaN(kills) || kills < 0) {
      try { await message.delete(); } catch {}
      return;
    }
    try { await message.delete(); } catch {}

    const freshData = loadData(guildId);
    recordResult(freshData, session.dropNumber, session.teamId!, session.position!, kills, session.cosmos!);
    saveData(guildId, freshData);

    await afterKillsRecorded(client, guildId, freshData, session);
  }
});

const port = Number(process.env["PORT"] ?? 8080);
http.createServer((_, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("LIGA PRIME RUSH bot running\n");
}).listen(port, () => {
  console.log(`Health server listening on port ${port}`);
});

client.login(token);
