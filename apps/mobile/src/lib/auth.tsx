import { okResponseSchema, type TokenSession } from "@eyeq/api-contract";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState } from "react-native";
import { api, session } from "./api";

type Status = "loading" | "signedIn" | "signedOut";

interface Auth {
  status: Status;
  userId: string | null;
  signIn(tokens: TokenSession): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<Auth | null>(null);

export function useAuth(): Auth {
  const v = use(AuthContext);
  if (!v) throw new Error("useAuth needs <AuthProvider>");
  return v;
}

/** Holds the session for the screens; the route guards in app/_layout.tsx read `status`. */
export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("loading");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const off = session.subscribe((s) => {
      setUserId(s?.userId ?? null);
      setStatus(s ? "signedIn" : "signedOut");
      if (!s) queryClient.clear();
    });
    void session.load().then((s) => {
      setUserId(s?.userId ?? null);
      setStatus(s ? "signedIn" : "signedOut");
    });
    // Back in the foreground: refresh a token that expired while the app slept.
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && session.current()) void session.accessToken();
    });
    return () => {
      off();
      sub.remove();
    };
  }, [queryClient]);

  const signIn = useCallback((tokens: TokenSession) => session.save(tokens), []);
  const signOut = useCallback(async () => {
    // Revoke on the server when it answers; the device forgets the session either way.
    await api.post("/api/auth/token/sign-out", okResponseSchema, {});
    await session.clear();
  }, []);

  const value = useMemo(
    () => ({ status, userId, signIn, signOut }),
    [status, userId, signIn, signOut],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}
