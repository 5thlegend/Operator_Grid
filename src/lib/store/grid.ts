"use client";

import { create } from "zustand";
import type { RankTier, DeploymentKind } from "@/lib/types";

export type MapOperator = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  rank: RankTier;
  xp: number;
  momentum: number;
  signal_score: number;
  followers: number;
  active_users: number;
  streak_days: number;
  city: string | null;
  state: string | null;
  lat: number;
  lng: number;
  deployments_total: number;
};

export type Pulse = {
  id: string;          // unique pulse id (deployment id + ts)
  operatorId: string;
  lat: number;
  lng: number;
  kind: DeploymentKind;
  color: string;
  strength: number;    // 1..4
  title: string;
  handle: string;
  startedAt: number;   // ms
};

export type Ascension = {
  id: string;
  operator_id: string;
  handle: string;
  display_name: string;
  to_rank: RankTier;
  at: number;
};

export type FeedItem =
  | { kind: "deploy"; id: string; handle: string; title: string; deployKind: DeploymentKind; city?: string | null; at: number }
  | { kind: "ascension"; id: string; handle: string; to_rank: RankTier; at: number }
  | { kind: "signal"; id: string; handle: string; delta: number; at: number };

type State = {
  operators: Record<string, MapOperator>;
  pulses: Pulse[];
  feed: FeedItem[];
  ascension: Ascension | null;
  hovered: string | null;
  selected: string | null;
  setOperators: (list: MapOperator[]) => void;
  upsertOperator: (op: MapOperator) => void;
  addPulse: (p: Pulse) => void;
  reapPulses: () => void;
  pushFeed: (item: FeedItem) => void;
  setAscension: (a: Ascension | null) => void;
  setHovered: (id: string | null) => void;
  setSelected: (id: string | null) => void;
};

const PULSE_TTL_MS = 6_500;
const FEED_MAX = 60;

export const useGrid = create<State>((set, get) => ({
  operators: {},
  pulses: [],
  feed: [],
  ascension: null,
  hovered: null,
  selected: null,
  setOperators: (list) => {
    const map: Record<string, MapOperator> = {};
    for (const o of list) map[o.id] = o;
    set({ operators: map });
  },
  upsertOperator: (op) => set((s) => ({ operators: { ...s.operators, [op.id]: op } })),
  addPulse: (p) =>
    set((s) => ({ pulses: [...s.pulses.filter((x) => Date.now() - x.startedAt < PULSE_TTL_MS), p] })),
  reapPulses: () =>
    set((s) => ({ pulses: s.pulses.filter((x) => Date.now() - x.startedAt < PULSE_TTL_MS) })),
  pushFeed: (item) =>
    set((s) => ({ feed: [item, ...s.feed].slice(0, FEED_MAX) })),
  setAscension: (a) => set({ ascension: a }),
  setHovered: (id) => set({ hovered: id }),
  setSelected: (id) => set({ selected: id }),
}));
