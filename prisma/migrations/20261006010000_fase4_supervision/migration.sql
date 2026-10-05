-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('EXAM', 'ACTIVITY', 'FOCUS', 'VISION', 'AUDIO', 'CONNECTION');

-- CreateEnum
CREATE TYPE "EventSource" AS ENUM ('BROWSER', 'SIMULATION', 'SERVER');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('NOT_REQUIRED', 'RECOMMENDED', 'REVIEWED');

-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "simulationEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ProctoringSession" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "browser" TEXT,
    "os" TEXT,
    "device" TEXT,
    "cameraEnabled" BOOLEAN NOT NULL DEFAULT false,
    "microphoneEnabled" BOOLEAN NOT NULL DEFAULT false,
    "fullscreenRequested" BOOLEAN NOT NULL DEFAULT false,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "eventCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProctoringSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProctoringEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "clientEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" "EventCategory" NOT NULL,
    "severity" "Severity" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationSec" INTEGER,
    "confidence" DOUBLE PRECISION,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "source" "EventSource" NOT NULL DEFAULT 'BROWSER',

    CONSTRAINT "ProctoringEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProctoringSession_attemptId_key" ON "ProctoringSession"("attemptId");

-- CreateIndex
CREATE INDEX "ProctoringEvent_sessionId_occurredAt_idx" ON "ProctoringEvent"("sessionId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProctoringEvent_sessionId_clientEventId_key" ON "ProctoringEvent"("sessionId", "clientEventId");

-- AddForeignKey
ALTER TABLE "ProctoringSession" ADD CONSTRAINT "ProctoringSession_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ExamAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProctoringEvent" ADD CONSTRAINT "ProctoringEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ProctoringSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

