-- CreateEnum
CREATE TYPE "secret_type" AS ENUM ('panel_token', 'ssh_key', 'ssh_password', 'ssh_ca', 'dns_oauth', 'provider_token', 'telegram', 'generic');

-- CreateTable
CREATE TABLE "vault_meta" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "kdf_salt" BYTEA NOT NULL,
    "kdf_memory_kib" INTEGER NOT NULL,
    "kdf_passes" INTEGER NOT NULL,
    "kdf_parallelism" INTEGER NOT NULL,
    "passphrase_wrapped_kek" BYTEA NOT NULL,
    "recovery_wrapped_kek" BYTEA NOT NULL,
    "kek_version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secrets" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" "secret_type" NOT NULL,
    "description" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "ciphertext" BYTEA NOT NULL,
    "wrapped_dek" BYTEA NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "value_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "secrets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "secrets_name_key" ON "secrets"("name");

-- CreateIndex
CREATE INDEX "secrets_type_idx" ON "secrets"("type");

-- There is one vault: the table holds at most one row (docs/adr/0018). Prisma does not model checks.
ALTER TABLE "vault_meta" ADD CONSTRAINT "vault_meta_single_row" CHECK ("id" = 1);
