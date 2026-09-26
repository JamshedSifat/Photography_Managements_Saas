ALTER TABLE "payments" ADD COLUMN "transaction_id" varchar(80);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "sender_number" varchar(40);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "screenshot_url" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "submitted_by_id" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "verified_by_id" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_verified_by_id_users_id_fk" FOREIGN KEY ("verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_transaction_id_key" ON "payments" USING btree ("transaction_id");