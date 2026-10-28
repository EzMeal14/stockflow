CREATE TABLE "password_resets" (
    "reset_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("reset_id")
);

CREATE INDEX "idx_password_resets_user" ON "password_resets"("user_id", "created_at");

ALTER TABLE "password_resets"
ADD CONSTRAINT "fk_password_resets_user"
FOREIGN KEY ("user_id") REFERENCES "users"("user_id")
ON DELETE CASCADE ON UPDATE CASCADE;
