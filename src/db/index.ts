import { drizzle as drizzleNode, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { readdir, readFile } from "fs/promises";
import path from "path";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
export type AppDatabase = NodePgDatabase<Record<string, never>>;

const databaseUrl = process.env.DATABASE_URL;

/**
 * Production: a pooled `pg` connection to PostgreSQL.
 *
 * Offline / sandbox fallback: when `DATABASE_URL` is not configured the app runs
 * against an embedded WASM build of PostgreSQL (PGlite) so the whole stack — the same
 * SQL migrations, queries and business logic — works without an external server.
 * Only the driver changes; the schema and every query stay identical.
 */
function createLocalDatabase(): AppDatabase {
  const dataDir = process.env.PGLITE_DIR || path.join(process.cwd(), ".pglite");
  const client = new PGlite(dataDir);
  return drizzlePglite(client) as unknown as AppDatabase;
}

export const isLocalDatabase = !databaseUrl;

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaLocalMigrations?: Promise<void>;
};

export const db: AppDatabase = (
  databaseUrl
    ? drizzleNode(globalForDb.__arenaNextJsPostgresqlPool ?? new Pool({ connectionString: databaseUrl }))
    : createLocalDatabase()
) as AppDatabase;

/** Applies pending `drizzle/*.sql` migrations. Only used by the embedded local database. */
export function ensureMigrations(): Promise<void> {
  if (databaseUrl) return Promise.resolve();
  if (!globalForDb.__arenaLocalMigrations) {
    globalForDb.__arenaLocalMigrations = (async () => {
      const dir = path.join(process.cwd(), "drizzle");
      const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(".sql")).sort();
      await db.execute(sql`create table if not exists drizzle_migrations (file_name text primary key, applied_at timestamptz not null default now())`);
      const applied = new Set((await db.execute<{ file_name: string }>(sql`select file_name from drizzle_migrations`)).rows.map((r) => r.file_name));
      for (const file of files) {
        if (applied.has(file)) continue;
        const raw = await readFile(path.join(dir, file), "utf8");
        // PGlite executes one statement per call, so split on the drizzle statement breakpoints.
        for (const statement of raw.split("--> statement-breakpoint")) {
          const trimmed = statement.trim();
          if (!trimmed) continue;
          await db.execute(sql.raw(trimmed));
        }
        await db.execute(sql`insert into drizzle_migrations (file_name) values (${file}) on conflict do nothing`);
      }
    })().catch((err) => {
      globalForDb.__arenaLocalMigrations = undefined;
      throw err;
    });
  }
  return globalForDb.__arenaLocalMigrations;
}
