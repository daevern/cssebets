import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getVapidPublicKey,
  subscribeDevice,
  unsubscribeDevice,
} from "@/lib/notifications.functions";

function urlB64ToUint8Array(b64: string): Uint8Array {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushStatus =
  | "unsupported"
  | "denied"
  | "granted-subscribed"
  | "granted-unsubscribed"
  | "default"
  | "loading";

export function usePushSubscription() {
  const [status, setStatus] = useState<PushStatus>("loading");
  const getKey = useServerFn(getVapidPublicKey);
  const subscribeFn = useServerFn(subscribeDevice);
  const unsubscribeFn = useServerFn(unsubscribeDevice);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setStatus("unsupported");
      return;
    }
    const perm = Notification.permission;
    if (perm === "denied") { setStatus("denied"); return; }
    const reg = await navigator.serviceWorker.getRegistration("/push-sw.js");
    if (!reg) { setStatus(perm === "granted" ? "granted-unsubscribed" : "default"); return; }
    const sub = await reg.pushManager.getSubscription();
    if (perm !== "granted") { setStatus("default"); return; }
    setStatus(sub ? "granted-subscribed" : "granted-unsubscribed");
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const enable = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    let reg = await navigator.serviceWorker.getRegistration("/push-sw.js");
    if (!reg) reg = await navigator.serviceWorker.register("/push-sw.js");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { await refresh(); return; }
    const { publicKey } = await getKey();
    if (!publicKey) { await refresh(); return; }
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(publicKey),
      });
    }
    const j = sub.toJSON() as any;
    await subscribeFn({
      data: {
        endpoint: sub.endpoint,
        p256dh: j.keys?.p256dh,
        auth: j.keys?.auth,
        userAgent: navigator.userAgent.slice(0, 400),
      },
    });
    await refresh();
  }, [getKey, subscribeFn, refresh]);

  const disable = useCallback(async () => {
    const reg = await navigator.serviceWorker.getRegistration("/push-sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => {});
      try { await unsubscribeFn({ data: { endpoint } }); } catch {}
    }
    await refresh();
  }, [unsubscribeFn, refresh]);

  return { status, enable, disable, refresh };
}
