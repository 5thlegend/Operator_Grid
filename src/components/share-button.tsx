"use client";

import { useState } from "react";
import { Copy, Check, Twitter } from "lucide-react";
import { KIND_LABEL } from "@/lib/xp";

export function ShareButton({
  url,
  text,
  kind,
  title,
  handle,
}: {
  url: string;
  text: string;
  kind: string;
  title: string;
  handle: string;
}) {
  const [copied, setCopied] = useState(false);

  const post = `🛰  ${KIND_LABEL[kind as "iteration" | "ship" | "milestone" | "launch"].toUpperCase()} — ${title}\n\n@${handle} · NRO\n${url}`;

  return (
    <div className="space-y-3">
      <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-text-mute)]">
        // BROADCAST
      </div>
      <div className="border border-[var(--color-line-strong)] bg-black/40 p-3 font-mono text-xs leading-relaxed text-[var(--color-text-dim)] whitespace-pre-wrap">
        {post}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(post);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }}
          className="inline-flex items-center gap-2 border border-[var(--color-line-strong)] bg-black/30 px-3 py-2 font-mono text-[11px] tracking-widest text-[var(--color-text)] hover:border-[var(--color-glow)] hover:text-[var(--color-glow)] transition-colors"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "COPIED" : "COPY POST"}
        </button>
        <a
          href={`https://x.com/intent/tweet?text=${encodeURIComponent(post)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 border border-[var(--color-glow)]/60 bg-[var(--color-glow-soft)] px-3 py-2 font-mono text-[11px] tracking-widest text-[var(--color-glow)] hover:bg-[var(--color-glow)]/20"
        >
          <Twitter className="h-3.5 w-3.5" />
          POST TO X
        </a>
      </div>
    </div>
  );
}
