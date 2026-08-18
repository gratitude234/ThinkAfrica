// Shared deadline for data fetching that must not outlive a render.
//
// Static generation on Vercel aborts any route that takes longer than 60s, so a
// slow or unreachable database turns into a failed deployment rather than a
// degraded page. A deadline converts that into a fallback: the render finishes
// with whatever answered in time, and the next revalidation picks the rest up.

const EXPIRED = Symbol("query-deadline-expired");

export type QueryDeadline = {
  /** Aborts when the deadline passes — pass it to Supabase via `.abortSignal()`. */
  readonly signal: AbortSignal;
  readonly ms: number;
  readonly expired: Promise<typeof EXPIRED>;
  /** Clears the timer once every racer has settled. */
  cancel(): void;
};

export function createDeadline(ms: number): QueryDeadline {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const expired = new Promise<typeof EXPIRED>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(EXPIRED);
    }, ms);
  });

  return {
    signal: controller.signal,
    ms,
    expired,
    cancel: () => clearTimeout(timer),
  };
}

/**
 * Resolves to `work`'s result, or to `fallback` when it rejects or misses the
 * shared deadline. Never rejects — callers get degraded data, not an exception.
 */
export async function withDeadline<T>(
  label: string,
  work: PromiseLike<T>,
  deadline: QueryDeadline,
  fallback: T
): Promise<T> {
  try {
    const result = await Promise.race([work, deadline.expired]);
    if (result === EXPIRED) {
      console.warn(`[deadline] ${label} exceeded ${deadline.ms}ms — using fallback`);
      return fallback;
    }
    return result;
  } catch (error) {
    console.warn(`[deadline] ${label} failed — using fallback`, error);
    return fallback;
  }
}
