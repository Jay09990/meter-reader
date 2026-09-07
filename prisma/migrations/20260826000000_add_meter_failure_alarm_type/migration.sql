-- prisma/migrations/20260826000000_add_meter_failure_alarm_type/migration.sql
ALTER TYPE "AlarmType" ADD VALUE IF NOT EXISTS 'METER_FAILURE';