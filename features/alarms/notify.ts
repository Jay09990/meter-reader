export interface AlarmNotificationPayload {
  deviceSerialNo: string;
  type: string;
  severity: string;
  cause: string;
  forDate: Date;
}

// Single integration point for future Resend-based alarm notifications.
export async function notifyAlarmCreated(payload: AlarmNotificationPayload): Promise<void> {
  console.log("[ALARM NOTIFICATION - STUB, Resend not yet wired]", payload);
}
