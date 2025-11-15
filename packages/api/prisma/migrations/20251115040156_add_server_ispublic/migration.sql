-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Server_isPublic_idx" ON "Server"("isPublic");
