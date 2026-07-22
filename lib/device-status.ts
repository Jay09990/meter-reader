import { Alarm, AlarmSeverity, AlarmStatus } from "@prisma/client";

export type DeviceStatus = "NEW" | "ONLINE" | "OFFLINE" | "ALERT";

export function computeDeviceStatus(
  lastSeenAt: Date | null,
  alarms: Pick<Alarm, "status" | "severity">[],
  customerId?: string | null
): DeviceStatus {
  if (customerId === null) {
    return "NEW";
  }

  // Check for offline first (no connection in 24 hours)
  if (!lastSeenAt) return "OFFLINE";
  
  const now = new Date();
  const hoursSinceLastSeen = (now.getTime() - lastSeenAt.getTime()) / (1000 * 60 * 60);
  if (hoursSinceLastSeen > 24) return "OFFLINE";

  // Check alarms
  const openAlarms = alarms.filter(a => a.status === AlarmStatus.OPEN);
  
  const hasCriticalOrWarning = openAlarms.some(
    a => a.severity === AlarmSeverity.CRITICAL || a.severity === AlarmSeverity.WARNING
  );
  
  if (hasCriticalOrWarning) return "ALERT";

  return "ONLINE";
}
