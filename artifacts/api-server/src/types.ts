export interface Team {
  id: string;
  name: string;
}

export interface DropResult {
  teamId: string;
  position: number;
  kills: number;
  cosmos: boolean;
}

export interface Drop {
  number: number;
  results: DropResult[];
}

export interface Config {
  webhookGeneral?: string;
  webhookDrops?: string;
  orgName: string;
  embedColor: string;
  adminIds: string[];
  panelChannelId?: string;
  panelMessageId?: string;
  webhookGeneralMessageId?: string;
  webhookDropsMessageIds: Record<string, string>;
}

export interface BotData {
  teams: Team[];
  drops: Drop[];
  config: Config;
}

export interface Session {
  userId: string;
  dropNumber: number;
  teamId?: string;
  teamName?: string;
  position?: number;
  cosmos?: boolean;
  channelId: string;
  waitingForKills: boolean;
  interaction: import("discord.js").MessageComponentInteraction | import("discord.js").ChatInputCommandInteraction;
}
