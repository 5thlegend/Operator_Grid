"use client";

import { useState, useTransition } from "react";
import { sendMagicLink } from "@/app/login/actions";

export function LoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await sendMagicLink(email, next);
          if (res?.error) setError(res.error);
        });
      }}
      className="space-y-3"
    >
      <label className="block">
        <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-text-mute)]">
          Operator Email
        </span>
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5 w-full border border-[var(--color-line-strong)] bg-black/40 px-3 py-2.5 font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-mute)] focus:border-[var(--color-glow)] focus:outline-none"
          placeholder="callsign@signal.net"
        />
      </label>
      {error && (
        <p className="font-mono text-[11px] text-[var(--color-danger)]">{error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full border border-[var(--color-glow)] bg-[var(--color-glow-soft)] px-3 py-2.5 font-mono text-xs tracking-[0.2em] text-[var(--color-glow)] hover:bg-[var(--color-glow)]/20 disabled:opacity-50"
      >
        {pending ? "TRANSMITTING…" : "SEND SIGN-IN LINK"}
      </button>
    </form>
  );
}
