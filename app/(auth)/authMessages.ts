export function formatAuthError(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid credentials")
  ) {
    return "That email or password does not match an account.";
  }

  if (
    normalized.includes("already registered") ||
    normalized.includes("already exists") ||
    normalized.includes("user already")
  ) {
    return "An account already exists with this email. If you have not confirmed it yet, check your inbox or resend the confirmation email.";
  }

  if (
    normalized.includes("password should be") ||
    normalized.includes("password must") ||
    normalized.includes("weak password")
  ) {
    return "Use a stronger password with at least 6 characters.";
  }

  if (
    normalized.includes("email not confirmed") ||
    normalized.includes("confirm your email")
  ) {
    return "Check your email to confirm your account before signing in.";
  }

  if (
    normalized.includes("rate limit") ||
    normalized.includes("too many") ||
    normalized.includes("over_email_send_rate_limit")
  ) {
    return "Too many attempts. Try again in a few minutes.";
  }

  return message || "Something went wrong. Please try again.";
}

export function isAlreadyRegisteredAuthError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("already registered") ||
    normalized.includes("already exists") ||
    normalized.includes("user already")
  );
}

export function isEmailNotConfirmedAuthError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("email not confirmed") ||
    normalized.includes("confirm your email")
  );
}

export function getSafeRedirect(value: string | null, fallback = "/") {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}
