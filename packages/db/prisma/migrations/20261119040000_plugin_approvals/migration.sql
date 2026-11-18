-- CreateTable
CREATE TABLE "plugin_approvals" (
    "plugin_id" VARCHAR(48) NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "version" VARCHAR(64) NOT NULL,
    "trust" VARCHAR(16) NOT NULL,
    "digest" VARCHAR(64) NOT NULL,
    "permissions" TEXT NOT NULL,
    "approved_at" TIMESTAMPTZ(3) NOT NULL,
    "approved_by" VARCHAR(64) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plugin_approvals_pkey" PRIMARY KEY ("plugin_id")
);
