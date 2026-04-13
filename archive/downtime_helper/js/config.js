/**
 * config.js
 * Discord OAuth and player-mapping configuration.
 * Edit this file to wire up Discord SSO and map Discord user IDs to characters.
 *
 * Steps:
 *   1. Create a Discord application at https://discord.com/developers/applications
 *   2. Under OAuth2 → Redirects, add your GitHub Pages URL, e.g.:
 *        https://angelusvmorningstar.github.io/TerraMortis/downtime_helper/
 *   3. Paste your application's Client ID below.
 *   4. Add your Discord user ID to ST_IDS.
 *   5. Add each player's Discord user ID → character name to PLAYER_MAP.
 *
 * Finding a Discord user ID:
 *   Discord → Settings → Advanced → enable Developer Mode
 *   Right-click any user → Copy User ID
 */

const DISCORD_CONFIG = {
  // Your Discord application Client ID (not the secret -- this is safe to commit)
  CLIENT_ID: '1487813600851660820',

  // Discord user IDs of Storytellers -- see the full dashboard, can upload CSVs
  ST_IDS: [
    '469356244398899201',//pk
    '694104767298797618',//angelus
    '405594065841946624',//symon
    '977695064392343652' //curtis
  ],

  // Map Discord user ID → character_name
  // The character_name must match exactly what players enter in the Google Form
  PLAYER_MAP: {
    // '234567890123456789': 'Alice Bloodworth',
    // '345678901234567890': 'Viktor Ashcroft',
  },
};
