// Blockscout v2 API client (free, no key). Every failure degrades to { available: false }.
import type { ChainInfo } from "../chains.js";

export interface SourceFile {
  path: string;
  content: string;
}

export interface BlockscoutInfo {
  available: boolean;
  verified?: boolean;
  contractName?: string | null;
  compilerVersion?: string | null;
  language?: string | null;
  sourceAvailable?: boolean;
  creator?: string | null;
  creationTx?: string | null;
  proxyType?: string | null;
  implementations?: string[];
  reason?: string;
}

export interface BlockscoutLookup {
  remappings: string[];
  info: BlockscoutInfo;
  files: SourceFile[]; // not serialized into the report
}

const TIMEOUT_MS = 5_000;
const MAX_SOURCE_BYTES = 5_000_000;

async function getJson(url: string): Promise<{ status: number; body: any } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" } });
    if (res.status === 404) return { status: 404, body: null };
    if (!res.ok) return null;
    return { status: res.status, body: await res.json() };
  } catch {
    return null;
  }
}

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export async function lookupBlockscout(chain: ChainInfo, address: string): Promise<BlockscoutLookup> {
  const base = chain.blockscout;
  if (!base) return { info: { available: false, reason: "no Blockscout instance for this chain" }, files: [], remappings: [] };
  const [sc, addr] = await Promise.all([
    getJson(`${base}/api/v2/smart-contracts/${address}`),
    getJson(`${base}/api/v2/addresses/${address}`),
  ]);
  if (!sc && !addr) return { info: { available: false, reason: "blockscout unreachable or errored" }, files: [], remappings: [] };

  const c = sc?.body ?? null;
  const a = addr?.body ?? null;
  const files: SourceFile[] = [];
  if (c?.is_verified && typeof c.source_code === "string") {
    files.push({ path: str(c.file_path) ?? `${str(c.name) ?? "Contract"}.sol`, content: c.source_code });
    for (const s of Array.isArray(c.additional_sources) ? c.additional_sources : []) {
      if (typeof s?.file_path === "string" && typeof s?.source_code === "string") files.push({ path: s.file_path, content: s.source_code });
    }
  }
  const total = files.reduce((n, f) => n + f.content.length, 0);
  const usable = total > 0 && total <= MAX_SOURCE_BYTES;
  const remappings: string[] = Array.isArray(c?.compiler_settings?.remappings) ? c.compiler_settings.remappings.filter((r: unknown) => typeof r === "string") : [];

  const impls: string[] = [];
  for (const list of [c?.implementations, a?.implementations]) {
    for (const i of Array.isArray(list) ? list : []) {
      const h = str(i?.address_hash) ?? str(i?.address);
      if (h && !impls.includes(h)) impls.push(h);
    }
  }

  const info: BlockscoutInfo = {
    available: true,
    verified: Boolean(c?.is_verified ?? a?.is_verified),
    contractName: str(c?.name) ?? str(a?.name),
    compilerVersion: str(c?.compiler_version),
    language: str(c?.language),
    sourceAvailable: usable,
    creator: str(a?.creator_address_hash),
    creationTx: str(a?.creation_transaction_hash) ?? str(a?.creation_tx_hash),
    proxyType: str(c?.proxy_type) ?? str(a?.proxy_type),
    implementations: impls,
  };
  return { info, files: usable ? files : [], remappings };
}
