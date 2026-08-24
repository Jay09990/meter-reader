-- Add isolated system-capacity configuration and rejected-ingest audit records.
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "maxMeterCapacity" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RejectedConnectionAttempt" (
    "id" TEXT NOT NULL,
    "deviceSerialNo" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RejectedConnectionAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RejectedConnectionAttempt_acknowledged_attemptedAt_idx"
ON "RejectedConnectionAttempt"("acknowledged", "attemptedAt");
