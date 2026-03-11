import {
  BoxRenderable,
  TextRenderable,
  TabSelectRenderable,
  TabSelectRenderableEvents,
  TextareaRenderable,
  ASCIIFontRenderable,
} from "@opentui/core";
import type { RenderContext } from "@opentui/core";
import { theme } from "../utils/colors";
import type { SkillInfo, Scope, SortBy, AppConfig } from "../utils/types";

const SORT_OPTIONS: SortBy[] = ["name", "version", "location"];

export interface DashboardComponents {
  root: BoxRenderable;
  banner: ASCIIFontRenderable;
  scopeTabs: TabSelectRenderable;
  searchInput: TextareaRenderable;
  statsBar: BoxRenderable;
  contentArea: BoxRenderable;
  footerText: TextRenderable;
  updateStats: (skills: SkillInfo[]) => void;
  updateSortLabel: (by: SortBy) => void;
  updateProviderInfo: (config: AppConfig) => void;
}

function buildScopeDescription(
  config: AppConfig,
  type: "global" | "project",
): string {
  const labels = config.providers.filter((p) => p.enabled).map((p) => p.label);
  if (labels.length <= 3) return labels.join(", ");
  return labels.slice(0, 2).join(", ") + ` +${labels.length - 2}`;
}

export function createDashboard(
  ctx: RenderContext,
  config: AppConfig,
  onScopeChange: (scope: Scope) => void,
): DashboardComponents {
  // Root layout
  const root = new BoxRenderable(ctx, {
    id: "dashboard-root",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    padding: 1,
    gap: 0,
  });

  // ASCII banner
  const banner = new ASCIIFontRenderable(ctx, {
    id: "banner",
    text: "agent-skill-manager",
    color: theme.accent,
  });
  root.add(banner);

  // Stats bar (moved to top, right after banner)
  const statsBar = new BoxRenderable(ctx, {
    id: "stats-bar",
    border: true,
    borderStyle: "rounded",
    borderColor: theme.border,
    title: " Stats ",
    titleAlignment: "left",
    flexDirection: "row",
    width: "100%",
    height: 3,
    paddingLeft: 1,
    paddingRight: 1,
    gap: 3,
  });

  const totalStat = new TextRenderable(ctx, {
    id: "stat-total",
    content: "Total: 0",
    fg: theme.fg,
  });
  const globalStat = new TextRenderable(ctx, {
    id: "stat-global",
    content: "Global: 0",
    fg: theme.cyan,
  });
  const projectStat = new TextRenderable(ctx, {
    id: "stat-project",
    content: "Project: 0",
    fg: theme.green,
  });
  const symlinkStat = new TextRenderable(ctx, {
    id: "stat-symlinks",
    content: "Symlinks: 0",
    fg: theme.yellow,
  });
  const providerStat = new TextRenderable(ctx, {
    id: "stat-providers",
    content: "Providers: 0",
    fg: theme.accentAlt,
  });

  // Sort info with separator
  const sortSeparator = new TextRenderable(ctx, {
    id: "sort-sep",
    content: "\u2502",
    fg: theme.border,
  });
  const sortLabel = new TextRenderable(ctx, {
    id: "sort-label",
    content: buildSortLabel("name"),
    fg: theme.fgDim,
  });

  statsBar.add(totalStat);
  statsBar.add(globalStat);
  statsBar.add(projectStat);
  statsBar.add(symlinkStat);
  statsBar.add(providerStat);
  statsBar.add(sortSeparator);
  statsBar.add(sortLabel);
  root.add(statsBar);

  // Scope tabs row
  const tabRow = new BoxRenderable(ctx, {
    id: "tab-row",
    flexDirection: "row",
    width: "100%",
    height: 1,
    alignItems: "center",
    gap: 2,
  });

  const globalDesc = buildScopeDescription(config, "global");
  const projectDesc = buildScopeDescription(config, "project");

  const scopeTabs = new TabSelectRenderable(ctx, {
    id: "scope-tabs",
    options: [
      { name: "Global", description: globalDesc, value: "global" },
      { name: "Project", description: projectDesc, value: "project" },
      { name: "Both", description: "All locations", value: "both" },
    ],
    tabWidth: 12,
    showUnderline: false,
    wrapSelection: true,
    height: 1,
    width: 42,
  });

  (scopeTabs as any).on(
    TabSelectRenderableEvents.ITEM_SELECTED,
    (_index: number, option: any) => {
      onScopeChange(option.value as Scope);
    },
  );

  tabRow.add(scopeTabs);
  root.add(tabRow);

  // Search box
  const searchBox = new BoxRenderable(ctx, {
    id: "search-box",
    border: true,
    borderStyle: "rounded",
    borderColor: theme.border,
    title: " Filter ",
    titleAlignment: "left",
    width: "100%",
    height: 3,
  });

  const searchInput = new TextareaRenderable(ctx, {
    id: "search-input",
    width: "100%",
    height: 1,
    placeholder: "type to search...",
    placeholderColor: theme.fgDim,
  });

  searchBox.add(searchInput);
  root.add(searchBox);

  // Content area (skill list gets inserted here)
  const contentArea = new BoxRenderable(ctx, {
    id: "content-area",
    flexDirection: "column",
    width: "100%",
    flexGrow: 1,
    minHeight: 6,
  });
  root.add(contentArea);

  // Footer
  const footerText = new TextRenderable(ctx, {
    id: "footer",
    content:
      "  \u2191/\u2193 Navigate  Enter View  d Uninstall  / Filter  Tab Scope  s Sort  r Refresh  c Config  q Quit  ? Help",
    fg: theme.fgDim,
    height: 1,
    width: "100%",
  });
  root.add(footerText);

  function buildSortLabel(by: SortBy): string {
    return (
      "(s) Sort: " +
      SORT_OPTIONS.map((o) => (o === by ? `[${o}]` : o)).join("  ")
    );
  }

  function updateStats(skills: SkillInfo[]) {
    const total = skills.length;
    const unique = new Set(skills.map((s) => s.dirName)).size;
    const globalCount = skills.filter((s) => s.scope === "global").length;
    const projectCount = skills.filter((s) => s.scope === "project").length;
    const symlinks = skills.filter((s) => s.isSymlink).length;
    const providers = new Set(skills.map((s) => s.provider)).size;

    totalStat.content = `Total: ${total} (${unique} unique)`;
    globalStat.content = `Global: ${globalCount}`;
    projectStat.content = `Project: ${projectCount}`;
    symlinkStat.content = `Symlinks: ${symlinks}`;
    providerStat.content = `Providers: ${providers}`;
  }

  function updateSortLabel(by: SortBy) {
    sortLabel.content = buildSortLabel(by);
  }

  function updateProviderInfo(newConfig: AppConfig) {
    const newGlobalDesc = buildScopeDescription(newConfig, "global");
    const newProjectDesc = buildScopeDescription(newConfig, "project");
    scopeTabs.options = [
      { name: "Global", description: newGlobalDesc, value: "global" },
      { name: "Project", description: newProjectDesc, value: "project" },
      { name: "Both", description: "All locations", value: "both" },
    ];
  }

  return {
    root,
    banner,
    scopeTabs,
    searchInput,
    statsBar,
    contentArea,
    footerText,
    updateStats,
    updateSortLabel,
    updateProviderInfo,
  };
}
