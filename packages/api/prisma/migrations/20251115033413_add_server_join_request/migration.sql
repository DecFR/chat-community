-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "ServerJoinRequest" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServerJoinRequest_serverId_idx" ON "ServerJoinRequest"("serverId");

-- CreateIndex
CREATE INDEX "ServerJoinRequest_applicantId_idx" ON "ServerJoinRequest"("applicantId");

-- CreateIndex
CREATE INDEX "ServerJoinRequest_status_idx" ON "ServerJoinRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ServerJoinRequest_serverId_applicantId_status_key" ON "ServerJoinRequest"("serverId", "applicantId", "status");

-- AddForeignKey
ALTER TABLE "ServerJoinRequest" ADD CONSTRAINT "ServerJoinRequest_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerJoinRequest" ADD CONSTRAINT "ServerJoinRequest_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
