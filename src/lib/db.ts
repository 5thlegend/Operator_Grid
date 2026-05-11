// Minimal Supabase Database type — extend or generate via `supabase gen types typescript`.
import type { Operator, Project, Deployment, RankTier, DeploymentKind, ProjectStatus } from "@/lib/types";

export type Database = {
  public: {
    Tables: {
      operators: {
        Row: Operator;
        Insert: Partial<Operator> & Pick<Operator, "id" | "handle" | "display_name">;
        Update: Partial<Operator>;
      };
      projects: {
        Row: Project;
        Insert: Partial<Project> & Pick<Project, "operator_id" | "slug" | "name">;
        Update: Partial<Project>;
      };
      deployments: {
        Row: Deployment;
        Insert: Partial<Deployment> & Pick<Deployment, "operator_id" | "title">;
        Update: Partial<Deployment>;
      };
      xp_log: {
        Row: {
          id: string;
          operator_id: string;
          source_type: string;
          source_id: string | null;
          xp_delta: number;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          operator_id: string;
          source_type: string;
          source_id?: string | null;
          xp_delta: number;
          reason?: string | null;
        };
        Update: never;
      };
    };
    Enums: {
      rank_tier: RankTier;
      deployment_kind: DeploymentKind;
      project_status: ProjectStatus;
    };
  };
};
