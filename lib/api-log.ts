// Local-dev request diagnostics: every API route logs through logApi so
// incoming data and per-request results are greppable in the dev-server
// terminal under a uniform `[api <iso-timestamp>]` prefix.
export function logApi(message: string, data?: unknown): void {
  const prefix = `[api ${new Date().toISOString()}]`;
  if (data === undefined) {
    console.log(`${prefix} ${message}`);
  } else {
    console.log(`${prefix} ${message}`, data);
  }
}
