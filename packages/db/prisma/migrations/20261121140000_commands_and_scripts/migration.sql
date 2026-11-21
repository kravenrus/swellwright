-- CreateEnum
CREATE TYPE "danger_level" AS ENUM ('read', 'change', 'destructive');

-- CreateEnum
CREATE TYPE "command_run_mode" AS ENUM ('script', 'inline');

-- CreateEnum
CREATE TYPE "command_run_state" AS ENUM ('pending', 'running', 'succeeded', 'failed', 'cancelled', 'partial');

-- CreateEnum
CREATE TYPE "output_stream" AS ENUM ('stdout', 'stderr');

-- CreateEnum
CREATE TYPE "command_target_state" AS ENUM ('pending', 'running', 'succeeded', 'failed', 'lost', 'cancelled', 'skipped');

-- CreateTable
CREATE TABLE "scripts" (
    "id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "body" TEXT NOT NULL,
    "danger_level" "danger_level" NOT NULL,
    "sudo" BOOLEAN NOT NULL DEFAULT false,
    "parameters" JSONB NOT NULL DEFAULT '[]',
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "body_sha256" VARCHAR(64) NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "scripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "command_runs" (
    "id" UUID NOT NULL,
    "mode" "command_run_mode" NOT NULL,
    "state" "command_run_state" NOT NULL DEFAULT 'pending',
    "script_id" UUID,
    "script_name" VARCHAR(64),
    "script_version" INTEGER,
    "label" VARCHAR(80) NOT NULL,
    "body" TEXT NOT NULL,
    "body_sha256" VARCHAR(64) NOT NULL,
    "sudo" BOOLEAN NOT NULL,
    "danger_level" "danger_level" NOT NULL,
    "confirmed_level" "danger_level",
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "timeout_seconds" INTEGER NOT NULL,
    "created_by_id" UUID,
    "created_by_name" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "cancel_requested_at" TIMESTAMPTZ(3),

    CONSTRAINT "command_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "command_run_targets" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "server_id" UUID,
    "server_name" VARCHAR(64) NOT NULL,
    "state" "command_target_state" NOT NULL DEFAULT 'pending',
    "access_id" UUID,
    "step_id" VARCHAR(64) NOT NULL,
    "launched" BOOLEAN NOT NULL DEFAULT false,
    "exit_code" INTEGER,
    "error_code" VARCHAR(40),
    "error_message" VARCHAR(500),
    "waiting" VARCHAR(40),
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "last_contact_at" TIMESTAMPTZ(3),
    "stdout_tail" BYTEA NOT NULL,
    "stdout_stored" INTEGER NOT NULL DEFAULT 0,
    "stdout_size" INTEGER NOT NULL DEFAULT 0,
    "stdout_truncated" BOOLEAN NOT NULL DEFAULT false,
    "stderr_tail" BYTEA NOT NULL,
    "stderr_stored" INTEGER NOT NULL DEFAULT 0,
    "stderr_size" INTEGER NOT NULL DEFAULT 0,
    "stderr_truncated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "command_run_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "command_output_chunks" (
    "target_id" UUID NOT NULL,
    "stream" "output_stream" NOT NULL,
    "start_offset" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "command_output_chunks_pkey" PRIMARY KEY ("target_id","stream","start_offset")
);

-- CreateIndex
CREATE UNIQUE INDEX "scripts_name_key" ON "scripts"("name");

-- CreateIndex
CREATE INDEX "command_runs_created_at_idx" ON "command_runs"("created_at");

-- CreateIndex
CREATE INDEX "command_runs_state_idx" ON "command_runs"("state");

-- CreateIndex
CREATE INDEX "command_runs_script_id_idx" ON "command_runs"("script_id");

-- CreateIndex
CREATE INDEX "command_run_targets_run_id_ordinal_idx" ON "command_run_targets"("run_id", "ordinal");

-- CreateIndex
CREATE INDEX "command_run_targets_server_id_idx" ON "command_run_targets"("server_id");

-- CreateIndex
CREATE INDEX "command_run_targets_state_idx" ON "command_run_targets"("state");

-- AddForeignKey
ALTER TABLE "command_runs" ADD CONSTRAINT "command_runs_script_id_fkey" FOREIGN KEY ("script_id") REFERENCES "scripts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "command_run_targets" ADD CONSTRAINT "command_run_targets_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "command_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "command_run_targets" ADD CONSTRAINT "command_run_targets_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "command_output_chunks" ADD CONSTRAINT "command_output_chunks_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "command_run_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rules the schema language cannot express: the application checks them first, the database is the second wall.
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_name_check" CHECK ("name" ~ '^[A-Za-z0-9 _.-]{1,64}$');
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_body_sha256_check" CHECK ("body_sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_version_check" CHECK ("version" >= 1);
ALTER TABLE "command_runs" ADD CONSTRAINT "command_runs_body_sha256_check" CHECK ("body_sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "command_runs" ADD CONSTRAINT "command_runs_timeout_check" CHECK ("timeout_seconds" BETWEEN 1 AND 3600);
ALTER TABLE "command_runs" ADD CONSTRAINT "command_runs_mode_check" CHECK (("mode" = 'script') = ("script_name" IS NOT NULL));
ALTER TABLE "command_run_targets" ADD CONSTRAINT "command_run_targets_step_id_check" CHECK ("step_id" ~ '^[a-z0-9-]{1,64}$');
ALTER TABLE "command_run_targets" ADD CONSTRAINT "command_run_targets_counters_check" CHECK ("stdout_stored" >= 0 AND "stderr_stored" >= 0 AND "stdout_size" >= 0 AND "stderr_size" >= 0);
ALTER TABLE "command_output_chunks" ADD CONSTRAINT "command_output_chunks_offset_check" CHECK ("start_offset" >= 0);
