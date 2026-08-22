import * as Crypto from 'expo-crypto';

const VERIFIER_LENGTH = 64;
const UNRESERVED_CHARSET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

export interface PkceRandomBytes {
  (byteCount: number): Uint8Array;
}

export function createCodeVerifier(
  randomBytes: PkceRandomBytes = Crypto.getRandomBytes,
): string {
  const bytes = randomBytes(VERIFIER_LENGTH);
  let verifier = '';
  for (let index = 0; index < bytes.length; index += 1) {
    verifier += UNRESERVED_CHARSET[bytes[index]! % UNRESERVED_CHARSET.length];
  }
  return verifier;
}
