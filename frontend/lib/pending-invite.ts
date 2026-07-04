const KEY = "aether_pending_invite_token";

export function setPendingInvite(token: string) {
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, token);
}

export function getPendingInvite(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function clearPendingInvite() {
  if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
}
