-- CreateEnum
CREATE TYPE "audit_outcome" AS ENUM ('success', 'failure', 'denied');

-- CreateTable
CREATE TABLE "audit_events" (
    "seq" BIGINT NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "actor_id" UUID,
    "actor_name" VARCHAR(64),
    "action" VARCHAR(64) NOT NULL,
    "outcome" "audit_outcome" NOT NULL,
    "object_type" VARCHAR(32),
    "object_id" VARCHAR(64),
    "ip" VARCHAR(64),
    "request_id" VARCHAR(64),
    "details" TEXT NOT NULL DEFAULT '{}',
    "prev_hash" VARCHAR(64) NOT NULL,
    "hash" VARCHAR(64) NOT NULL,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("seq")
);

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_hash_key" ON "audit_events"("hash");

-- CreateIndex
CREATE INDEX "audit_events_action_seq_idx" ON "audit_events"("action", "seq");

-- CreateIndex
CREATE INDEX "audit_events_actor_id_seq_idx" ON "audit_events"("actor_id", "seq");

-- The audit log is append-only (docs/adr/0015). Prisma does not model triggers, so they live only here.
-- They stop mistakes and an attacker who has the application's database access but not the table's owner.
CREATE FUNCTION "audit_events_refuse_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_events is append-only (% refused)', TG_OP;
END;
$$;

CREATE TRIGGER "audit_events_append_only"
    BEFORE UPDATE OR DELETE ON "audit_events"
    FOR EACH ROW EXECUTE FUNCTION "audit_events_refuse_change"();

CREATE TRIGGER "audit_events_no_truncate"
    BEFORE TRUNCATE ON "audit_events"
    FOR EACH STATEMENT EXECUTE FUNCTION "audit_events_refuse_change"();
