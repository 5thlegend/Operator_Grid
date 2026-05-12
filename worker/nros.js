// NRO ↔ NROS bridge.
// Federation adapter — broadcasts NRO events back to nextrealmos.pages.dev
// using the same shape as @nros/sdk so we can drop in the real SDK later
// without changing call sites.
//
// Activated when env.NROS_API_KEY + env.NROS_BASE_URL are both set as
// Worker secrets. When inactive, every call is a silent no-op so the
// rest of the app keeps working in standalone mode.
//
// V3.4 (audit fixes):
//   - Endpoints corrected from /api/v1/federation/... → /api/federation/...
//     (NROS V3 dropped the v1 namespace; the alias still works but we
//     prefer the canonical path).
//   - Field name corrected from `operator_callsign` → `callsign` so
//     NROS resolves the operator UUID server-side.
//   - Removed `realm_slug` (NROS infers realm from the bearer key).
//   - Each event helper now sets a dotted `event_name` so the V3 event
//     vocabulary is honored and surfaces (Realm Graph, ticker, achievements)
//     render the right glyph + animation.

export function makeNros(env) {
  const apiKey = env.NROS_API_KEY;
  const baseUrl = (env.NROS_BASE_URL || "https://nextrealmos.pages.dev").replace(/\/$/, "");
  const enabled = !!apiKey;
  const fetcher = enabled ? createFetcher(baseUrl, apiKey) : () => Promise.resolve({ skipped: true });

  return {
    enabled,
    transmissions: {
      // Fire-and-forget broadcast of an event into the NROS federation feed.
      async push(payload) {
        if (!enabled) return { skipped: true };
        return fetcher("/api/federation/transmissions", "POST", payload);
      },
    },
    operators: {
      // Look up the canonical NROS operator by callsign.
      async lookup(callsign) {
        if (!enabled) return null;
        return fetcher(`/api/federation/operators/${encodeURIComponent(callsign)}`, "GET");
      },
      // Upsert an operator into NROS — used on first NRO signup to mirror identity.
      async upsert(payload) {
        if (!enabled) return { skipped: true };
        return fetcher("/api/federation/operators", "POST", payload);
      },
    },
    xp: {
      // Award canonical XP back to NROS so leaderboards stay unified.
      async award(payload) {
        if (!enabled) return { skipped: true };
        return fetcher("/api/federation/xp", "POST", payload);
      },
    },
  };
}

function createFetcher(baseUrl, apiKey) {
  return async function (path, method, body) {
    try {
      const res = await fetch(baseUrl + path, {
        method,
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${apiKey}`,
          "x-nros-source": "operator-grid",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        return { ok: false, status: res.status, error: await safeText(res) };
      }
      return { ok: true, data: await res.json().catch(() => null) };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  };
}

async function safeText(res) {
  try { return (await res.text()).slice(0, 200); } catch { return ""; }
}

// Event-shape helpers — match @nros/sdk's `TransmissionKind` literals
// so calls translate 1:1 when we switch to the real SDK.

export function deploymentTransmission(op, deployment) {
  const kind = (deployment.kind || "ship").toLowerCase(); // "iteration" | "ship" | "milestone" | "launch"
  const txKind = kind === "launch"    ? "WORKFLOW_FORGED"
              : kind === "milestone" ? "MISSION_COMPLETED"
              : "CUSTOM";
  return {
    kind: txKind,
    event_name: `deployment.${kind}`,
    title: `${kind.toUpperCase()} · ${deployment.title}`,
    callsign: op.handle,
    metadata: {
      deployment_id: deployment.id,
      kind,
      xp_awarded: deployment.xp_awarded,
      url: deployment.url || null,
      signal_score_after: op.signal_score,
      momentum_after: op.momentum,
      streak_days: op.streak_days,
    },
  };
}

export function rankTransmission(op, fromRank, toRank) {
  return {
    kind: "RANK_CHANGED",
    event_name: "operator.ascension",
    title: `${op.display_name || op.handle} ascended to ${toRank}`,
    callsign: op.handle,
    metadata: { from_rank: fromRank, to_rank: toRank, at_xp: op.xp },
  };
}

export function guildForgedTransmission(op, guild) {
  return {
    kind: "CUSTOM",
    event_name: "guild.create",
    title: `${op.display_name || op.handle} forged guild ${guild.sigil || "◈"} ${guild.name}`,
    callsign: op.handle,
    metadata: {
      guild_id: guild.id,
      guild_slug: guild.slug,
      sigil: guild.sigil,
      color: guild.color,
    },
  };
}

export function onboardingTransmission(op) {
  return {
    kind: "OPERATOR_JOINED",
    event_name: "operator.activation",
    title: `${op.display_name} enlisted as @${op.handle}`,
    callsign: op.handle,
    metadata: {
      city: op.city || null,
      state: op.state || null,
      lat: op.lat || null,
      lng: op.lng || null,
    },
  };
}
