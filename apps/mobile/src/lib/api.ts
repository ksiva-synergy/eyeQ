import { createApiClient, tokenSessionSchema } from "@eyeq/api-contract";
import { randomUUID } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { API_URL } from "./config";
import { createSessionManager } from "./session";

/** The one session and API client for the app. */
const store = {
  get: (k: string) => SecureStore.getItemAsync(k),
  set: (k: string, v: string) => SecureStore.setItemAsync(k, v),
  delete: (k: string) => SecureStore.deleteItemAsync(k),
};

const anonymous = createApiClient({ baseUrl: API_URL, newKey: randomUUID });

export const session = createSessionManager({
  store,
  refresh: (refreshToken) =>
    anonymous.post(
      "/api/auth/token/refresh",
      tokenSessionSchema,
      { refreshToken },
      { anonymous: true },
    ),
});

export const api = createApiClient({
  baseUrl: API_URL,
  newKey: randomUUID,
  accessToken: () => session.accessToken(),
  onUnauthorized: () => session.refreshNow(),
});
