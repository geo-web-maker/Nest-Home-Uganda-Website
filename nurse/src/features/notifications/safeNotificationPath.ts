/** Restrict notification deep links to routes owned by the nurse application. */
export function safeNurseNotificationPath(value: unknown): string | null {
  return typeof value === 'string' && /^\/((visit|active)\/[\w-]+|history|timesheets|documents|audit|profile|mail(\?[\w=&%.-]*)?)?$/.test(value)
    ? value
    : null;
}
