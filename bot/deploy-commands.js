/**
 * One-shot script — register slash commands with Discord.
 * Run with: npm run deploy-commands
 * Re-run whenever you add or change a command.
 */
import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { readdir } from 'fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const files = (await readdir(commandsPath)).filter(f => f.endsWith('.js'));

for (const file of files) {
  const mod = await import(pathToFileURL(path.join(commandsPath, file)).href);
  const command = mod.default;
  if (command?.data) commands.push(command.data.toJSON());
}

const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN);

console.log(`[deploy] Registering ${commands.length} command(s)...`);

await rest.put(
  Routes.applicationGuildCommands(
    process.env.DISCORD_CLIENT_ID,
    process.env.DISCORD_GUILD_ID,
  ),
  { body: commands },
);

console.log('[deploy] Done.');
