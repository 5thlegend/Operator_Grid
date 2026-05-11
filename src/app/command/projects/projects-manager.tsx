"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createProject, deleteProject } from "@/app/command/projects/actions";
import type { Project, ProjectStatus } from "@/lib/types";
import { STACK_SUGGESTIONS } from "@/lib/constants";

export function ProjectsManager({ initial }: { initial: Project[] }) {
  const router = useRouter();
  const [projects, setProjects] = useState(initial);
  const [showForm, setShowForm] = useState(initial.length === 0);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [tagline, setTagline] = useState("");
  const [stack, setStack] = useState<string[]>([]);
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [linkLive, setLinkLive] = useState("");
  const [linkRepo, setLinkRepo] = useState("");

  function reset() {
    setName(""); setSlug(""); setTagline(""); setStack([]); setStatus("active");
    setLinkLive(""); setLinkRepo("");
  }

  return (
    <div className="p-5">
      <div className="mb-4 space-y-2">
        {projects.length === 0 && !showForm && (
          <div className="border border-[var(--color-line-strong)] bg-black/30 px-4 py-6 text-center font-mono text-xs text-[var(--color-text-mute)]">
            NO PROJECTS YET.
          </div>
        )}
        {projects.map((p) => (
          <div key={p.id} className="flex items-start gap-3 border border-[var(--color-line)] bg-[var(--color-surface)]/60 p-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-display text-base text-[var(--color-text)]" style={{ fontFamily: "var(--font-space), system-ui, sans-serif" }}>
                  {p.name}
                </span>
                <span className="font-mono text-[9px] tracking-widest uppercase text-[var(--color-text-mute)]">{p.status}</span>
              </div>
              {p.tagline && <p className="text-sm text-[var(--color-text-dim)]">{p.tagline}</p>}
              {p.stack.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {p.stack.map((s) => (
                    <span key={s} className="border border-[var(--color-line-strong)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--color-text-dim)]">{s}</span>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => {
                if (!confirm(`Delete project ${p.name}? Deployments will be unlinked.`)) return;
                start(async () => {
                  const res = await deleteProject(p.id);
                  if (res?.error) setError(res.error);
                  else {
                    setProjects((arr) => arr.filter((x) => x.id !== p.id));
                    router.refresh();
                  }
                });
              }}
              className="text-[var(--color-text-mute)] hover:text-[var(--color-danger)]"
              aria-label="Delete project"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 border border-[var(--color-glow)]/60 bg-[var(--color-glow-soft)] px-3 py-2 font-mono text-[11px] tracking-widest text-[var(--color-glow)] hover:bg-[var(--color-glow)]/20"
        >
          <Plus className="h-3.5 w-3.5" /> NEW PROJECT
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const res = await createProject({
                name, slug, tagline, stack, status,
                link_live: linkLive, link_repo: linkRepo,
              });
              if (res?.error) setError(res.error);
              else if (res?.project) {
                setProjects((arr) => [res.project!, ...arr]);
                setShowForm(false);
                reset();
                router.refresh();
              }
            });
          }}
          className="space-y-4 border border-[var(--color-line)] bg-black/30 p-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <input
                required value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slug) setSlug(slugify(e.target.value));
                }}
                maxLength={60}
                className="w-full border border-[var(--color-line-strong)] bg-black/40 px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-glow)] focus:outline-none"
              />
            </Field>
            <Field label="Slug" hint="lowercase, dashes">
              <input
                required value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                maxLength={40}
                className="w-full border border-[var(--color-line-strong)] bg-black/40 px-3 py-2 font-mono text-sm text-[var(--color-text)] focus:border-[var(--color-glow)] focus:outline-none"
              />
            </Field>
          </div>

          <Field label="Tagline">
            <input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              maxLength={140}
              className="w-full border border-[var(--color-line-strong)] bg-black/40 px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-glow)] focus:outline-none"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                className="w-full border border-[var(--color-line-strong)] bg-black/40 px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-glow)] focus:outline-none"
              >
                <option value="active">active</option>
                <option value="launched">launched</option>
                <option value="archived">archived</option>
              </select>
            </Field>
            <Field label="Live URL">
              <input
                type="url" value={linkLive}
                onChange={(e) => setLinkLive(e.target.value)}
                className="w-full border border-[var(--color-line-strong)] bg-black/40 px-3 py-2 font-mono text-sm text-[var(--color-text)] focus:border-[var(--color-glow)] focus:outline-none"
                placeholder="https://"
              />
            </Field>
            <Field label="Repo URL">
              <input
                type="url" value={linkRepo}
                onChange={(e) => setLinkRepo(e.target.value)}
                className="w-full border border-[var(--color-line-strong)] bg-black/40 px-3 py-2 font-mono text-sm text-[var(--color-text)] focus:border-[var(--color-glow)] focus:outline-none"
                placeholder="https://github.com/..."
              />
            </Field>
          </div>

          <Field label="Stack" hint="click to toggle">
            <div className="flex flex-wrap gap-1.5">
              {STACK_SUGGESTIONS.map((s) => {
                const on = stack.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStack((arr) => on ? arr.filter((x) => x !== s) : [...arr, s])}
                    className={
                      "border px-2 py-1 font-mono text-[10px] " +
                      (on
                        ? "border-[var(--color-glow)] bg-[var(--color-glow-soft)] text-[var(--color-glow)]"
                        : "border-[var(--color-line-strong)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]")
                    }
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </Field>

          {error && <p className="font-mono text-[11px] text-[var(--color-danger)]">{error}</p>}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending || !name || !slug}
              className="border border-[var(--color-glow)] bg-[var(--color-glow-soft)] px-4 py-2 font-mono text-[11px] tracking-widest text-[var(--color-glow)] hover:bg-[var(--color-glow)]/20 disabled:opacity-40"
            >
              {pending ? "SAVING…" : "SAVE PROJECT"}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); reset(); }}
              className="font-mono text-[11px] tracking-widest text-[var(--color-text-mute)] hover:text-[var(--color-text-dim)]"
            >
              CANCEL
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-text-mute)]">{label}</span>
        {hint && <span className="font-mono text-[10px] text-[var(--color-text-mute)]">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
