// ─── Skill Types ────────────────────────────────────────────────────────────

export interface SkillInfo {
  name: string;
  version: string;
  description: string;
  dirName: string;
  path: string;
  originalPath: string;
  location: string;
  scope: "global" | "project";
  provider: string;
  providerLabel: string;
  isSymlink: boolean;
  symlinkTarget: string | null;
  fileCount: number;
}

export interface RemovalPlan {
  directories: Array<{ path: string; isSymlink: boolean }>;
  ruleFiles: string[];
  agentsBlocks: Array<{ file: string; skillName: string }>;
}

// ─── Audit Types ──────────────────────────────────────────────────────────

export interface DuplicateGroup {
  key: string;
  reason: "same-dirName" | "same-frontmatterName";
  instances: SkillInfo[];
}

export interface AuditReport {
  scannedAt: string;
  totalSkills: number;
  duplicateGroups: DuplicateGroup[];
  totalDuplicateInstances: number;
}

// ─── Config Types ───────────────────────────────────────────────────────────

export interface ProviderConfig {
  name: string;
  label: string;
  global: string;
  project: string;
  enabled: boolean;
}

export interface CustomPathConfig {
  path: string;
  label: string;
  scope: "global" | "project";
}

export interface UserPreferences {
  defaultScope: Scope;
  defaultSort: SortBy;
}

export interface AppConfig {
  version: number;
  providers: ProviderConfig[];
  customPaths: CustomPathConfig[];
  preferences: UserPreferences;
}

// ─── UI Types ───────────────────────────────────────────────────────────────

export type Scope = "global" | "project" | "both";
export type SortBy = "name" | "version" | "location";
export type ViewState =
  | "dashboard"
  | "detail"
  | "confirm"
  | "help"
  | "config"
  | "audit";
