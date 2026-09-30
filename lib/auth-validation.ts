// Shared credential rules keep registration feedback and server validation in sync.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const USERNAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/;
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const EMAIL_MAX_LENGTH = 254;
export const USERNAME_MAX_LENGTH = 32;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function getPasswordRuleStatus(password: string) {
  return {
    length: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9\s]/.test(password),
    noWhitespace: !/\s/.test(password),
  };
}

export function validateRegistrationFields(input: {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
  gaId: string;
}) {
  const errors: Partial<Record<"email" | "username" | "password" | "confirmPassword" | "gaId", string>> = {};
  const email = normalizeEmail(input.email);
  const username = normalizeUsername(input.username);
  const passwordRules = getPasswordRuleStatus(input.password);

  if (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) {
    errors.email = "Enter a valid email address, such as name@example.com.";
  }
  if (username.length > USERNAME_MAX_LENGTH || !USERNAME_PATTERN.test(username)) {
    errors.username = "Use 3–32 letters, numbers, dots, underscores, or hyphens. Start with a letter or number.";
  }
  if (Object.values(passwordRules).some((isValid) => !isValid)) {
    errors.password = "Meet every password rule listed below.";
  }
  if (input.confirmPassword !== input.password) {
    errors.confirmPassword = "Passwords do not match.";
  }
  if (!input.gaId || input.gaId.length > 64) {
    errors.gaId = "Select a geographical area.";
  }

  return { errors, email, username };
}
