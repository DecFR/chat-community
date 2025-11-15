-- AlterEnum
ALTER TYPE "PrivacySetting" ADD VALUE 'NONE';

-- DropForeignKey
ALTER TABLE "Server" DROP CONSTRAINT "Server_ownerId_fkey";
