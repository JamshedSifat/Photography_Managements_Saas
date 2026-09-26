-- Manual bKash / Nagad payment submissions (no gateway API).
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "transaction_id" varchar(80);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "sender_number" varchar(40);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "screenshot_url" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "submitted_by_id" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "verified_by_id" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "rejection_reason" text;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "payments" ADD CONSTRAINT "payments_submitted_by_id_users_id_fk"
    FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "payments" ADD CONSTRAINT "payments_verified_by_id_users_id_fk"
    FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

-- A wallet transaction id may only ever be claimed once (NULLs are not compared,
-- so non-mobile payments are unaffected).
CREATE UNIQUE INDEX IF NOT EXISTS "payments_transaction_id_key" ON "payments" ("transaction_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_status_idx" ON "payments" ("status");
