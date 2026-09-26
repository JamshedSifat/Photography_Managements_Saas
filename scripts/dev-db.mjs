/**
 * Local development database.
 *
 * The application always talks to a real PostgreSQL server through `DATABASE_URL`
 * (see `src/db/index.ts`). This helper simply boots a throwaway embedded PostgreSQL
 * cluster for offline development / sandboxes where no external database is reachable.
 *
 *   node scripts/dev-db.mjs           # start (or reuse) the cluster and keep it running
 *   node scripts/dev-db.mjs --stop    # stop the cluster (data is kept)
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = Number(process.env.PG_PORT || 55432);
const DATA_DIR = process.env.PG_DATA || path.join(process.cwd(), ".pgdata");
const USER = "postgres";
const PASSWORD = "postgres";
const DATABASE = "photography";

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  port: PORT,
  user: USER,
  password: PASSWORD,
  persistent: true,
  onLog: () => {},
  onError: (m) => console.error("[pg]", m instanceof Error ? m.message : m),
});

const url = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DATABASE}`;

if (process.argv.includes("--stop")) {
  await pg.stop();
  console.log(`[dev-db] stopped (data kept in ${DATA_DIR})`);
  process.exit(0);
}

// initdb refuses to run against a non-empty directory, so only initialise a fresh cluster.
if (!existsSync(path.join(DATA_DIR, "PG_VERSION"))) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase(DATABASE);
  console.log(`[dev-db] created database "${DATABASE}"`);
} catch {
  /* already exists */
}
console.log(`[dev-db] PostgreSQL ready on 127.0.0.1:${PORT}`);
console.log(`[dev-db] DATABASE_URL=${url}`);
console.log("[dev-db] apply migrations with: npx drizzle-kit migrate");

const shutdown = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
setInterval(() => {}, 60_000);
