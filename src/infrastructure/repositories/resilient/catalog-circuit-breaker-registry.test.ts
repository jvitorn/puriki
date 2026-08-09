import { CatalogCircuitBreakerRegistry } from '@/infrastructure/repositories/resilient/catalog-circuit-breaker-registry';

describe('catalog circuit breaker registry', () => {
  it('isolates failures by operation family', () => {
    const registry = new CatalogCircuitBreakerRegistry();
    registry.get('popular').recordFailure();
    registry.get('popular').recordFailure();
    expect(registry.getSnapshot()).toMatchObject({
      popular: { state: 'open', consecutiveFailures: 2 },
      seasonal: { state: 'closed', consecutiveFailures: 0 },
      upcoming: { state: 'closed', consecutiveFailures: 0 },
      search: { state: 'closed', consecutiveFailures: 0 },
      details: { state: 'closed', consecutiveFailures: 0 },
    });
  });

  it('keeps details failures from affecting discovery families', () => {
    const registry = new CatalogCircuitBreakerRegistry();
    registry.get('details').recordFailure();
    registry.get('details').recordFailure();
    expect(registry.get('details').getState()).toBe('open');
    expect(registry.get('popular').getState()).toBe('closed');
    expect(registry.get('search').getState()).toBe('closed');
  });

  it('resets one family without resetting another and resets all explicitly', () => {
    const registry = new CatalogCircuitBreakerRegistry();
    registry.get('popular').recordFailure();
    registry.get('popular').recordFailure();
    registry.get('details').recordFailure();
    registry.get('details').recordFailure();
    registry.reset('popular');
    expect(registry.get('popular').getState()).toBe('closed');
    expect(registry.get('details').getState()).toBe('open');
    registry.reset();
    expect(registry.get('details').getState()).toBe('closed');
  });
});
