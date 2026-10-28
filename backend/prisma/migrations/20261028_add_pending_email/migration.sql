ALTER TABLE "password_resets"
ADD COLUMN IF NOT EXISTS "pending_email" VARCHAR(255);
