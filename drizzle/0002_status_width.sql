ALTER TABLE "booking_events" ALTER COLUMN "from_status" SET DATA TYPE varchar(32);--> statement-breakpoint
ALTER TABLE "booking_events" ALTER COLUMN "to_status" SET DATA TYPE varchar(32);--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "status" SET DATA TYPE varchar(32);--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "status" SET DEFAULT 'approved';