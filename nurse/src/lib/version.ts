function parts(value: string): number[] {
  return value.trim().replace(/^v/i, '').split(/[.+-]/, 1)[0].split('.').map((part) => {
    const parsed = Number.parseInt(part, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });
}

export function compareVersions(left: string, right: string): number {
  const a = parts(left);
  const b = parts(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const x = a[index] ?? 0;
    const y = b[index] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export function isForcedUpdate(current: string, minimum: string): boolean {
  return compareVersions(current, minimum) < 0;
}
