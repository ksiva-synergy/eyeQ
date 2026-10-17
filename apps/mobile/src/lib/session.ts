import type { ApiResult, TokenSession } from "@eyeq/api-contract";

/**
 * The signed-in session on the device (DECISIONS.md, phase 8: session storage). Tokens live
 * in secure storage (Keychain, Android Keystore), one key each, and never in logs. The
 * access token is refreshed when it is within a minute of expiry, when the app returns to
 * the foreground, and once after a 401; one refresh runs at a time. A refresh the server
 * refuses ends the session on the device; a refresh that cannot reach it keeps the session,
 * so an athlete offline stays signed in.
 *
 * Plain TypeScript with the store and the refresh call injected, so it is tested without
 * React Native.
 */
export interface TokenStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export type SessionTokens = TokenSession;

export interface SessionDeps {
  store: TokenStore;
  /** POST /api/auth/token/refresh */
  refresh: (refreshToken: string) => Promise<ApiResult<TokenSession>>;
  /** Unix seconds. */
  now?: () => number;
}

export interface SessionManager {
  /** Reads the stored session, once at start. */
  load(): Promise<SessionTokens | null>;
  current(): SessionTokens | null;
  save(tokens: SessionTokens): Promise<void>;
  clear(): Promise<void>;
  /** The access token to send, refreshed first when it is about to expire. */
  accessToken(): Promise<string | null>;
  /** Refresh now (a 401, the app returning to the foreground). True if a new token is held. */
  refreshNow(): Promise<boolean>;
  /** Called whenever the session changes, with null when it ends. */
  subscribe(listener: (s: SessionTokens | null) => void): () => void;
}

const KEYS = {
  access: "eyeq.session.access",
  refresh: "eyeq.session.refresh",
  meta: "eyeq.session.meta",
} as const;

/** Refresh this many seconds before the access token expires. */
const EARLY_S = 60;

export function createSessionManager(deps: SessionDeps): SessionManager {
  const now = deps.now ?? (() => Math.floor(Date.now() / 1000));
  let tokens: SessionTokens | null = null;
  let inFlight: Promise<boolean> | null = null;
  const listeners = new Set<(s: SessionTokens | null) => void>();
  const emit = () => listeners.forEach((l) => l(tokens));

  async function save(t: SessionTokens) {
    tokens = t;
    await deps.store.set(KEYS.access, t.accessToken);
    await deps.store.set(KEYS.refresh, t.refreshToken);
    await deps.store.set(KEYS.meta, JSON.stringify({ userId: t.userId, expiresAt: t.expiresAt }));
    emit();
  }

  async function clear() {
    tokens = null;
    await deps.store.delete(KEYS.access);
    await deps.store.delete(KEYS.refresh);
    await deps.store.delete(KEYS.meta);
    emit();
  }

  function refreshNow(): Promise<boolean> {
    if (inFlight) return inFlight;
    const held = tokens;
    if (!held) return Promise.resolve(false);
    inFlight = (async () => {
      const r = await deps.refresh(held.refreshToken);
      if (r.ok) {
        await save(r.data);
        return true;
      }
      if (r.status === 401 || r.status === 400) await clear();
      return false;
    })().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  return {
    async load() {
      const [access, refresh, meta] = await Promise.all([
        deps.store.get(KEYS.access),
        deps.store.get(KEYS.refresh),
        deps.store.get(KEYS.meta),
      ]);
      if (!refresh || !meta) return null;
      try {
        const m = JSON.parse(meta) as { userId: string; expiresAt: number };
        tokens = {
          userId: m.userId,
          expiresAt: access ? m.expiresAt : 0,
          accessToken: access ?? "",
          refreshToken: refresh,
        };
      } catch {
        await clear();
        return null;
      }
      return tokens;
    },
    current: () => tokens,
    save,
    clear,
    async accessToken() {
      if (!tokens) return null;
      if (tokens.expiresAt - now() <= EARLY_S) await refreshNow();
      return tokens?.accessToken || null;
    },
    refreshNow,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
