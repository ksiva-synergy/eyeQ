"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { PushConfigResponse } from "@eyeq/api-contract";
import { t } from "@eyeq/i18n";
import { Toggle } from "@eyeq/ui/web";
import { v1 } from "@/lib/athlete-api";

type Status = "checking" | "off" | "on" | "busy" | "denied" | "unavailable" | "error";
type Support = "server" | "supported" | "ios" | "unsupported";

const noSubscribe = () => () => {};

/** What this browser can do, read once on the client (the server renders nothing). */
function support(): Support {
  const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (ok) return "supported";
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return ios ? "ios" : "unsupported";
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/**
 * Web push opt-in, in Profile (plan phase 6, D29). Asks for permission only when the
 * athlete turns it on; registers /sw.js, subscribes with the server's VAPID key and
 * stores the subscription (POST /me/push-tokens). The copy says up front that iPhone and
 * iPad deliver web push only to a site added to the Home Screen. Nothing depends on it:
 * every notice is also in the in-app feed.
 */
export function PushOptIn() {
  const can = useSyncExternalStore(noSubscribe, support, () => "server" as const);
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    if (can !== "supported") return;
    let live = true;
    void (async () => {
      const sub = await currentSubscription().catch(() => null);
      if (!live) return;
      if (Notification.permission === "denied") setStatus("denied");
      else setStatus(sub ? "on" : "off");
    })();
    return () => {
      live = false;
    };
  }, [can]);

  async function turnOn() {
    setStatus("busy");
    const cfg = await v1<PushConfigResponse>("GET", "/me/push-config");
    if (!cfg.ok || !cfg.data.vapidPublicKey) return setStatus("unavailable");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return setStatus(permission === "denied" ? "denied" : "off");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(cfg.data.vapidPublicKey),
        }));
      const saved = await v1("POST", "/me/push-tokens", {
        platform: "web",
        subscription: sub.toJSON(),
      });
      setStatus(saved.ok ? "on" : "error");
    } catch {
      setStatus("error");
    }
  }

  async function turnOff() {
    setStatus("busy");
    const sub = await currentSubscription().catch(() => null);
    if (sub) {
      await v1("DELETE", "/me/push-tokens", { token: sub.endpoint });
      await sub.unsubscribe().catch(() => false);
    }
    setStatus("off");
  }

  const note =
    can === "ios"
      ? t("push.iosHint")
      : can === "unsupported"
        ? t("push.unsupported")
        : status === "denied"
          ? t("push.blocked")
          : status === "unavailable"
            ? t("push.unavailable")
            : status === "error"
              ? t("push.error")
              : null;

  return (
    <div className="flex flex-col gap-0.5 py-2" data-testid="push-opt-in">
      {can === "supported" && status !== "denied" && status !== "unavailable" ? (
        <Toggle
          label={t("push.title")}
          checked={status === "on"}
          onChange={(v) => {
            if (status === "busy" || status === "checking") return;
            void (v ? turnOn() : turnOff());
          }}
        />
      ) : (
        <span className="flex min-h-11 items-center text-[0.9375rem] font-bold">
          {t("push.title")}
        </span>
      )}
      <span className="pb-1 type-caption text-text-secondary">{t("push.sub")}</span>
      {note && (
        <span role="status" className="pb-1 type-caption text-text-primary">
          {note}
        </span>
      )}
    </div>
  );
}
