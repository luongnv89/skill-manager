import { access, realpath, stat } from "fs/promises";
import { constants as fsConstants } from "fs";
import { delimiter, resolve, sep } from "path";

export interface BinaryLocation {
  path: string;
  realPath: string;
}

export interface ShadowingReport {
  resolved: BinaryLocation | null;
  shadowed: BinaryLocation[];
}

const BINARY_NAME = "asm";

function getPathEntries(pathEnv: string | undefined): string[] {
  if (!pathEnv) return [];
  const seen = new Set<string>();
  const entries: string[] = [];
  for (const raw of pathEnv.split(delimiter)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const normalized = trimmed.endsWith(sep) ? trimmed.slice(0, -1) : trimmed;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    entries.push(normalized);
  }
  return entries;
}

async function isExecutableFile(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    if (!s.isFile()) return false;
  } catch {
    return false;
  }
  try {
    await access(path, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveReal(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return path;
  }
}

/**
 * Walk PATH and return every `asm` binary in order. The first entry is the one
 * shells resolve; later entries are shadowed. Binaries that resolve (via
 * realpath) to the same underlying file as an earlier entry are skipped so
 * benign symlink aliases (e.g. `/usr/local/bin/asm` -> `/opt/.../asm`) don't
 * look like a conflict.
 */
export async function detectAsmBinaries(
  pathEnv: string | undefined = process.env.PATH,
): Promise<BinaryLocation[]> {
  const seenReal = new Set<string>();
  const results: BinaryLocation[] = [];

  for (const dir of getPathEntries(pathEnv)) {
    const candidate = resolve(dir, BINARY_NAME);
    if (!(await isExecutableFile(candidate))) continue;
    const real = await resolveReal(candidate);
    if (seenReal.has(real)) continue;
    seenReal.add(real);
    results.push({ path: candidate, realPath: real });
  }

  return results;
}

export async function buildShadowingReport(
  pathEnv: string | undefined = process.env.PATH,
): Promise<ShadowingReport> {
  const binaries = await detectAsmBinaries(pathEnv);
  if (binaries.length === 0) {
    return { resolved: null, shadowed: [] };
  }
  const [resolved, ...shadowed] = binaries;
  return { resolved, shadowed };
}
