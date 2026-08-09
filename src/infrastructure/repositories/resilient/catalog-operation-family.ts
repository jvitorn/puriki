export const CATALOG_OPERATION_FAMILIES = [
  'featured',
  'popular',
  'seasonal',
  'upcoming',
  'search',
  'details',
] as const;

export type CatalogOperationFamily =
  (typeof CATALOG_OPERATION_FAMILIES)[number];

export type PrimaryCatalogHealth =
  'healthy' | 'degraded' | 'unavailable' | 'rate_limited';

export const CATALOG_DISCOVERY_OPERATION_FAMILIES = [
  'popular',
  'seasonal',
  'upcoming',
] as const satisfies readonly CatalogOperationFamily[];

export type CatalogDiscoveryOperationFamily =
  (typeof CATALOG_DISCOVERY_OPERATION_FAMILIES)[number];
