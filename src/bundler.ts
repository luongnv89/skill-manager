import { readFile, writeFile, readdir, access, mkdir } from "fs/promises";
import { join, resolve, basename } from "path";
import { homedir } from "os";
import { debug } from "./logger";
import type {
  BundleManifest,
  BundleSkillRef,
  BundleValidation,
  SkillInfo,
} from "./utils/types";

// ─── Constants ─────────────────────────────────────────────────────────────

const BUNDLE_DIR = join(homedir(), ".config", "agent-skill-manager", "bundles");

// ─── Validation ────────────────────────────────────────────────────────────

export function validateBundle(data: unknown): BundleValidation {
  const errors: string[] = [];

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { valid: false, errors: ["Bundle must be a JSON object."] };
  }

  const obj = data as Record<string, unknown>;

  if (obj.version !== 1) {
    errors.push(
      `Unsupported bundle version: ${JSON.stringify(obj.version)}. Expected 1.`,
    );
  }

  if (typeof obj.name !== "string" || !obj.name) {
    errors.push("Missing or empty 'name' field.");
  }

  if (typeof obj.description !== "string") {
    errors.push("Missing 'description' field.");
  }

  if (typeof obj.author !== "string") {
    errors.push("Missing 'author' field.");
  }

  if (typeof obj.createdAt !== "string") {
    errors.push("Missing or invalid 'createdAt' field.");
  }

  if (!Array.isArray(obj.skills)) {
    errors.push("Missing or invalid 'skills' array.");
    return { valid: false, errors };
  }

  if (obj.skills.length === 0) {
    errors.push("Bundle must contain at least one skill.");
  }

  for (let i = 0; i < obj.skills.length; i++) {
    const skill = obj.skills[i];
    if (typeof skill !== "object" || skill === null) {
      errors.push(`skills[${i}]: must be an object.`);
      continue;
    }
    const s = skill as Record<string, unknown>;
    if (typeof s.name !== "string" || !s.name) {
      errors.push(`skills[${i}]: missing or empty 'name'.`);
    }
    if (typeof s.installUrl !== "string" || !s.installUrl) {
      errors.push(`skills[${i}]: missing or empty 'installUrl'.`);
    }
  }

  if (obj.tags !== undefined && !Array.isArray(obj.tags)) {
    errors.push("'tags' must be an array of strings if provided.");
  }

  return { valid: errors.length === 0, errors };
}

// ─── Build Bundle ──────────────────────────────────────────────────────────

export function buildBundle(
  name: string,
  description: string,
  author: string,
  skills: BundleSkillRef[],
  tags?: string[],
): BundleManifest {
  return {
    version: 1,
    name,
    description,
    author,
    createdAt: new Date().toISOString(),
    skills,
    tags,
  };
}

/**
 * Build bundle skill refs from installed SkillInfo entries.
 * Uses lock file data or constructs install URLs from provider/path info.
 */
export function skillInfoToRef(skill: SkillInfo): BundleSkillRef {
  // Try to construct an install URL from provider info
  const installUrl =
    skill.isSymlink && skill.symlinkTarget ? skill.symlinkTarget : skill.path;

  return {
    name: skill.name,
    installUrl,
    description: skill.description || undefined,
    version: skill.version || undefined,
  };
}

// ─── Bundle Storage ────────────────────────────────────────────────────────

export function getBundleDir(): string {
  return BUNDLE_DIR;
}

export async function ensureBundleDir(): Promise<void> {
  await mkdir(BUNDLE_DIR, { recursive: true });
}

function sanitizeBundleName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function saveBundle(bundle: BundleManifest): Promise<string> {
  await ensureBundleDir();
  const filename = `${sanitizeBundleName(bundle.name)}.json`;
  const filePath = join(BUNDLE_DIR, filename);
  await writeFile(filePath, JSON.stringify(bundle, null, 2) + "\n", "utf-8");
  debug(`bundle: saved to ${filePath}`);
  return filePath;
}

export async function readBundleFile(
  filePath: string,
): Promise<BundleManifest> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      throw new Error(`Bundle file not found: ${filePath}`);
    }
    throw new Error(`Failed to read bundle file: ${err.message}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Bundle file is not valid JSON.");
  }

  const validation = validateBundle(data);
  if (!validation.valid) {
    throw new Error(`Invalid bundle:\n  ${validation.errors.join("\n  ")}`);
  }

  return data as BundleManifest;
}

/**
 * Load a bundle by name (looks in the bundles directory) or by file path.
 */
export async function loadBundle(nameOrPath: string): Promise<BundleManifest> {
  // If it looks like a file path (has extension or path separator), read directly
  if (
    nameOrPath.includes("/") ||
    nameOrPath.includes("\\") ||
    nameOrPath.endsWith(".json")
  ) {
    const absPath = resolve(nameOrPath);
    return readBundleFile(absPath);
  }

  // Otherwise, look in the bundles directory
  const filename = `${sanitizeBundleName(nameOrPath)}.json`;
  const filePath = join(BUNDLE_DIR, filename);
  return readBundleFile(filePath);
}

/**
 * List all saved bundles from the bundles directory.
 */
export async function listBundles(): Promise<BundleManifest[]> {
  const bundles: BundleManifest[] = [];

  try {
    await access(BUNDLE_DIR);
  } catch {
    return bundles;
  }

  let entries: string[];
  try {
    entries = await readdir(BUNDLE_DIR);
  } catch {
    return bundles;
  }

  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const filePath = join(BUNDLE_DIR, entry);
    try {
      const bundle = await readBundleFile(filePath);
      bundles.push(bundle);
    } catch {
      debug(`bundle: skipping invalid file ${filePath}`);
    }
  }

  bundles.sort((a, b) => a.name.localeCompare(b.name));
  return bundles;
}

/**
 * Remove a saved bundle by name.
 */
export async function removeBundle(name: string): Promise<boolean> {
  const { rm: rmFile } = await import("fs/promises");
  const filename = `${sanitizeBundleName(name)}.json`;
  const filePath = join(BUNDLE_DIR, filename);

  try {
    await access(filePath);
    await rmFile(filePath);
    debug(`bundle: removed ${filePath}`);
    return true;
  } catch {
    return false;
  }
}
