CREATE TABLE "DailyReportDelivery" (
    "forDate" DATE NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyReportDelivery_pkey" PRIMARY KEY ("forDate")
);
