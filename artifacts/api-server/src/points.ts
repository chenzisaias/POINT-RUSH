import { BotData, Drop, DropResult, Team } from "./types.js";

export const POSITION_POINTS: Record<number, number> = {
  1: 15, 2: 10, 3: 7, 4: 5,
  5: 2, 6: 1, 7: 1, 8: 0,
};

export const MEDALS: Record<number, string> = {
  1: "🥇", 2: "🥈", 3: "🥉",
};

export function calcPoints(position: number, kills: number, cosmos: boolean): number {
  return (POSITION_POINTS[position] ?? 0) + kills + (cosmos ? 10 : 0);
}

export function recordResult(
  data: BotData,
  dropNumber: number,
  teamId: string,
  position: number,
  kills: number,
  cosmos: boolean,
): void {
  let drop = data.drops.find((d) => d.number === dropNumber);
  if (!drop) {
    drop = { number: dropNumber, results: [] };
    data.drops.push(drop);
  }
  const existing = drop.results.findIndex((r) => r.teamId === teamId);
  const result: DropResult = { teamId, position, kills, cosmos };
  if (existing >= 0) {
    drop.results[existing] = result;
  } else {
    drop.results.push(result);
  }
}

interface TeamStats {
  teamId: string;
  name: string;
  pts: number;
  kills: number;
  wins: number;
}

export function buildGeneralStats(data: BotData): TeamStats[] {
  const stats: Record<string, TeamStats> = {};
  for (const team of data.teams) {
    stats[team.id] = { teamId: team.id, name: team.name, pts: 0, kills: 0, wins: 0 };
  }
  for (const drop of data.drops) {
    for (const r of drop.results) {
      if (!stats[r.teamId]) {
        const t = data.teams.find((t) => t.id === r.teamId);
        stats[r.teamId] = { teamId: r.teamId, name: t?.name ?? r.teamId, pts: 0, kills: 0, wins: 0 };
      }
      stats[r.teamId].pts += calcPoints(r.position, r.kills, r.cosmos);
      stats[r.teamId].kills += r.kills;
      if (r.position === 1) stats[r.teamId].wins += 1;
    }
  }
  return Object.values(stats).sort((a, b) => b.pts - a.pts || b.kills - a.kills);
}

export function buildDropStats(data: BotData, drop: Drop): TeamStats[] {
  const stats: TeamStats[] = [];
  for (const r of drop.results) {
    const team = data.teams.find((t) => t.id === r.teamId);
    stats.push({
      teamId: r.teamId,
      name: team?.name ?? r.teamId,
      pts: calcPoints(r.position, r.kills, r.cosmos),
      kills: r.kills,
      wins: r.position === 1 ? 1 : 0,
    });
  }
  return stats.sort((a, b) => b.pts - a.pts || b.kills - a.kills);
}

export function positionLabel(idx: number): string {
  return MEDALS[idx + 1] ?? `${idx + 1}º`;
}

function timeNow(): string {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function buildGeneralEmbed(data: BotData): object {
  const color = parseInt(data.config.embedColor.replace("#", ""), 16);
  const stats = buildGeneralStats(data);
  const lines = stats.map((s, i) => `${positionLabel(i)}  ${s.name}: ${s.pts} pts | ${s.kills} kills | ${s.wins} wins`);
  return {
    color,
    description: `# 🏆 TABELA GERAL — ${data.config.orgName}\n\n${lines.join("\n") || "_Nenhum resultado ainda._"}`,
    footer: { text: `${data.config.orgName}  ·  ${timeNow()}  ·  TABELA GERAL` },
  };
}

export function buildDropEmbed(data: BotData, drop: Drop): object {
  const color = parseInt(data.config.embedColor.replace("#", ""), 16);
  const stats = buildDropStats(data, drop);
  const dropResults = drop.results;
  const lines = stats.map((s, i) => {
    const r = dropResults.find((r) => r.teamId === s.teamId);
    const cosmosStr = r?.cosmos ? " 🔮  " : "  ";
    return `${positionLabel(i)}  ${s.name}:${cosmosStr}${s.pts} pts | ${s.kills} kills | ${s.wins} wins`;
  });
  return {
    color,
    description: `# 🪂 QUEDA ${drop.number} — PRIME RUSH\n\n${lines.join("\n") || "_Nenhum resultado ainda._"}`,
    footer: { text: `${data.config.orgName}  ·  ${timeNow()}  ·  TABELA DE QUEDA` },
  };
}
