"use client";

import { useState } from "react";
import { Gem, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!email.includes("@") || busy) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-amber-500 rounded-3xl p-4 mb-4">
            <Gem size={36} className="text-zinc-950" />
          </div>
          <h1 className="text-3xl font-extrabold">Runway</h1>
          <p className="text-zinc-500 text-sm mt-1">Your money, glanceable.</p>
        </div>

        {sent ? (
          <div className="bg-zinc-900 rounded-3xl p-6 text-center">
            <Mail size={28} className="mx-auto text-green-400 mb-3" />
            <p className="font-semibold">Check your email</p>
            <p className="text-sm text-zinc-400 mt-1">
              We sent a magic link to <b>{email}</b>. Open it on this device to sign in.
            </p>
            <button
              onClick={() => setSent(false)}
              className="mt-4 text-sm text-zinc-500 underline"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <div className="bg-zinc-900 rounded-3xl p-6">
            <label className="text-xs text-zinc-400">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full mt-1 bg-zinc-800 rounded-xl px-4 py-3 outline-none border border-zinc-700 focus:border-zinc-500"
            />
            {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
            <button
              onClick={send}
              disabled={busy || !email.includes("@")}
              className={`w-full py-3.5 rounded-2xl font-bold mt-4 ${
                busy || !email.includes("@")
                  ? "bg-zinc-800 text-zinc-600"
                  : "bg-green-600 text-white active:bg-green-700"
              }`}
            >
              {busy ? "Sending…" : "Send magic link"}
            </button>
            <p className="text-xs text-zinc-600 mt-3 text-center">
              No password. No account setup. The link signs you in.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
