-- AlterTable
ALTER TABLE "vault_meta" ADD COLUMN     "data_keys_rotated_at" TIMESTAMPTZ(3),
ADD COLUMN     "kek_rotated_at" TIMESTAMPTZ(3),
ADD COLUMN     "passphrase_changed_at" TIMESTAMPTZ(3),
ADD COLUMN     "recovery_key_rotated_at" TIMESTAMPTZ(3);
