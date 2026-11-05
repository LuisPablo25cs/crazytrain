import { randomBytes, randomInt } from 'node:crypto';

/** Room code alphabet without look-alike characters (no 0/O, 1/I/L) (KTD10). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;

export function newRoomCode(taken: (code: string) => boolean): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!taken(code)) return code;
  }
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Secret reconnect token, kept by the browser (KTD10). */
export function newToken(): string {
  return randomBytes(18).toString('base64url');
}

/** Public seat id, safe to show to other players. */
export function newSeatId(): string {
  return randomBytes(6).toString('base64url');
}

export function newSeed(): number {
  return randomInt(0, 2 ** 31 - 1);
}
