import {
  CatalogCircuitBreaker,
  type CatalogCircuitBreakerOptions,
  type CircuitSnapshot,
} from '@/infrastructure/repositories/resilient/catalog-circuit-breaker';
import {
  JIKAN_OPERATION_FAMILIES,
  type JikanOperationFamily,
} from '@/infrastructure/repositories/resilient/catalog-operation-family';

export class CatalogCircuitBreakerRegistry {
  private readonly breakers: Record<
    JikanOperationFamily,
    CatalogCircuitBreaker
  >;

  constructor(options: CatalogCircuitBreakerOptions = {}) {
    this.breakers = Object.fromEntries(
      JIKAN_OPERATION_FAMILIES.map((family) => [
        family,
        new CatalogCircuitBreaker(options),
      ]),
    ) as Record<JikanOperationFamily, CatalogCircuitBreaker>;
  }

  get(family: JikanOperationFamily): CatalogCircuitBreaker {
    return this.breakers[family];
  }

  getSnapshot(): Record<JikanOperationFamily, CircuitSnapshot> {
    return Object.fromEntries(
      JIKAN_OPERATION_FAMILIES.map((family) => [
        family,
        this.breakers[family].getSnapshot(),
      ]),
    ) as Record<JikanOperationFamily, CircuitSnapshot>;
  }

  reset(family?: JikanOperationFamily): void {
    if (family) {
      this.breakers[family].reset();
      return;
    }
    JIKAN_OPERATION_FAMILIES.forEach((current) =>
      this.breakers[current].reset(),
    );
  }
}
