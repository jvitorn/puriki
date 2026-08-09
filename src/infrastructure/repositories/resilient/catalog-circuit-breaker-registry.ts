import {
  CatalogCircuitBreaker,
  type CatalogCircuitBreakerOptions,
  type CircuitSnapshot,
} from '@/infrastructure/repositories/resilient/catalog-circuit-breaker';
import {
  CATALOG_OPERATION_FAMILIES,
  type CatalogOperationFamily,
} from '@/infrastructure/repositories/resilient/catalog-operation-family';

export class CatalogCircuitBreakerRegistry {
  private readonly breakers: Record<
    CatalogOperationFamily,
    CatalogCircuitBreaker
  >;

  constructor(options: CatalogCircuitBreakerOptions = {}) {
    this.breakers = Object.fromEntries(
      CATALOG_OPERATION_FAMILIES.map((family) => [
        family,
        new CatalogCircuitBreaker(options),
      ]),
    ) as Record<CatalogOperationFamily, CatalogCircuitBreaker>;
  }

  get(family: CatalogOperationFamily): CatalogCircuitBreaker {
    return this.breakers[family];
  }

  getSnapshot(): Record<CatalogOperationFamily, CircuitSnapshot> {
    return Object.fromEntries(
      CATALOG_OPERATION_FAMILIES.map((family) => [
        family,
        this.breakers[family].getSnapshot(),
      ]),
    ) as Record<CatalogOperationFamily, CircuitSnapshot>;
  }

  reset(family?: CatalogOperationFamily): void {
    if (family) {
      this.breakers[family].reset();
      return;
    }
    CATALOG_OPERATION_FAMILIES.forEach((current) =>
      this.breakers[current].reset(),
    );
  }
}
