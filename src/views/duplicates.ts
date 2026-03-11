import {
  BoxRenderable,
  TextRenderable,
  SelectRenderable,
  SelectRenderableEvents,
} from "@opentui/core";
import type { RenderContext } from "@opentui/core";
import { theme } from "../utils/colors";
import { sortInstancesForKeep, reasonLabel } from "../auditor";
import type { AuditReport, DuplicateGroup, SkillInfo } from "../utils/types";

export function createDuplicatesOverlay(
  ctx: RenderContext,
  report: AuditReport,
  onRemove: (toRemove: SkillInfo[]) => Promise<void>,
  onClose: () => void,
): BoxRenderable {
  const boxWidth = 72;
  const boxHeight = Math.min(
    Math.max(report.duplicateGroups.length + 8, 12),
    ctx.height - 4,
  );
  const top = Math.max(0, Math.floor((ctx.height - boxHeight) / 2));
  const left = Math.max(0, Math.floor((ctx.width - boxWidth) / 2));

  const container = new BoxRenderable(ctx, {
    id: "duplicates-overlay",
    border: true,
    borderStyle: "rounded",
    borderColor: theme.yellow,
    backgroundColor: theme.bgAlt,
    title: ` Audit: Duplicates (${report.duplicateGroups.length} groups) `,
    titleAlignment: "center",
    padding: 1,
    flexDirection: "column",
    gap: 1,
    width: boxWidth,
    height: boxHeight,
    position: "absolute",
    top,
    left,
    zIndex: 100,
  });

  // Track which phase we're in for keyboard handling
  let currentPhase: "groups" | "instances" = "groups";
  let currentGroupIndex = -1;
  const markedForRemoval = new Set<string>();

  // Reusable content IDs
  const HINT_ID = "dup-hint";
  const SELECT_ID = "dup-select";
  const FOOTER_ID = "dup-footer";

  function clearContent() {
    // Remove dynamic children by known IDs
    try {
      container.remove(HINT_ID);
    } catch {}
    try {
      container.remove(SELECT_ID);
    } catch {}
    try {
      container.remove(FOOTER_ID);
    } catch {}
  }

  // ── Phase 1: Group List ──────────────────────────────────────────────────

  function showGroupList() {
    clearContent();
    currentPhase = "groups";
    currentGroupIndex = -1;
    markedForRemoval.clear();

    if (report.duplicateGroups.length === 0) {
      const noGroups = new TextRenderable(ctx, {
        id: HINT_ID,
        content: "No duplicates found.",
        fg: theme.green,
      });
      container.add(noGroups);

      const footer = new TextRenderable(ctx, {
        id: FOOTER_ID,
        content: "  Esc Close",
        fg: theme.fgDim,
      });
      container.add(footer);
      return;
    }

    const hint = new TextRenderable(ctx, {
      id: HINT_ID,
      content: "Select a group to inspect and manage instances:",
      fg: theme.fgDim,
    });
    container.add(hint);

    const options = report.duplicateGroups.map((g) => {
      const locations = g.instances.map((s) => s.location).join(", ");
      return {
        name: `[${reasonLabel(g.reason)}] ${g.key}  (${g.instances.length} copies: ${locations})`,
        description: "",
        value: g.key,
      };
    });

    const select = new SelectRenderable(ctx, {
      id: SELECT_ID,
      width: "100%" as any,
      flexGrow: 1,
      options,
      wrapSelection: true,
      showScrollIndicator: true,
    });

    (select as any).on(
      SelectRenderableEvents.ITEM_SELECTED,
      (index: number) => {
        if (report.duplicateGroups[index]) {
          currentGroupIndex = index;
          showInstancePicker(report.duplicateGroups[index]);
        }
      },
    );

    container.add(select);

    const footer = new TextRenderable(ctx, {
      id: FOOTER_ID,
      content: "  Enter Inspect group  Esc Close",
      fg: theme.fgDim,
    });
    container.add(footer);

    select.focus();
  }

  // ── Phase 2: Instance Picker ─────────────────────────────────────────────

  function showInstancePicker(group: DuplicateGroup) {
    clearContent();
    currentPhase = "instances";
    markedForRemoval.clear();

    const sorted = sortInstancesForKeep(group.instances);

    // Pre-mark all but the first (recommended keep) for removal
    for (let i = 1; i < sorted.length; i++) {
      markedForRemoval.add(sorted[i].path);
    }

    const hint = new TextRenderable(ctx, {
      id: HINT_ID,
      content: `Group: "${group.key}" (${reasonLabel(group.reason)}) - Toggle instances to remove:`,
      fg: theme.yellow,
    });
    container.add(hint);

    function buildOptions() {
      const opts = sorted.map((s, i) => {
        const checked = markedForRemoval.has(s.path) ? "[x]" : "[ ]";
        const keepHint =
          i === 0 && !markedForRemoval.has(s.path) ? " (keep)" : "";
        return {
          name: `${checked} ${s.providerLabel}/${s.scope} - ${s.path}${keepHint}`,
          description: "",
          value: s.path,
        };
      });
      // Add action option
      const markedCount = markedForRemoval.size;
      opts.push({
        name:
          markedCount > 0
            ? `  >>> Remove ${markedCount} marked instance(s) <<<`
            : "  (no instances marked for removal)",
        description: "",
        value: "__remove__",
      });
      return opts;
    }

    const select = new SelectRenderable(ctx, {
      id: SELECT_ID,
      width: "100%" as any,
      flexGrow: 1,
      options: buildOptions(),
      wrapSelection: true,
      showScrollIndicator: true,
    });

    let busy = false;
    (select as any).on(
      SelectRenderableEvents.ITEM_SELECTED,
      async (index: number) => {
        if (busy) return;
        busy = true;
        try {
          if (index < sorted.length) {
            // Toggle checkbox
            const skillPath = sorted[index].path;

            if (markedForRemoval.has(skillPath)) {
              markedForRemoval.delete(skillPath);
            } else {
              // Guard: don't allow marking ALL instances
              if (markedForRemoval.size >= sorted.length - 1) {
                return;
              }
              markedForRemoval.add(skillPath);
            }

            // Rebuild options to reflect new state
            const selectedIdx = select.getSelectedIndex();
            select.options = buildOptions();
            // Restore cursor position
            try {
              (select as any).setSelectedIndex(selectedIdx);
            } catch {}
          } else {
            // "Remove" action
            if (markedForRemoval.size === 0) return;

            const toRemove = sorted.filter((s) => markedForRemoval.has(s.path));
            await onRemove(toRemove);
          }
        } finally {
          busy = false;
        }
      },
    );

    container.add(select);

    const footer = new TextRenderable(ctx, {
      id: FOOTER_ID,
      content: "  Enter Toggle/Remove  Esc Back to groups",
      fg: theme.fgDim,
    });
    container.add(footer);

    select.focus();
  }

  // ── Expose phase state for keyboard handling in index.ts ─────────────────

  (container as any).__getCurrentPhase = () => currentPhase;
  (container as any).__backToGroups = () => showGroupList();
  (container as any).__onClose = onClose;

  // Initialize with group list
  showGroupList();

  return container;
}
