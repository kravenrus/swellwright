-- CreateTable
CREATE TABLE "plugin_configs" (
    "plugin_id" VARCHAR(48) NOT NULL,
    "settings" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" VARCHAR(64) NOT NULL,

    CONSTRAINT "plugin_configs_pkey" PRIMARY KEY ("plugin_id")
);

-- CreateTable
CREATE TABLE "plugin_storage" (
    "plugin_id" VARCHAR(48) NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plugin_storage_pkey" PRIMARY KEY ("plugin_id","key")
);
