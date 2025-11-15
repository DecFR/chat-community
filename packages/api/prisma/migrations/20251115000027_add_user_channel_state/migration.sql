-- CreateTable
CREATE TABLE "UserChannelState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "lastReadMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserChannelState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserChannelState_userId_idx" ON "UserChannelState"("userId");

-- CreateIndex
CREATE INDEX "UserChannelState_channelId_idx" ON "UserChannelState"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "UserChannelState_userId_channelId_key" ON "UserChannelState"("userId", "channelId");

-- AddForeignKey
ALTER TABLE "UserChannelState" ADD CONSTRAINT "UserChannelState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserChannelState" ADD CONSTRAINT "UserChannelState_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
