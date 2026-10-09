-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('SUCCESS', 'ERROR', 'SKIPPED');

-- AlterTable
ALTER TABLE "ProctoringSession" ADD COLUMN     "analyzedAt" TIMESTAMP(3),
ADD COLUMN     "riskSummary" TEXT,
ADD COLUMN     "riskSummaryAt" TIMESTAMP(3),
ADD COLUMN     "riskSummaryProvider" TEXT;

-- CreateTable
CREATE TABLE "RiskSignal" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" "EventCategory" NOT NULL,
    "severity" "Severity" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "explanation" TEXT NOT NULL,
    "eventIds" TEXT[],
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "error" TEXT,
    "output" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RiskSignal_sessionId_idx" ON "RiskSignal"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskSignal_sessionId_ruleId_key" ON "RiskSignal"("sessionId", "ruleId");

-- CreateIndex
CREATE INDEX "AgentRun_agent_createdAt_idx" ON "AgentRun"("agent", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_sessionId_idx" ON "AgentRun"("sessionId");

-- AddForeignKey
ALTER TABLE "RiskSignal" ADD CONSTRAINT "RiskSignal_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ProctoringSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ProctoringSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

