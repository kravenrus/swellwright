-- AlterTable
ALTER TABLE "server_access" ADD COLUMN     "last_verified_at" TIMESTAMPTZ(3),
ADD COLUMN     "last_verify_ok" BOOLEAN;

-- AlterTable
ALTER TABLE "server_facts" ADD COLUMN     "script_sha256" VARCHAR(64);

-- Rules the schema language cannot express: the application checks them first, the database is the second wall.
ALTER TABLE "server_facts" ADD CONSTRAINT "server_facts_script_sha256_check" CHECK ("script_sha256" IS NULL OR "script_sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "server_access" ADD CONSTRAINT "server_access_verify_check" CHECK (("last_verified_at" IS NULL) = ("last_verify_ok" IS NULL));
