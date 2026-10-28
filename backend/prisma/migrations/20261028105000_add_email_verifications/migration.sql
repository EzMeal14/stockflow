CREATE TABLE IF NOT EXISTS "email_verifications" (
    "verification_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("verification_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_verifications_email_key"
ON "email_verifications"("email");

CREATE INDEX IF NOT EXISTS "idx_email_verifications_expiry"
ON "email_verifications"("expires_at");
