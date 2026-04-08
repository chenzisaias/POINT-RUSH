import fs from "node:fs";
import path from "node:path";
import { BotData } from "./types.js";

const DATA_DIR = process.cwd();

function dataPath(guildId: string): string {
  return path.join(DATA_DIR, `bot-data-${guildId}.json`);
}

const DEFAULT_DATA: BotData = {
  teams: [],
  drops: [],
  config: {
    orgName: "LIGA PRIME RUSH",
    embedColor: "#FFD700",
    adminIds: [],
    webhookDropsMessageIds: {},
  },
};

export function loadData(guildId: string): BotData {
  const p = dataPath(guildId);
  try {
    if (!fs.existsSync(p)) return JSON.parse(JSON.stringify(DEFAULT_DATA));
    const raw = fs.readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw) as Partial<BotData>;
    return {
      teams: parsed.teams ?? [],
      drops: parsed.drops ?? [],
      config: {
        ...DEFAULT_DATA.config,
        ...(parsed.config ?? {}),
        webhookDropsMessageIds: parsed.config?.webhookDropsMessageIds ?? {},
        adminIds: parsed.config?.adminIds ?? [],
      },
    };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
}

export function saveData(guildId: string, data: BotData): void {
  const p = dataPath(guildId);
  try {
    fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
  } catch {
  }
}
