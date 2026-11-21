-- CreateEnum
CREATE TYPE "artifact_destination" AS ENUM ('user', 'system');

-- CreateEnum
CREATE TYPE "artifact_check_state" AS ENUM ('ok', 'differs', 'missing');

-- CreateTable
CREATE TABLE "server_artifacts" (
    "id" UUID NOT NULL,
    "server_id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "version" VARCHAR(32) NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "size" INTEGER NOT NULL,
    "destination" "artifact_destination" NOT NULL DEFAULT 'user',
    "remote_path" VARCHAR(1024) NOT NULL,
    "pushed_at" TIMESTAMPTZ(3) NOT NULL,
    "pushed_by_id" UUID,
    "verified_at" TIMESTAMPTZ(3),
    "verify_state" "artifact_check_state",
    "remote_sha256" VARCHAR(64),

    CONSTRAINT "server_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "server_artifacts_server_id_name_version_key" ON "server_artifacts"("server_id", "name", "version");

-- AddForeignKey
ALTER TABLE "server_artifacts" ADD CONSTRAINT "server_artifacts_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rules the schema language cannot express: the application checks them first, the database is the second wall.
ALTER TABLE "server_artifacts" ADD CONSTRAINT "server_artifacts_name_check" CHECK ("name" ~ '^[a-z]([a-z0-9-]{0,62}[a-z0-9])?$');
ALTER TABLE "server_artifacts" ADD CONSTRAINT "server_artifacts_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "server_artifacts" ADD CONSTRAINT "server_artifacts_size_check" CHECK ("size" > 0);
ALTER TABLE "server_artifacts" ADD CONSTRAINT "server_artifacts_remote_path_check" CHECK ("remote_path" ~ '^/' AND "remote_path" !~ '[[:cntrl:]]');
ALTER TABLE "server_artifacts" ADD CONSTRAINT "server_artifacts_verify_check" CHECK (
    ("verified_at" IS NULL) = ("verify_state" IS NULL)
    AND ("verify_state" IS NULL OR ("verify_state" = 'missing') = ("remote_sha256" IS NULL))
    AND ("remote_sha256" IS NULL OR "remote_sha256" ~ '^[0-9a-f]{64}$')
);
