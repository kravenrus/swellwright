-- CreateEnum
CREATE TYPE "server_state" AS ENUM ('draft', 'provisioning', 'active', 'draining', 'retired');

-- CreateEnum
CREATE TYPE "access_method" AS ENUM ('password', 'key');

-- CreateTable
CREATE TABLE "servers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "address" VARCHAR(255) NOT NULL,
    "ssh_port" INTEGER NOT NULL DEFAULT 22,
    "country" VARCHAR(2),
    "provider" VARCHAR(64),
    "state" "server_state" NOT NULL DEFAULT 'draft',
    "tags" TEXT[],
    "notes" VARCHAR(2000),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_host_keys" (
    "id" UUID NOT NULL,
    "server_id" UUID NOT NULL,
    "algorithm" VARCHAR(32) NOT NULL,
    "fingerprint_sha256" VARCHAR(50) NOT NULL,
    "source" VARCHAR(16) NOT NULL DEFAULT 'manual',
    "accepted_by_id" UUID,
    "accepted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "server_host_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_access" (
    "id" UUID NOT NULL,
    "server_id" UUID NOT NULL,
    "method" "access_method" NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "secret_id" UUID NOT NULL,
    "sudo_secret_id" UUID,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "server_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_facts" (
    "server_id" UUID NOT NULL,
    "facts" JSONB NOT NULL,
    "collected_at" TIMESTAMPTZ(3) NOT NULL,
    "source" VARCHAR(16) NOT NULL,

    CONSTRAINT "server_facts_pkey" PRIMARY KEY ("server_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "servers_name_key" ON "servers"("name");

-- CreateIndex
CREATE INDEX "servers_state_idx" ON "servers"("state");

-- CreateIndex
CREATE INDEX "servers_tags_idx" ON "servers" USING GIN ("tags");

-- CreateIndex
CREATE UNIQUE INDEX "server_host_keys_server_id_fingerprint_sha256_key" ON "server_host_keys"("server_id", "fingerprint_sha256");

-- CreateIndex
CREATE INDEX "server_access_server_id_priority_idx" ON "server_access"("server_id", "priority");

-- CreateIndex
CREATE INDEX "server_access_secret_id_idx" ON "server_access"("secret_id");

-- CreateIndex
CREATE INDEX "server_access_sudo_secret_id_idx" ON "server_access"("sudo_secret_id");

-- AddForeignKey
ALTER TABLE "server_host_keys" ADD CONSTRAINT "server_host_keys_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "server_access" ADD CONSTRAINT "server_access_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "server_access" ADD CONSTRAINT "server_access_secret_id_fkey" FOREIGN KEY ("secret_id") REFERENCES "secrets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "server_access" ADD CONSTRAINT "server_access_sudo_secret_id_fkey" FOREIGN KEY ("sudo_secret_id") REFERENCES "secrets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "server_facts" ADD CONSTRAINT "server_facts_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rules the schema language cannot express: the application checks them first, the database is the second wall.
ALTER TABLE "servers" ADD CONSTRAINT "servers_ssh_port_check" CHECK ("ssh_port" BETWEEN 1 AND 65535);
ALTER TABLE "servers" ADD CONSTRAINT "servers_country_check" CHECK ("country" IS NULL OR "country" ~ '^[A-Z]{2}$');
ALTER TABLE "server_host_keys" ADD CONSTRAINT "server_host_keys_fingerprint_check" CHECK ("fingerprint_sha256" ~ '^SHA256:[A-Za-z0-9+/]{43}$');
ALTER TABLE "server_access" ADD CONSTRAINT "server_access_username_check" CHECK ("username" ~ '^[a-z_][a-z0-9_-]{0,63}$');
