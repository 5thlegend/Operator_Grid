"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Operator } from "@/lib/types";
import { updateProfile } from "@/app/command/profile/actions";

export function ProfileForm({ operator }: { operator: Operator }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(operator.display_name);
  const [tagline, setTagline] = useState(operator.tagline ?? "");
  const [bio, setBio] = useState(operator.bio ?? "");
  const [location, setLocation] = useState(operator.location ?? "");
  const [city, setCity] = useState(operator.city ?? "");
  const [state, setState] = useState(operator.state ?? "");
  const [avatarUrl, setAvatarUrl] = useState(operator.avatar_url ?? "");
  const [linkSite, setLinkSite] = useState(operator.link_site ?? "");
  const [linkX, setLinkX] = useState(operator.link_x ?? "");
  const [linkGithub, setLinkGithub] = useState(operator.link_github ?? "");
  const [currentProject, setCurrentProject] = useState(operator.current_project ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const res = await updateProfile({
            display_name: displayName,
            tagline,
            bio,
            location,
            city,
            state,
            avatar_url: avatarUrl,
            link_site: linkSite,
            link_x: linkX,
            link_github: linkGithub,
            current_project: currentProject,
          });
          if (res?.error) setMsg({ type: "err", text: res.error });
          else {
            setMsg({ type: "ok", text: "DOSSIER UPDATED." });
            router.refresh();
          }
        });
      }}
      className="space-y-5 p-5"
    >
      <div className="border border-[var(--color-line)] bg-black/30 p-3 font-mono text-[10px] text-[var(--color-text-mute)]">
        CALLSIGN <span className="text-[var(--color-glow)]">@{operator.handle}</span> · IMMUTABLE
      </div>

      <Field label="Display Name">
        <Input value={displayName} onChange={setDisplayName} maxLength={48} required />
      </Field>

      <Field label="Tagline">
        <Input value={tagline} onChange={setTagline} maxLength={120} />
      </Field>

      <Field label="Bio">
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={600}
          rows={4}
          className="w-full resize-none border border-[var(--color-line-strong)] bg-black/40 px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-glow)] focus:outline-none"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_2fr]">
        <Field label="City"><Input value={city} onChange={setCity} maxLength={48} placeholder="Los Angeles" /></Field>
        <Field label="State"><Input value={state} onChange={(v) => setState(v.toUpperCase().slice(0, 2))} maxLength={2} placeholder="CA" /></Field>
        <Field label="Location (display)"><Input value={location} onChange={setLocation} maxLength={48} placeholder="Pacific NW" /></Field>
      </div>
      <Field label="Current Project"><Input value={currentProject} onChange={setCurrentProject} maxLength={60} /></Field>

      <Field label="Avatar URL">
        <Input value={avatarUrl} onChange={setAvatarUrl} maxLength={300} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Site"><Input value={linkSite} onChange={setLinkSite} maxLength={200} placeholder="https://" /></Field>
        <Field label="X / Twitter"><Input value={linkX} onChange={setLinkX} maxLength={60} placeholder="@handle" /></Field>
        <Field label="GitHub"><Input value={linkGithub} onChange={setLinkGithub} maxLength={60} placeholder="username" /></Field>
      </div>

      {msg && (
        <p
          className={
            "font-mono text-[11px] " +
            (msg.type === "ok" ? "text-[var(--color-glow)]" : "text-[var(--color-danger)]")
          }
        >
          {msg.text}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full border border-[var(--color-glow)] bg-[var(--color-glow-soft)] px-3 py-3 font-mono text-xs tracking-[0.2em] text-[var(--color-glow)] hover:bg-[var(--color-glow)]/20 disabled:opacity-40"
      >
        {pending ? "SAVING…" : "SAVE DOSSIER"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-text-mute)]">
        {label}
      </div>
      {children}
    </label>
  );
}

function Input({
  value, onChange, ...rest
}: {
  value: string; onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <input
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border border-[var(--color-line-strong)] bg-black/40 px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-glow)] focus:outline-none"
    />
  );
}
