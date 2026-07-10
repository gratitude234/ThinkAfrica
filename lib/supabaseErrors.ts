interface SupabaseErrorLike {
  code?: string | null;
  message?: string | null;
}

const POSTGRES_UNIQUE_VIOLATION = "23505";

export const USERNAME_TAKEN_MESSAGE =
  "That username is already taken. Please choose another.";

export function isUsernameConflict(error: SupabaseErrorLike | null | undefined): boolean {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return error.code === POSTGRES_UNIQUE_VIOLATION && message.includes("username");
}
