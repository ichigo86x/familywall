interface Attempts {
  failures: number;
  windowStartedAt: number;
}

/**
 * In-memory brute-force limiter. The app is exposed on the internet through nginx,
 * so failed logins are capped per client IP and per username.
 */
export class LoginThrottle {
  private readonly attempts = new Map<string, Attempts>();

  public constructor(
    private readonly maxFailures = 5,
    private readonly windowMs = 15 * 60 * 1000,
    private readonly now: () => number = Date.now
  ) {}

  public isBlocked(keys: string[]): boolean {
    return keys.some((key) => (this.current(key)?.failures ?? 0) >= this.maxFailures);
  }

  public recordFailure(keys: string[]): void {
    for (const key of keys) {
      const entry = this.current(key) ?? { failures: 0, windowStartedAt: this.now() };
      entry.failures += 1;
      this.attempts.set(key, entry);
    }
  }

  public reset(keys: string[]): void {
    for (const key of keys) {
      this.attempts.delete(key);
    }
  }

  private current(key: string): Attempts | undefined {
    const entry = this.attempts.get(key);
    if (entry && this.now() - entry.windowStartedAt > this.windowMs) {
      this.attempts.delete(key);
      return undefined;
    }
    return entry;
  }
}
