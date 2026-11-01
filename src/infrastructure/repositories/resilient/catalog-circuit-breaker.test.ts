import { CatalogCircuitBreaker } from '@/infrastructure/repositories/resilient/catalog-circuit-breaker';

describe('catalog circuit breaker', () => {
  function createBreaker() {
    let now = 1_000;
    const breaker = new CatalogCircuitBreaker({
      failureThreshold: 2,
      openDurationMs: 300_000,
      now: () => now,
    });
    return {
      breaker,
      advance: (milliseconds: number) => {
        now += milliseconds;
      },
    };
  }

  it('starts closed, counts failures, and opens at the threshold', () => {
    const { breaker } = createBreaker();
    expect(breaker.getState()).toBe('closed');
    expect(breaker.allowRequest()).toBe(true);
    breaker.recordFailure();
    expect(breaker.getState()).toBe('closed');
    breaker.recordFailure();
    expect(breaker.getState()).toBe('open');
    expect(breaker.allowRequest()).toBe(false);
    expect(breaker.getSnapshot()).toEqual({
      state: 'open',
      forcedOpen: false,
      consecutiveFailures: 2,
      openUntil: 301_000,
      lastFailureAt: 1_000,
      lastSuccessAt: null,
    });
  });

  it('enters half-open after the injected cooldown and allows one probe', () => {
    const { advance, breaker } = createBreaker();
    breaker.recordFailure();
    breaker.recordFailure();
    advance(299_999);
    expect(breaker.getState()).toBe('open');
    advance(1);
    expect(breaker.getState()).toBe('half_open');
    expect(breaker.allowRequest()).toBe(true);
    expect(breaker.allowRequest()).toBe(false);
  });

  it('closes after a successful half-open probe', () => {
    const { advance, breaker } = createBreaker();
    breaker.recordFailure();
    breaker.recordFailure();
    advance(300_000);
    expect(breaker.allowRequest()).toBe(true);
    breaker.recordSuccess();
    expect(breaker.getState()).toBe('closed');
    expect(breaker.allowRequest()).toBe(true);
    expect(breaker.getSnapshot()).toMatchObject({
      consecutiveFailures: 0,
      lastSuccessAt: 301_000,
      openUntil: null,
    });
  });

  it('reopens for the full cooldown after a failed half-open probe', () => {
    const { advance, breaker } = createBreaker();
    breaker.recordFailure();
    breaker.recordFailure();
    advance(300_000);
    expect(breaker.allowRequest()).toBe(true);
    breaker.recordFailure();
    expect(breaker.getState()).toBe('open');
    advance(299_999);
    expect(breaker.getState()).toBe('open');
  });

  it('does not open for an ignored application failure', () => {
    const { advance, breaker } = createBreaker();
    breaker.recordIgnoredFailure();
    expect(breaker.getState()).toBe('closed');
    breaker.recordFailure();
    breaker.recordFailure();
    advance(300_000);
    expect(breaker.allowRequest()).toBe(true);
    breaker.recordIgnoredFailure();
    expect(breaker.getState()).toBe('closed');
  });

  it('resets state and failure count manually', () => {
    const { breaker } = createBreaker();
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.reset();
    expect(breaker.getSnapshot()).toEqual({
      state: 'closed',
      forcedOpen: false,
      consecutiveFailures: 0,
      openUntil: null,
      lastFailureAt: null,
      lastSuccessAt: null,
    });
    breaker.recordFailure();
    expect(breaker.getState()).toBe('closed');
  });

  it('can be forced open for diagnostics and reset to normal behavior', () => {
    const { breaker } = createBreaker();
    breaker.setForcedOpen(true);
    expect(breaker.getSnapshot()).toMatchObject({
      state: 'open',
      forcedOpen: true,
    });
    expect(breaker.allowRequest()).toBe(false);

    breaker.setForcedOpen(false);
    expect(breaker.getSnapshot()).toMatchObject({
      state: 'closed',
      forcedOpen: false,
    });
    expect(breaker.allowRequest()).toBe(true);
  });
});
