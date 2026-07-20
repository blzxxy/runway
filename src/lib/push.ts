import type { SupabaseClient } from "@supabase/supabase-js";

export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function subscribeToPush(supabase: SupabaseClient, userId: string) {
  if (!("serviceWorker" in navigator)) throw new Error("Service workers unsupported");
  if (!("PushManager" in window)) throw new Error("Push unsupported on this browser");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notification permission was denied");
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
  });
  const json = sub.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
    },
    { onConflict: "endpoint" }
  );
  if (error) throw error;
}

export async function unsubscribeFromPush(supabase: SupabaseClient) {
  const sub = await getExistingSubscription();
  if (sub) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  }
}

export const isIOS = () =>
  typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

export const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true);
