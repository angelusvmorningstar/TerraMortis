// post-osl-optional.mjs — one-off: post the "Off-Screen Life is now optional"
// downtime update to #announcements AS the TM bot.
//
// SAFETY: dry-run by default — logs in, resolves the channel, prints what WOULD
// be sent, sends NOTHING. Pass --post to actually send. Pass --everyone to
// prepend an @everyone ping (off by default). Run from the bot/ dir.
//
//   Dry run:            node scripts/post-osl-optional.mjs
//   Post (no ping):     node scripts/post-osl-optional.mjs --post
//   Post (@everyone):   node scripts/post-osl-optional.mjs --post --everyone
//
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Client, GatewayIntentBits, ChannelType } from 'discord.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const POST = process.argv.includes('--post');
const EVERYONE = process.argv.includes('--everyone');
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const TARGET_ID = '1430387123474796554'; // #announcments (sic) — resolve by id
const TARGET_NAME = 'announcments';

// ── The approved message ──────────────────────────────────────────────────────
const BODY = [
  '📜 **Downtime Update: Off-Screen Life is now optional**',
  '',
  'The player base is growing, and so are the downtimes. To keep things manageable, we are making a change effective this downtime and going forward.',
  '',
  'The **Personal Story (Off-Screen Life)** section, your touchstone moment or letter home, is now **optional**. It is an opt-in for players who want to explore a touchstone scene or write to someone outside the city. If that is your thing, please keep using it.',
  '',
  'If not, leave it blank. It will not hold up your submission or your XP, and it removes one of the requirements of downtime.',
  '',
  'Note: if you want to advance a plot in downtime, you do not need this section. Use a **Miscellaneous** or **Investigation** action instead.',
].join('\n');
const MESSAGE = EVERYONE ? `@everyone\n\n${BODY}` : BODY;
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
      return;
    }

    console.log(`Target channel : #${target.name}  (id ${target.id}, type ${ChannelType[target.type]})`);
    console.log(`@everyone ping : ${EVERYONE ? 'YES' : 'no'}`);
    console.log('\n--- message preview ---\n' + MESSAGE + '\n-----------------------\n');

    if (!POST) {
      console.log('DRY RUN — nothing sent. Re-run with --post (add --everyone to ping).');
      return;
    }

    const sent = await target.send({
      content: MESSAGE,
      allowedMentions: { parse: EVERYONE ? ['everyone'] : [] },
    });
    console.log(`POSTED. Message id ${sent.id}`);
    console.log(`Link: https://discord.com/channels/${GUILD_ID}/${target.id}/${sent.id}`);
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await client.destroy();
  }
});

client.login(TOKEN).catch((e) => { console.error('Login failed:', e.message); process.exit(1); });
