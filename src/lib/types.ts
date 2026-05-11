export type RankTier = "INITIATE" | "OPERATOR" | "ARCHITECT" | "COMMANDER" | "SOVEREIGN";
export type DeploymentKind = "iteration" | "ship" | "milestone" | "launch";
export type ProjectStatus = "active" | "launched" | "archived";

export type Operator = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  tagline: string | null;
  bio: string | null;
  location: string | null;
  link_site: string | null;
  link_x: string | null;
  link_github: string | null;
  current_project: string | null;
  rank: RankTier;
  xp: number;
  momentum: number;
  streak_days: number;
  last_deployment_at: string | null;
  // Signal Map (added by schema_signal_map.sql)
  city: string | null;
  state: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  signal_score: number;
  followers: number;
  active_users: number;
  created_at: string;
  updated_at: string;
};

export type Project = {
  id: string;
  operator_id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  status: ProjectStatus;
  stack: string[];
  link_live: string | null;
  link_repo: string | null;
  cover_url: string | null;
  created_at: string;
  updated_at: string;
};

export type Deployment = {
  id: string;
  operator_id: string;
  project_id: string | null;
  kind: DeploymentKind;
  title: string;
  description: string | null;
  url: string | null;
  screenshot_url: string | null;
  xp_awarded: number;
  // Signal Map fields (added by schema_signal_map.sql)
  impact_score: number;
  event_color: string | null;
  pulse_strength: number;
  created_at: string;
};

export type Ascension = {
  id: string;
  operator_id: string;
  from_rank: RankTier;
  to_rank: RankTier;
  at_xp: number;
  created_at: string;
};

export type DeploymentWithOperator = Deployment & {
  operator: Pick<Operator, "id" | "handle" | "display_name" | "avatar_url" | "rank">;
  project: Pick<Project, "id" | "slug" | "name"> | null;
};
