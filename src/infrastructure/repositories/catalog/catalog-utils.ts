export type RandomGenerator = () => number;

export function createAnimeFallbackSeeds(id: number): {
  coverSeed: number;
  bannerSeed: number;
} {
  return {
    coverSeed: Math.abs(Math.imul(id, 2_654_435_761)) % 10_000,
    bannerSeed: Math.abs(Math.imul(id ^ 0x9e3779b9, 1_597_334_677)) % 10_000,
  };
}
