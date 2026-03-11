import {
  BoxRenderable,
  TextRenderable,
  SelectRenderable,
  SelectRenderableEvents,
} from "@opentui/core";
import type { RenderContext } from "@opentui/core";
import { theme } from "../utils/colors";
import { getConfigPath } from "../config";
import type { AppConfig } from "../utils/types";

function providerRow(
  label: string,
  globalPath: string,
  projectPath: string,
  enabled: boolean,
): string {
  const status = enabled ? "\u2714 ON " : "\u2718 OFF";
  const statusColor = enabled ? "on" : "off";
  const name = label.length > 14 ? label.slice(0, 14) : label;
  return `${status}  ${name.padEnd(15)} ${globalPath}`;
}

export function createConfigView(
  ctx: RenderContext,
  config: AppConfig,
  onClose: (updatedConfig: AppConfig) => void,
): BoxRenderable {
  const boxWidth = 72;
  const providerCount = config.providers.length;
  const boxHeight = Math.min(providerCount + 14, 30);
  const top = Math.max(0, Math.floor((ctx.height - boxHeight) / 2));
  const left = Math.max(0, Math.floor((ctx.width - boxWidth) / 2));

  // Clone config so mutations don't affect original until close
  const editConfig: AppConfig = JSON.parse(JSON.stringify(config));

  const container = new BoxRenderable(ctx, {
    id: "config-overlay",
    border: true,
    borderStyle: "rounded",
    borderColor: theme.accent,
    backgroundColor: theme.bgAlt,
    title: " Configuration ",
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

  // Config file path
  const pathText = new TextRenderable(ctx, {
    id: "config-path",
    content: `Config: ${getConfigPath()}`,
    fg: theme.fgDim,
  });
  container.add(pathText);

  // Section header
  const headerText = new TextRenderable(ctx, {
    id: "config-header",
    content: "Providers (Enter to toggle, e to edit config file):",
    fg: theme.yellow,
  });
  container.add(headerText);

  // Build provider options
  function buildProviderOptions() {
    return editConfig.providers.map((p) => ({
      name: providerRow(p.label, p.global, p.project, p.enabled),
      description: `Project: ${p.project}`,
      value: p.name,
    }));
  }

  const select = new SelectRenderable(ctx, {
    id: "config-select",
    width: "100%",
    flexGrow: 1,
    options: buildProviderOptions(),
    wrapSelection: true,
    showDescription: true,
    showScrollIndicator: true,
  });

  (select as any).on(SelectRenderableEvents.ITEM_SELECTED, (index: number) => {
    // Toggle enabled state on Enter
    if (index >= 0 && index < editConfig.providers.length) {
      editConfig.providers[index].enabled =
        !editConfig.providers[index].enabled;
      select.options = buildProviderOptions();
    }
  });

  container.add(select);

  // Custom paths section
  if (editConfig.customPaths.length > 0) {
    const customHeader = new TextRenderable(ctx, {
      id: "config-custom-header",
      content: "\nCustom Paths:",
      fg: theme.yellow,
    });
    container.add(customHeader);

    for (let i = 0; i < editConfig.customPaths.length; i++) {
      const cp = editConfig.customPaths[i];
      const cpText = new TextRenderable(ctx, {
        id: `config-custom-${i}`,
        content: `  ${cp.label}: ${cp.path} (${cp.scope})`,
        fg: theme.fg,
      });
      container.add(cpText);
    }
  }

  // Preferences
  const prefText = new TextRenderable(ctx, {
    id: "config-prefs",
    content: `\nDefaults: scope=${editConfig.preferences.defaultScope}, sort=${editConfig.preferences.defaultSort}`,
    fg: theme.fgDim,
  });
  container.add(prefText);

  // Footer
  const footer = new TextRenderable(ctx, {
    id: "config-footer",
    content: "  Enter Toggle  e Edit file  Esc Save & close",
    fg: theme.fgDim,
  });
  container.add(footer);

  // Expose select for keyboard handling and store onClose callback
  (container as any).__configSelect = select;
  (container as any).__editConfig = editConfig;
  (container as any).__onClose = onClose;

  select.focus();

  return container;
}
