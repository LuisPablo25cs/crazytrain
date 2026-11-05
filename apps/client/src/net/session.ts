import type { Intent } from '@rails/shared';

/** Storage that may be missing or throw (private windows, blocked site data). */
export interface SafeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): SafeStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Remembers the reconnect token per room (KTD10). A dev-only `?seat=<label>` URL parameter keeps
 * separate tokens per label, so several windows of one browser can act as different players.
 */
export class Session {
  constructor(
    private readonly storage: SafeStorage | null = browserStorage(),
    private readonly seatLabel: string | null = readSeatLabel(),
  ) {}

  private key(kind: string, code?: string): string {
    const label = this.seatLabel ? `:${this.seatLabel}` : '';
    return code ? `rails:${kind}:${code.toUpperCase()}${label}` : `rails:${kind}${label}`;
  }

  private get(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private set(key: string, value: string | null): void {
    try {
      if (value === null) this.storage?.removeItem(key);
      else this.storage?.setItem(key, value);
    } catch {
      // Storage is optional; the game still works without reconnect-after-close.
    }
  }

  token(code: string): string | null {
    return this.get(this.key('token', code));
  }

  saveToken(code: string, token: string): void {
    this.set(this.key('token', code), token);
  }

  forget(code: string): void {
    this.set(this.key('token', code), null);
  }

  name(): string {
    return this.get(this.key('name')) ?? '';
  }

  saveName(name: string): void {
    this.set(this.key('name'), name);
  }

  theme(): string | null {
    return this.get('rails:theme');
  }

  saveTheme(id: string): void {
    this.set('rails:theme', id);
  }

  /** The intent that enters a room: a reconnect when a token is stored, else a fresh join. */
  joinIntent(code: string, name: string): Intent {
    const token = this.token(code);
    return { type: 'joinRoom', code, name: name || 'Player', ...(token ? { token } : {}) };
  }
}

function readSeatLabel(): string | null {
  if (typeof location === 'undefined') return null;
  const label = new URLSearchParams(location.search).get('seat');
  return label && /^[\w-]{1,20}$/.test(label) ? label : null;
}

export function roomCodeFromPath(pathname: string): string | null {
  const match = /^\/r\/([A-Za-z0-9]{3,10})\/?$/.exec(pathname);
  return match ? match[1]!.toUpperCase() : null;
}
