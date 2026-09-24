-- AlterTable: Add reportScheduleTime to SystemSettings for configurable daily report delivery time
ALTER TABLE "SystemSettings" ADD COLUMN "reportScheduleTime" TEXT DEFAULT '07:00';
