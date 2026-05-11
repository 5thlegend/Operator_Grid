"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDeployment } from "@/app/command/deploy/actions";
import { KIND_LABEL, KIND_DESCRIPTION, XP_TABLE } from "@/lib/xp";
import type { DeploymentKind } from "@/lib/types";
import { KindBadge } from "@/components/kind-badge";

const KINDS: DeploymentKind[] = ["iteration", "ship", "milestone", "launch"];

export function DeployForm({ projects }: { projects: { id: string; name: string; slug: string }[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<DeploymentKind>("iteration");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await createDeployment({
            kind,
            title,
            description,
            url,
            project_id: projectId || null,
          });
          if (res?.error) {
            setError(res.error);
            return;
          }
          if (res?.handle && res?.id) {
            router.push(`/u/${res.handle}/d/${res.id}`);
          }
        });
      }}
      className="space-y-5 p-5"
    >
      {/* KIND PICKER */}
      <div>
        <div className="mb-2 font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-text-mute)]">
          Kind
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={
                "flex flex-col items-start gap-1.5 border bg-[var(--color-surface)]/40 p-3 text-left transition-colors " +
                (kind === k
                  ? "border-[var(--color-glow)] bg-[var(--color-glow-soft)]"
                  : "border-[var(--color-line)] hover:border-[var(--color-text-dim)]")
              }
            >
              <KindBadge kind={k} />
              <span className="font-mono text-[10px] text-[var(--color-glow)]">+{XP_TABLE[k]} XP</span>
              <span className="text-[10px] leading-snug text-[var(--color-text-dim)]">{KIND_DESCRIPTION[k]}</span>
            </button>
          ))}
        </div>
      </div>

      <Field label="Title" hint="Short. Punchy. Public.">
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          className="w-full border border-[var(--color-line-strong)] bg-black/40 px-3 py-2.5 text-sm text-[var(--color-text)] focus:border-[var(--color-glow)] focus:outline-none"
          placeholder={`Shipped ${KIND_LABEL[kind].toLowerCase()}: ...`}
        />
      </Field>

      <Field label="Description" hint="Optional. What changed and why.">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={1000}
          rows={4}
          className="w-full resize-none border border-[var(--color-line-strong)] bg-black/40 px-3 py-2.5 text-sm text-[var(--color-text)] focus:border-[var(--color-glow)] focus:outline-none"
        />
      </Field>

      <Field label="Link" hint="Live URL or commit/PR.">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full border border-[var(--color-line-strong)] bg-black/40 px-3 py-2.5 font-mono text-sm text-[var(--color-text)] focus:border-[var(--color-glow)] focus:outline-none"
          placeholder="https://"
        />
      </Field>

      {projects.length > 0 && (
        <Field label="Project" hint="Optional.">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full border border-[var(--color-line-strong)] bg-black/40 px-3 py-2.5 text-sm text-[var(--color-text)] focus:border-[var(--color-glow)] focus:outline-none"
          >
            <option value="">— none —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
      )}

      {error && <p className="font-mono text-[11px] text-[var(--color-danger)]">{error}</p>}

      <button
        type="submit"
        disabled={pending || title.length < 2}
        className="w-full border border-[var(--color-glow)] bg-[var(--color-glow-soft)] px-3 py-3 font-mono text-xs tracking-[0.2em] text-[var(--color-glow)] hover:bg-[var(--color-glow)]/20 disabled:opacity-40"
      >
        {pending ? "STAMPING…" : `LOG ${KIND_LABEL[kind].toUpperCase()} · +${XP_TABLE[kind]} XP`}
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
        {hint && <span className="font-mono text-[10px] text-[var(--color-text-mute)]">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
