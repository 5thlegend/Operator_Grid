// NRO ↔ NROS bridge.
// Federation adapter — broadcasts NRO events back to nextrealmos.pages.dev
// using the same shape as @nros/sdk so we can drop in the real SDK later
// without changing call sites.
//
// Activated when env.NROS_API_KEY + env.NROS_BASE_URL are both set as
// Worker secrets. When inactive, every call is a silent no-op so the
// rest of the app keeps working in standalone mode.

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
        return fetcher("/api/v1/federation/transmissions", "POST", payload);
      },
    },
    operators: {
      // Look up the canonical NROS operator by callsign.
      async lookup(callsign) {
        if (!enabled) return null;
        return fetcher(`/api/v1/federation/operators/${encodeURIComponent(callsign)}`, "GET");
      },
      // Upsert an operator into NROS — used on first NRO signup to mirror identity.
      async upsert(payload) {
        if (!enabled) return { skipped: true };
        return fetcher("/api/v1/federation/operators", "POST", payload);
      },
    },
    xp: {
      // Award canonical XP back to NROS so leaderboards stay unified.
      async award(payload) {
        if (!enabled) return { skipped: true };
        return fetcher("/api/v1/federation/xp", "POST", payload);
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
  return {
    kind: "MISSION_COMPLETED",
    realm_slug: "operator-grid",
    title: `${(deployment.kind || "deploy").toUpperCase()} · ${deployment.title}`,
    operator_callsign: op.handle,
    metadata: {
      deployment_id: deployment.id,
      kind: deployment.kind,
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
    realm_slug: "operator-grid",
    title: `${op.display_name || op.handle} ascended to ${toRank}`,
    operator_callsign: op.handle,
    metadata: { from_rank: fromRank, to_rank: toRank, at_xp: op.xp },
  };
}

export function guildForgedTransmission(op, guild) {
  return {
    kind: "CUSTOM",
    realm_slug: "operator-grid",
    title: `${op.display_name || op.handle} forged guild ${guild.sigil || "◈"} ${guild.name}`,
    operator_callsign: op.handle,
    metadata: {
      event: "GUILD_FORGED",
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
    realm_slug: "operator-grid",
    title: `${op.display_name} enlisted as @${op.handle}`,
    operator_callsign: op.handle,
    metadata: {
      city: op.city || null,
      state: op.state || null,
      lat: op.lat || null,
      lng: op.lng || null,
    },
  };
}
