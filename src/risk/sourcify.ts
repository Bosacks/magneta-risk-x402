// Sourcify fallback (free, no key) for verified sources when Blockscout is unreachable or has no verification.
import type { ChainInfo } from "../chains.js";
import type { SourceFile } from "./blockscout.js";

export interface SourcifyInfo {
  available: boolean;
  verified: boolean;
  match?: string | null; // "exact_match" | "match"
  contractName?: string | null;
  compilerVersion?: string | null;
  language?: string | null;
  reason?: string;
}

export interface SourcifyLookup {
  info: SourcifyInfo;
  files: SourceFile[];
  remappings: string[];
}

const TIMEOUT_MS = 5_000;
const MAX_SOURCE_BYTES = 5_000_000;

export async function lookupSourcify(chain: ChainInfo, address: string): Promise<SourcifyLookup> {
  try {
    const url = `https://sourcify.dev/server/v2/contract/${chain.id}/${address}?fields=sources,compilation`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" } });
    if (res.status === 404) return { info: { available: true, verified: false }, files: [], remappings: [] };
    if (!res.ok) return { info: { available: false, verified: false, reason: `sourcify HTTP ${res.status}` }, files: [], remappings: [] };
    const body: any = await res.json();
    const files: SourceFile[] = Object.entries(body?.sources ?? {})
      .filter(([, v]: [string, any]) => typeof v?.content === "string")
      .map(([path, v]: [string, any]) => ({ path, content: v.content as string }));
    const total = files.reduce((n, f) => n + f.content.length, 0);
    const comp = body?.compilation ?? {};
    return {
      info: {
        available: true,
        verified: Boolean(body?.match),
        match: typeof body?.match === "string" ? body.match : null,
        contractName: typeof comp.name === "string" ? comp.name : null,
        compilerVersion: typeof comp.compilerVersion === "string" ? comp.compilerVersion : null,
        language: typeof comp.language === "string" ? comp.language : null,
      },
      files: total > 0 && total <= MAX_SOURCE_BYTES ? files : [],
      remappings: Array.isArray(comp?.compilerSettings?.remappings) ? comp.compilerSettings.remappings.filter((r: unknown) => typeof r === "string") : [],
    };
  } catch {
    return { info: { available: false, verified: false, reason: "sourcify unreachable" }, files: [], remappings: [] };
  }
}
