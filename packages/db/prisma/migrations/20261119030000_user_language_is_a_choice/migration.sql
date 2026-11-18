-- AlterTable
ALTER TABLE "users" ALTER COLUMN "language" DROP NOT NULL,
ALTER COLUMN "language" DROP DEFAULT;

-- The default made every account English before anyone had chosen: a language is a choice or nothing.
UPDATE "users" SET "language" = NULL;
