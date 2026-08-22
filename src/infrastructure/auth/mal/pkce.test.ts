import { createCodeVerifier } from '@/infrastructure/auth/mal/pkce';

describe('createCodeVerifier', () => {
  it('produces a string within the RFC 7636 unreserved charset and length bounds', () => {
    const verifier = createCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it('produces distinct values across calls', () => {
    const first = createCodeVerifier();
    const second = createCodeVerifier();
    expect(first).not.toBe(second);
  });

  it('uses the injected random byte source deterministically', () => {
    const randomBytes = jest.fn(
      (byteCount: number) => new Uint8Array(byteCount).fill(0),
    );
    const verifier = createCodeVerifier(randomBytes);
    expect(randomBytes).toHaveBeenCalledWith(64);
    expect(verifier).toBe('A'.repeat(64));
  });
});
