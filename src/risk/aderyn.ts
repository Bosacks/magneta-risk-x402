// Runs the aderyn static analyzer (Rust, local binary) over verified sources fetched from Blockscout.
// Never throws: any problem becomes { ran: false, reason }.
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { SourceFile } from "./blockscout.js";

const run = promisify(execFile);

export interface AderynFinding {
  title: string;
  severity: "high" | "low";
  instances: number;
}

export type AderynResult =
  | { ran: true; version?: string; counts: { high: number; low: number }; top: AderynFinding[] }
  | { ran: false; reason: string };

/** Maps a Blockscout file path to a safe relative path inside the temp dir (no absolute paths, no "..", no NULs). */
export function safeRelPath(p: string): string {
  const segs = p.replace(/\\/g, "/").replace(/\0/g, "").split("/").filter((s) => s !== "" && s !== "." && s !== "..");
  return segs.join("/") || "Contract.sol";
}

/** Parses an aderyn JSON report into severity counts (by instance) and the top findings. */
export function parseAderynReport(json: any): { counts: { high: number; low: number }; top: AderynFinding[] } {
  const findings: AderynFinding[] = [];
  for (const [key, severity] of [["high_issues", "high"], ["low_issues", "low"]] as const) {
    for (const issue of Array.isArray(json?.[key]?.issues) ? json[key].issues : []) {
      findings.push({ title: String(issue.title ?? issue.detector_name ?? "unknown"), severity, instances: Array.isArray(issue.instances) ? issue.instances.length : 0 });
    }
  }
  // "counts" are the number of distinct findings (detectors that fired) per severity.
  const counts = { high: findings.filter((f) => f.severity === "high").length, low: findings.filter((f) => f.severity === "low").length };
  findings.sort((a, b) => (a.severity === b.severity ? b.instances - a.instances : a.severity === "high" ? -1 : 1));
  return { counts, top: findings.slice(0, 10) };
}

/** Keeps only well-formed `prefix=target` remappings with safe relative paths (no absolute paths, no ".."). */
export function sanitizeRemappings(remappings: readonly string[]): string[] {
  const ok = /^[A-Za-z0-9_@./-]+=[A-Za-z0-9_@./-]*$/;
  return remappings.filter((r) => ok.test(r) && !r.includes("..") && !r.split("=")[1].startsWith("/"));
}

/** Flattened sources often repeat the SPDX line per original file; solc refuses that. Keep the first, neutralise the rest. */
export function dedupeSpdx(content: string): string {
  let seen = false;
  return content.replace(/^(\s*\/\/\s*SPDX-License-Identifier:.*)$/gm, (line) => {
    if (seen) return line.replace("SPDX-License-Identifier:", "SPDX-License-Identifier-duplicate:");
    seen = true;
    return line;
  });
}

export async function runAderyn(files: SourceFile[], timeoutMs: number, remappings: readonly string[] = []): Promise<AderynResult> {
  const bin = process.env.ADERYN_BIN || "/home/dominique/bin/aderyn";
  if (files.length === 0) return { ran: false, reason: "no verified source available" };
  if (timeoutMs < 3_000) return { ran: false, reason: "not enough time budget left" };
  let dir: string | undefined;
  try {
    dir = await mkdtemp(path.join(tmpdir(), "magneta-risk-"));
    const root = path.join(dir, "src-root");
    for (const f of files) {
      const rel = safeRelPath(f.path);
      const full = path.join(root, rel);
      if (!full.startsWith(root + path.sep)) continue; // belt and braces
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, dedupeSpdx(f.content));
    }
    const remaps = sanitizeRemappings(remappings);
    if (remaps.length > 0) await writeFile(path.join(root, "remappings.txt"), remaps.join("\n") + "\n"); // aderyn honours foundry-style remappings
    const out = path.join(dir, "report.json");
    await run(bin, [root, "--output", out], { timeout: timeoutMs, cwd: dir, maxBuffer: 4_000_000, killSignal: "SIGKILL" });
    const parsed = parseAderynReport(JSON.parse(await readFile(out, "utf8")));
    return { ran: true, version: "0.6.8", ...parsed };
  } catch (e: any) {
    const reason = e?.code === "ENOENT" ? `aderyn binary not found at ${bin}` : e?.killed ? "aderyn timed out" : `aderyn failed: ${String(e?.message ?? e).split("\n")[0].slice(0, 200)}`;
    return { ran: false, reason };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
