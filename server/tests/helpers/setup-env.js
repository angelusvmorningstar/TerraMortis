/**
 * Vitest global setup — forces test runs to use a separate Mongo database.
 *
 * Without this, integration tests hit `tm_game` (the live DB) and any
 * seed/cleanup leak corrupts production data. Running against `tm_game_test`
 * isolates every insert/update/delete so the worst-case is a polluted
 * throwaway DB you can simply drop.
 *
 * Set BEFORE db.js is imported, because db.js resolves MONGODB_DB at
 * connect time. Vitest's `setupFiles` runs once per worker before test files.
 */

import 'dotenv/config';

// Hard override — never let a test run touch tm_game, even if a developer
// sets MONGODB_DB=tm_game in their local env. Tests always use tm_game_test.
process.env.MONGODB_DB = 'tm_game_test';
