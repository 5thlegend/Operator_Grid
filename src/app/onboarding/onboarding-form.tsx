"use client";

import { useState, useTransition } from "react";
import { createOperator } from "@/app/onboarding/actions";

export function OnboardingForm({ email }: { email: string }) {
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState(email.split("@")[0] ?? "");
  const [tagline, setTagline] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await createOperator({
            handle,
            display_name: displayName,
            tagline,
            city,
            state,
          });
          if (res?.error) setError(res.error);
        });
      }}
      className="space-y-5 p-5"
    >
      <Field
        label="Callsign"
        hint="Lowercase letters, numbers, underscore. 2–24 chars."
      >
        <div className="flex items-center border border-[var(--color-line-strong)] bg-black/40 focus-within:border-[var(--color-glow)]">
          <span className="px-3 font-mono text-sm text-[var(--color-text-mute)]">@</span>
          <input
            required
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            maxLength={24}
            className="w-full bg-transparent px-1 py-2.5 font-mono text-sm text-[var(--color-text)] focus:outline-none"
            placeholder="ghost_signal"
          />
        </div>
      </Field>

      <Field label="Display Name">
        <input
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={48}
          className="w-full border border-[var(--color-line-strong)] bg-black/40 px-3 py-2.5 font-mono text-sm text-[var(--color-text)] focus:border-[var(--color-glow)] focus:outline-none"
        />
      </Field>

      <Field label="Tagline" hint="One line. What you build. Optional.">
        <input
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          maxLength={120}
          className="w-full border border-[var(--color-line-strong)] bg-black/40 px-3 py-2.5 text-sm text-[var(--color-text)] focus:border-[var(--color-glow)] focus:outline-none"
          placeholder="Forging cinematic systems for indie operators."
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Field label="City" hint="Plots you on the Signal Map.">
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            maxLength={48}
            className="w-full border border-[var(--color-line-strong)] bg-black/40 px-3 py-2.5 text-sm text-[var(--color-text)] focus:border-[var(--color-glow)] focus:outline-none"
            placeholder="Los Angeles"
          />
        </Field>
        <Field label="State" hint="2 letters">
          <input
            value={state}
            onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
            maxLength={2}
            className="w-full border border-[var(--color-line-strong)] bg-black/40 px-3 py-2.5 font-mono text-sm uppercase text-[var(--color-text)] focus:border-[var(--color-glow)] focus:outline-none"
            placeholder="CA"
          />
        </Field>
      </div>

      {error && (
        <p className="font-mono text-[11px] text-[var(--color-danger)]">{error}</p>
      )}

      <button
        type="submit"
        disabled={pending || handle.length < 2}
        className="w-full border border-[var(--color-glow)] bg-[var(--color-glow-soft)] px-3 py-3 font-mono text-xs tracking-[0.2em] text-[var(--color-glow)] hover:bg-[var(--color-glow)]/20 disabled:opacity-40"
      >
        {pending ? "FORGING DOSSIER…" : "INITIATE"}
      </button>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-text-mute)]">
          {label}
        </span>
        {hint && (
          <span className="font-mono text-[10px] text-[var(--color-text-mute)]">{hint}</span>
        )}
      </div>
      {children}
    </label>
  );
}
