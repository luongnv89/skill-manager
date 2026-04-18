/**
 * Tests for the Node branch of the production spawner.
 *
 * The Bun branch is exercised end-to-end by the integration tests under
 * `src/cli.test.ts` and the e2e suite. This file pins the invariants of
 * `spawnViaNode` that regressed in a prior iteration (shared TextDecoder
 * between stdout and stderr truncated multi-byte output).
 *
 * We shell out to the real `node` binary (present on every dev machine
 * and in CI) rather than mocking `child_process` so we exercise the
 * actual stream lifecycle, not a simulacrum.
 */

import { describe, expect, it } from "bun:test";
import { spawnViaNode } from "./spawn";

describe("spawnViaNode", () => {
  it("decodes multi-byte UTF-8 on stdout when split across chunks", async () => {
    // '€' is 3 bytes (E2 82 AC). Write ten of them as two chunks whose
    // split falls mid-codepoint (15 bytes + 15 bytes), then flush.
    const script = `
      const buf = Buffer.from('€'.repeat(10), 'utf8'); // 30 bytes
      process.stdout.write(buf.subarray(0, 15));
      process.stdout.write(buf.subarray(15));
    `;
    const res = await spawnViaNode(
      ["node", "-e", script],
      { timeoutMs: 10_000 },
      { ...process.env } as Record<string, string>,
    );
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe("€".repeat(10));
    expect(res.stderr).toBe("");
  });

  it("decodes multi-byte UTF-8 on stderr when split across chunks", async () => {
    const script = `
      const buf = Buffer.from('日本語'.repeat(4), 'utf8');
      // Split at an arbitrary byte count that falls mid-codepoint.
      const mid = Math.floor(buf.length / 2) - 1;
      process.stderr.write(buf.subarray(0, mid));
      process.stderr.write(buf.subarray(mid));
    `;
    const res = await spawnViaNode(
      ["node", "-e", script],
      { timeoutMs: 10_000 },
      { ...process.env } as Record<string, string>,
    );
    expect(res.exitCode).toBe(0);
    expect(res.stderr).toBe("日本語".repeat(4));
    expect(res.stdout).toBe("");
  });

  it("keeps stdout and stderr decoders independent (interleaved multi-byte)", async () => {
    // The regression: a shared decoder would leave bytes from one stream
    // buffered, then consume them as part of the other stream's next
    // chunk. Force interleaving of partial codepoints on both streams.
    const script = `
      const out = Buffer.from('€€€', 'utf8'); // 9 bytes
      const err = Buffer.from('★★★', 'utf8'); // 9 bytes (U+2605 = E2 98 85)
      process.stdout.write(out.subarray(0, 4));  // 1 full + 1 partial
      process.stderr.write(err.subarray(0, 4));  // 1 full + 1 partial
      process.stdout.write(out.subarray(4));
      process.stderr.write(err.subarray(4));
    `;
    const res = await spawnViaNode(
      ["node", "-e", script],
      { timeoutMs: 10_000 },
      { ...process.env } as Record<string, string>,
    );
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe("€€€");
    expect(res.stderr).toBe("★★★");
  });

  it("returns a non-zero exit code when the child exits non-zero", async () => {
    const res = await spawnViaNode(
      ["node", "-e", "process.exit(7)"],
      { timeoutMs: 10_000 },
      { ...process.env } as Record<string, string>,
    );
    expect(res.exitCode).toBe(7);
    expect(res.timedOut).toBe(false);
    expect(res.aborted).toBe(false);
  });

  it("reports timedOut=true and kills the child when timeoutMs fires", async () => {
    const res = await spawnViaNode(
      ["node", "-e", "setTimeout(() => {}, 10_000)"],
      { timeoutMs: 200 },
      { ...process.env } as Record<string, string>,
    );
    expect(res.timedOut).toBe(true);
    // SIGTERM on Unix → exit code null (terminated by signal).
    expect(res.exitCode === null || res.exitCode !== 0).toBe(true);
  });

  it("reports aborted=true when an AbortSignal fires", async () => {
    const controller = new AbortController();
    const resPromise = spawnViaNode(
      ["node", "-e", "setTimeout(() => {}, 10_000)"],
      { signal: controller.signal },
      { ...process.env } as Record<string, string>,
    );
    setTimeout(() => controller.abort(), 50);
    const res = await resPromise;
    expect(res.aborted).toBe(true);
  });

  it("returns early with 'empty argv' on empty argv", async () => {
    const res = await spawnViaNode([], {}, { ...process.env } as Record<
      string,
      string
    >);
    expect(res.exitCode).toBeNull();
    expect(res.stderr).toBe("empty argv");
  });
});
