"use client";

import { useState } from "react";
import { ExternalLink, Landmark } from "lucide-react";

/** SimpleFIN connect flow: open Bridge in a new tab -> user links their bank
 *  and copies a one-time Setup Token -> pastes it here -> we claim + sync. */
export default function SimpleFinConnect({
  onConnected,
}: {
  onConnected?: (result: { accounts: any[]; sync: any }) => void;
}) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    if (!token.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/simplefin/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupToken: token.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Connecting failed");
      setToken("");
      onConnected?.(json);
    } catch (e: any) {
      setError(e?.message ?? "Connecting failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <a
        href="https://bridge.simplefin.org/simplefin/create"
        target="_blank"
        rel="noopener noreferrer"
        className="w-full py-3 rounded-2xl bg-zinc-800 text-zinc-100 font-semibold flex items-center justify-center gap-2"
      >
        <Landmark size={15} /> 1 · Get a token at SimpleFIN Bridge <ExternalLink size={13} />
      </a>
      <p className="text-xs text-zinc-500">
        Sign up there ($1.50/mo or $15/yr), link your bank, and it hands you a token. Come back and
        paste it below — each token works exactly once.
      </p>
      <textarea
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="2 · Paste your SimpleFIN token here"
        rows={3}
        className="w-full bg-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-100 outline-none border border-zinc-700 focus:border-zinc-500"
        style={{ wordBreak: "break-all" }}
      />
      <button
        onClick={connect}
        disabled={!token.trim() || busy}
        className={`w-full py-3 rounded-2xl font-bold ${
          token.trim() && !busy ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-600"
        }`}
      >
        {busy ? "Claiming token & importing…" : "3 · Connect bank"}
      </button>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}
