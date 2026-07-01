// post-announcement.mjs — one-off: post a custom announcement to #announcements AS the TM bot.
//
// The bot's normal announcements.js only sends FIXED templated cycle messages. This is a manual,
// ST-approved announcement (downtime open + next game), so it's a separate one-off.
//
// SAFETY: dry-run by default — logs in, resolves the channel, prints what WOULD be sent, sends
// NOTHING. Pass --post to actually send. Logs in with the bot token from bot/.env and exits.
//
//   Dry run:  node scripts/post-announcement.mjs        (run from the bot/ dir)
//   Post:     node scripts/post-announcement.mjs --post
//
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Client, GatewayIntentBits, ChannelType } from 'discord.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const POST = process.argv.includes('--post');
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
// Target the announcements channel by ID (the channel is named "#announcments" — a typo — and is a
// Discord Announcement/News channel; resolving by id avoids the misspelling). Name kept as fallback.
const TARGET_ID = '1430387123474796554';
const TARGET_NAME = 'announcments';

// ── The approved message ──────────────────────────────────────────────────────
const MESSAGE = [
  '@everyone',
  '',
  '📬 **Downtime is open: Game 5**',
  '',
  'Downtime submissions for Game 5 are now open. Get your actions in before the deadline.',
  '',
  '🗓️ **Submissions close:** Wednesday 8 July, midnight',
  '🎲 **Next game:** Saturday 18 July. Doors 5:30pm, play 6:00pm to 9:30pm',
].join('\n');
// Previous post (without @everyone) to remove after the new one lands. '' to skip.
const REPLACE_MSG_ID = '1519545497830817956';
// ──────────────────────────────────────────────────────────────────────────────

if (!TOKEN || !GUILD_ID) { console.error('Missing DISCORD_BOT_TOKEN / DISCORD_GUILD_ID in bot/.env'); process.exit(1); }

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', async () => {
  try {
    console.log(`Logged in as ${client.user.tag}\n`);
    const guild = await client.guilds.fetch(GUILD_ID);
    const channels = await guild.channels.fetch();

    const textLike = [...channels.values()].filter(
      (c) => c && (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
    );
    const byId = textLike.find((c) => c.id === TARGET_ID);
    const exact = textLike.filter((c) => c.name.toLowerCase() === TARGET_NAME);
    const fuzzy = textLike.filter((c) => c.name.toLowerCase().includes('announc'));
    const target = byId || exact[0] || (fuzzy.length === 1 ? fuzzy[0] : null);

    if (!target) {
      console.log(`Could not uniquely resolve a "#${TARGET_NAME}" channel.`);
      console.log('Channels matching "announce":', fuzzy.map((c) => `#${c.name} (${c.id})`).join(', ') || '(none)');
      console.log('\nAll text/announcement channels the bot can SEE:');
      for (const c of textLike.sort((a, b) => a.name.localeCompare(b.name))) {
        console.log(`  #${c.name}  (${c.id})  ${ChannelType[c.type]}`);
      }
      console.log('\nConfigured ANNOUNCE_* ids for reference:');
      console.log('  DOWNTIME:', process.env.ANNOUNCE_DOWNTIME_CHANNEL_ID || '(unset)');
      console.log('  GAME    :', process.env.ANNOUNCE_GAME_CHANNEL_ID || '(unset)');
      console.log('  DEVLOG  :', process.env.ANNOUNCE_DEVLOG_CHANNEL_ID || '(unset)');
      console.log('\nTell me which channel is #announcements (name or id) and I will target it.');
      return;
    }

    console.log(`Target channel : #${target.name}  (id ${target.id}, type ${ChannelType[target.type]})`);
    if (exact.length > 1) console.log(`  NOTE: ${exact.length} channels named "${TARGET_NAME}" — using the first; confirm before posting.`);
    console.log('\n--- message preview ---\n' + MESSAGE + '\n-----------------------\n');

    if (!POST) {
      console.log('DRY RUN — nothing sent. Re-run with --post to send this to the channel above.');
      return;
    }

    const sent = await target.send({ content: MESSAGE, allowedMentions: { parse: ['everyone'] } });
    console.log(`POSTED. Message id ${sent.id}`);
    console.log(`Link: https://discord.com/channels/${GUILD_ID}/${target.id}/${sent.id}`);

    if (REPLACE_MSG_ID) {
      try {
        const old = await target.messages.fetch(REPLACE_MSG_ID);
        await old.delete();
        console.log(`Removed previous post ${REPLACE_MSG_ID} (the one without @everyone).`);
      } catch (e) {
        console.log(`Could NOT remove previous post ${REPLACE_MSG_ID}: ${e.message} — delete it manually.`);
      }
    }
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await client.destroy();
  }
});

client.login(TOKEN).catch((e) => { console.error('Login failed:', e.message); process.exit(1); });
