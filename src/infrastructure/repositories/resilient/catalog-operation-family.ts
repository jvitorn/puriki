export const JIKAN_OPERATION_FAMILIES = [
  'featured',
  'popular',
  'seasonal',
  'upcoming',
  'search',
  'details',
] as const;

export type JikanOperationFamily = (typeof JIKAN_OPERATION_FAMILIES)[number];

export type JikanHealth =
  'healthy' | 'degraded' | 'unavailable' | 'rate_limited';

export const JIKAN_DISCOVERY_OPERATION_FAMILIES = [
  'popular',
  'seasonal',
  'upcoming',
] as const satisfies readonly JikanOperationFamily[];

export type JikanDiscoveryOperationFamily =
  (typeof JIKAN_DISCOVERY_OPERATION_FAMILIES)[number];
