# LIGA PRIME RUSH — Discord Bot

## Overview

A full-featured Discord championship management bot built with Node.js, TypeScript, and discord.js v14.

## Stack

- **Runtime**: Node.js + TypeScript
- **Discord library**: discord.js v14
- **Build**: esbuild (generates `dist/index.mjs`)
- **Data persistence**: JSON files per guild (`bot-data-{guildId}.json` at workspace root)
- **No database** — pure JSON storage

## Source Structure

```
artifacts/api-server/src/
  index.ts      — Entry point: Discord client setup, event handlers, prefix commands
  types.ts      — TypeScript interfaces (BotData, Session, Team, Drop, Config, etc.)
  data.ts       — loadData / saveData per guild
  points.ts     — calcPoints, embed builders (general + drop tables)
  webhooks.ts   — Webhook send/delete/update logic
  panel.ts      — Panel embed + buttons builder, updatePanel()
  handlers.ts   — All interaction handlers (buttons, selects, modals, slash commands)
```

## Key Files

- `discloud.config` — Discloud deploy config (NAME=PONTO RUSH, TYPE=bot)
- `bot-data-{guildId}.json` — Per-guild persistent data (auto-created)

## Environment Variables

- `DISCORD_TOKEN` — (secret) Discord bot token

## Features

- **/painel** — Creates a public control panel embed with interactive buttons
- **➕ Adicionar Times** — Modal to add teams (one per line, deduped)
- **📝 Registrar Resultados** — Step-by-step flow: drop → team → position → cosmos → kills
- **⚙️ Configurações** — Configure webhooks, org name, color, ADMs, remove teams, clear/reset
- **Webhooks** — Real-time general table + per-drop table (auto-updated after each result)
- **Prefix commands**: `.id`, `.adm`, `.Radm`, `.adms`
- **Per-guild isolation** — Each Discord server has its own independent data

## Point System

| Position | Points |
|----------|--------|
| 1st | 15 |
| 2nd | 10 |
| 3rd | 7 |
| 4th | 5 |
| 5th | 2 |
| 6th | 1 |
| 7th | 1 |
| 8th | 0 |

Bonuses: +1 per kill, +10 for Cosmos 🔮

## Commands

- `pnpm --filter @workspace/api-server run build` — Build bot
- `pnpm --filter @workspace/api-server run dev` — Build + run
