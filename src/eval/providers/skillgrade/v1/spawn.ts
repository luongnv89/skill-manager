/**
 * Spawner seam for the skillgrade provider.
 *
 * The skillgrade provider never shells out directly — it always goes through
 * a `Spawner` function. Tests inject a fake Spawner that returns recorded
 * fixture strings; production wires the default `bunSpawn` below.
 *
 * Why a seam (and not `jest.mock`-style module mocking)? Bun test's module
 * patching story is thin and brittle. A first-class function injection
 * point is explicit, zero-magic, and makes the mock obvious at the call
 * site of every test.
 *
 * Contract:
 *   - `argv[0]` is the binary name (looked up on PATH by `Bun.spawn`).
 *   - `opts.timeoutMs` enforces a hard deadline. On expiry, the process
 *     is killed with SIGTERM and the promise resolves with `exitCode: -1`
 *     and `timedOut: true` (no throw — consumers decide how to handle).
 *   - `stdout` / `stderr` are captured as UTF-8 strings.
 *   - `env` is merged onto `process.env`; callers may pass their own
 *     API keys without pulling in the entire environment.
 *   - Signal-based abort is supported via `opts.signal`.
 */

/**
 * Result of a spawn invocation.
 *
 * `timedOut` fires only when the provided timeout fired; `aborted` fires
 * only when the provided signal fired. Both are `false` on a clean exit,
 * regardless of `exitCode`.
 */
export interface SpawnResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  aborted: boolean;
}

/**
 * Options accepted by a `Spawner`.
 */
export interface SpawnOptions {
  /** Working directory for the spawned process. */
  cwd?: string;
  /** Hard timeout in milliseconds. Non-positive values disable the timer. */
  timeoutMs?: number;
  /** Environment overrides merged onto `process.env`. */
  env?: Record<string, string>;
  /** Cooperative abort signal — fires SIGTERM on the spawned process. */
  signal?: AbortSignal;
}

/**
 * Function signature every caller (provider, scaffold, version probe)
 * uses. Tests implement this directly; production uses `bunSpawn` below.
 */
export type Spawner = (
  argv: string[],
  opts?: SpawnOptions,
) => Promise<SpawnResult>;

/**
 * Read all chunks from a web-readable stream and concatenate them as UTF-8.
 *
 * Bun exposes stdout/stderr as `ReadableStream<Uint8Array>`. We drain
 * fully so tests never observe truncated output on short-lived children.
 */
async function drainStream(
  stream: ReadableStream<Uint8Array> | null,
): Promise<string> {
  if (!stream) return "";
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8").decode(out);
}

/**
 * Production Spawner with dual-runtime support.
 *
 * Kept thin: owns process lifecycle, timeout, signal plumbing, and
 * stream draining — nothing else. All skillgrade-specific framing
 * (argv construction, JSON parsing) lives in the provider/adapter.
 *
 * Runtime split:
 *   - Under **Bun**, we use `Bun.spawn` — native, handles shebang +
 *     exec-bit resolution on Unix directly, streams as web ReadableStream.
 *   - Under **Node.js**, we use `child_process.spawn` — required because
 *     `asm`'s bin has a `#!/usr/bin/env node` shebang, so `npm install
 *     -g agent-skill-manager` runs the CLI under Node. The bundled
 *     skillgrade.js has its own `#!/usr/bin/env node` shebang and is
 *     executable, so node can exec it the same way Bun does.
 *
 * The two branches share the `SpawnResult` contract exactly so every
 * caller (provider, scaffold, version probe) and every test (which
 * injects a fake `Spawner`) is runtime-agnostic.
 */
export const bunSpawn: Spawner = async (
  argv: string[],
  opts: SpawnOptions = {},
): Promise<SpawnResult> => {
  const env = { ...process.env, ...(opts.env ?? {}) } as Record<string, string>;
  const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
  return isBun ? spawnViaBun(argv, opts, env) : spawnViaNode(argv, opts, env);
};

/**
 * Bun branch. Uses `Bun.spawn` and reads its web-style ReadableStreams
 * via `drainStream`. Timeout + abort fire SIGTERM via `proc.kill`.
 */
async function spawnViaBun(
  argv: string[],
  opts: SpawnOptions,
  env: Record<string, string>,
): Promise<SpawnResult> {
  const proc = Bun.spawn(argv, {
    cwd: opts.cwd,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });

  let timedOut = false;
  let aborted = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  if (typeof opts.timeoutMs === "number" && opts.timeoutMs > 0) {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill("SIGTERM");
      } catch {
        /* already exited */
      }
    }, opts.timeoutMs);
  }
  const onAbort = () => {
    aborted = true;
    try {
      proc.kill("SIGTERM");
    } catch {
      /* already exited */
    }
  };
  if (opts.signal) {
    if (opts.signal.aborted) onAbort();
    else opts.signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      drainStream(proc.stdout as unknown as ReadableStream<Uint8Array> | null),
      drainStream(proc.stderr as unknown as ReadableStream<Uint8Array> | null),
      proc.exited,
    ]);
    return {
      exitCode: typeof exitCode === "number" ? exitCode : null,
      stdout,
      stderr,
      timedOut,
      aborted,
    };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    if (opts.signal) opts.signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Node branch. Uses `child_process.spawn`, which returns Node-style
 * Readable streams. We collect chunks per-stream and resolve on the
 * child's `close` event. Contract matches the Bun branch exactly.
 */
async function spawnViaNode(
  argv: string[],
  opts: SpawnOptions,
  env: Record<string, string>,
): Promise<SpawnResult> {
  const { spawn } = await import("child_process");
  const [cmd, ...args] = argv;
  if (!cmd) {
    return {
      exitCode: null,
      stdout: "",
      stderr: "empty argv",
      timedOut: false,
      aborted: false,
    };
  }

  const child = spawn(cmd, args, {
    cwd: opts.cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let timedOut = false;
  let aborted = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  if (typeof opts.timeoutMs === "number" && opts.timeoutMs > 0) {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch {
        /* already exited */
      }
    }, opts.timeoutMs);
  }
  const onAbort = () => {
    aborted = true;
    try {
      child.kill("SIGTERM");
    } catch {
      /* already exited */
    }
  };
  if (opts.signal) {
    if (opts.signal.aborted) onAbort();
    else opts.signal.addEventListener("abort", onAbort, { once: true });
  }

  const decoder = new TextDecoder("utf-8");
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (c: Buffer | string) => {
    stdout += typeof c === "string" ? c : decoder.decode(c, { stream: true });
  });
  child.stderr?.on("data", (c: Buffer | string) => {
    stderr += typeof c === "string" ? c : decoder.decode(c, { stream: true });
  });

  try {
    const result = await new Promise<SpawnResult>((resolve, reject) => {
      child.on("error", (err: Error) => reject(err));
      child.on("close", (code: number | null) => {
        // Flush any buffered bytes left in the decoder.
        stdout += decoder.decode();
        resolve({
          exitCode: code,
          stdout,
          stderr,
          timedOut,
          aborted,
        });
      });
    });
    return result;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    if (opts.signal) opts.signal.removeEventListener("abort", onAbort);
  }
}
