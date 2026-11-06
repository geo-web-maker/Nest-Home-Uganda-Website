/** Everyday-service password rules: length first, no forced symbols, and a block on common choices. */
export const MIN_PASSWORD_LENGTH = 8;
export type PasswordStrength = 'empty' | 'short' | 'weak' | 'okay' | 'strong';

const COMMON = new Set(
  `password password1 password12 password123 passw0rd p@ssw0rd p@ssword qwerty qwerty12 qwerty123
  qwertyuiop 12345678 123456789 1234567890 11111111 00000000 87654321 abc12345 abcd1234 iloveyou
  letmein welcome welcome1 welcome123 admin123 administrator monkey123 dragon123 football baseball
  sunshine princess trustno1 whatever changeme internet bloomwell bloomwell1 uganda123 kampala123
  nurse123 nursenurse homecare`.split(/\s+/),
);

export function isWeakPassword(password: string): boolean {
  return new Set(password).size === 1 || COMMON.has(password.toLowerCase());
}

export function passwordStrength(password: string): PasswordStrength {
  if (!password) return 'empty';
  if (password.length < MIN_PASSWORD_LENGTH) return 'short';
  if (isWeakPassword(password)) return 'weak';
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  return password.length >= 12 || (password.length >= 10 && classes >= 3) ? 'strong' : 'okay';
}
