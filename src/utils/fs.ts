import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";

export const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".bmp",
  ".webp",
  ".mp3",
  ".mp4",
  ".wav",
  ".avi",
  ".mov",
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".7z",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".pdf",
  ".doc",
  ".docx",
]);

export const MAX_FILE_SIZE = 512 * 1024; // 512KB

export interface FileContent {
  relPath: string;
  content: string;
  lineCount: number;
}

export async function readFilesRecursive(dir: string): Promise<FileContent[]> {
  const results: FileContent[] = [];

  async function walk(currentDir: string, prefix: string) {
    let entries: string[];
    try {
      entries = await readdir(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry === ".git" || entry === "node_modules") continue;

      const fullPath = join(currentDir, entry);
      const relPath = prefix ? `${prefix}/${entry}` : entry;

      try {
        const s = await stat(fullPath);
        if (s.isDirectory()) {
          await walk(fullPath, relPath);
        } else if (s.isFile()) {
          const ext = entry.includes(".")
            ? `.${entry.split(".").pop()!.toLowerCase()}`
            : "";
          if (BINARY_EXTENSIONS.has(ext)) continue;
          if (s.size > MAX_FILE_SIZE) continue;

          try {
            const content = await readFile(fullPath, "utf-8");
            results.push({
              relPath,
              content,
              lineCount: content.split("\n").length,
            });
          } catch {
            // skip unreadable
          }
        }
      } catch {
        continue;
      }
    }
  }

  await walk(dir, "");
  return results;
}
