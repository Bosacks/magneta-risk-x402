// analyzeContract: the single entry point behind both paid surfaces (HTTP route and MCP tool).
// Deterministic, public data only (RPC + Blockscout + local aderyn). No LLM, no API keys.
import { createPublicClient, getAddress, http, parseAbi, zeroAddress, type Address, type PublicClient } from "viem";
import { getChain, rpcUrl, type ChainInfo } from "../chains.js";
import { runAderyn, type AderynResult } from "./aderyn.js";
import { lookupBlockscout, type BlockscoutInfo, type SourceFile } from "./blockscout.js";
import { lookupSourcify, type SourcifyInfo } from "./sourcify.js";
import { scanBytecode } from "./opcodes.js";
import { computeScore, type RiskLevel } from "./score.js";
import { matchSelectors } from "./selectors.js";

export const TOTAL_BUDGET_MS = 25_000;
const HARD_DEADLINE_MS = 24_000;
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 500;

const SLOT_IMPL_1967 = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const SLOT_ADMIN_1967 = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
const SLOT_BEACON_1967 = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
const SLOT_IMPL_ZEPPELINOS = "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3";
const SLOT_PROXIABLE_1822 = "0xc5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5876cf622bcf7";

const ERC20_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function owner() view returns (address)",
  "function paused() view returns (bool)",
]);
const BEACON_ABI = parseAbi(["function implementation() view returns (address)"]);

export class AnalysisError extends Error {
  constructor(message: string, readonly code: "not_a_contract" | "unsupported_chain" | "invalid_address" | "timeout") {
    super(message);
  }
}

export interface RiskReport {
  chainId: number;
  address: string;
  analyzedAt: string;
  isContract: true;
  bytecodeSize: number;
  proxy: { type: string; implementation: string | null; admin?: string | null; beacon?: string | null } | null;
  erc20: {
    isLikelyErc20: boolean;
    name: string | null;
    symbol: string | null;
    decimals: number | null;
    totalSupply: string | null;
    owner: string | null;
    ownerRenounced: boolean | null;
    paused: boolean | null;
  };
  opcodes: {
    selfdestruct: boolean;
    delegatecall: boolean;
    implementation?: { bytecodeSize: number; selfdestruct: boolean; delegatecall: boolean };
  };
  selectors: { found: string[] };
  blockscout: BlockscoutInfo & { implementation?: BlockscoutInfo };
  /** Fallback source lookup, only queried when Blockscout is unreachable or reports the contract as unverified. */
  sourcify?: SourcifyInfo & { implementation?: SourcifyInfo };
  aderyn: AderynResult;
  score: number;
  level: RiskLevel;
  flags: string[];
  notes: string[];
}

const clients = new Map<number, PublicClient>();
function clientFor(chain: ChainInfo): PublicClient {
  let c = clients.get(chain.id);
  if (!c) {
    c = createPublicClient({ transport: http(rpcUrl(chain), { timeout: 8_000, retryCount: 1 }) }) as PublicClient;
    clients.set(chain.id, c);
  }
  return c;
}

const tryOr = async <T>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

/** Last 20 bytes of a 32-byte storage word as a checksummed address, or null when empty. */
function slotAddress(word: string | undefined): Address | null {
  if (!word || !/^0x[0-9a-fA-F]{64}$/.test(word)) return null;
  const a = `0x${word.slice(26)}`;
  return /^0x0{40}$/.test(a) ? null : getAddress(a);
}

/** EIP-1167 minimal proxy: 363d3d373d3d3d363d73<20 bytes>5af43d82803e903d91602b57fd5bf3 */
export function parseMinimalProxy(code: string): Address | null {
  const m = /^0x363d3d373d3d3d363d73([0-9a-fA-F]{40})5af43d82803e903d91602b57fd5bf3/i.exec(code);
  return m ? getAddress(`0x${m[1]}`) : null;
}

async function detectProxy(client: PublicClient, address: Address, code: string, blockscoutImpls: string[]): Promise<RiskReport["proxy"]> {
  const [impl, admin, beacon, zep, proxiable] = await Promise.all(
    [SLOT_IMPL_1967, SLOT_ADMIN_1967, SLOT_BEACON_1967, SLOT_IMPL_ZEPPELINOS, SLOT_PROXIABLE_1822].map((slot) =>
      tryOr(client.getStorageAt({ address, slot: slot as `0x${string}` })),
    ),
  );
  const implAddr = slotAddress(impl ?? undefined);
  const adminAddr = slotAddress(admin ?? undefined);
  if (implAddr) return { type: "eip1967", implementation: implAddr, admin: adminAddr };
  const beaconAddr = slotAddress(beacon ?? undefined);
  if (beaconAddr) {
    const bi = await tryOr(client.readContract({ address: beaconAddr, abi: BEACON_ABI, functionName: "implementation" }));
    return { type: "eip1967-beacon", implementation: bi ? getAddress(bi) : null, beacon: beaconAddr, admin: adminAddr };
  }
  const zepAddr = slotAddress(zep ?? undefined);
  if (zepAddr) return { type: "zeppelinos", implementation: zepAddr };
  const p1822 = slotAddress(proxiable ?? undefined);
  if (p1822) return { type: "eip1822", implementation: p1822 };
  const minimal = parseMinimalProxy(code);
  if (minimal) return { type: "eip1167-minimal", implementation: minimal };
  if (adminAddr) return { type: "eip1967-admin-only", implementation: null, admin: adminAddr };
  // Blockscout-detected proxy patterns we did not recognise on-chain (e.g. custom storage layouts).
  if (blockscoutImpls.length > 0) return { type: "blockscout-detected", implementation: getAddress(blockscoutImpls[0]) };
  return null;
}

async function probeErc20(client: PublicClient, address: Address): Promise<RiskReport["erc20"]> {
  const call = <F extends "name" | "symbol" | "decimals" | "totalSupply" | "owner" | "paused">(functionName: F) =>
    tryOr(client.readContract({ address, abi: ERC20_ABI, functionName } as any)) as Promise<any>;
  const [name, symbol, decimals, totalSupply, owner, paused] = await Promise.all(
    (["name", "symbol", "decimals", "totalSupply", "owner", "paused"] as const).map(call),
  );
  return {
    isLikelyErc20: typeof decimals === "number" && totalSupply !== null && symbol !== null,
    name: typeof name === "string" ? name : null,
    symbol: typeof symbol === "string" ? symbol : null,
    decimals: typeof decimals === "number" ? decimals : null,
    totalSupply: typeof totalSupply === "bigint" ? totalSupply.toString() : null,
    owner: typeof owner === "string" ? owner : null,
    ownerRenounced: typeof owner === "string" ? owner.toLowerCase() === zeroAddress : null,
    paused: typeof paused === "boolean" ? paused : null,
  };
}

interface SourceLookup {
  blockscout: BlockscoutInfo;
  sourcify?: SourcifyInfo;
  files: SourceFile[];
  remappings: string[];
  language: string | null;
  verified: boolean | null; // null = verification status unknown (every source was unreachable)
}

/** Blockscout first; Sourcify only as a fallback. */
async function lookupSource(chain: ChainInfo, address: string): Promise<SourceLookup> {
  const bs = await lookupBlockscout(chain, address);
  if (bs.info.available && bs.info.verified) {
    return { blockscout: bs.info, files: bs.files, remappings: bs.remappings, language: bs.info.language ?? null, verified: true };
  }
  const sf = await lookupSourcify(chain, address);
  if (sf.info.verified) {
    return { blockscout: bs.info, sourcify: sf.info, files: sf.files, remappings: sf.remappings, language: sf.info.language ?? null, verified: true };
  }
  const known = bs.info.available || sf.info.available;
  return { blockscout: bs.info, sourcify: sf.info, files: [], remappings: [], language: null, verified: known ? false : null };
}

async function analyzeUncached(chain: ChainInfo, address: Address): Promise<RiskReport> {
  const t0 = Date.now();
  const client = clientFor(chain);

  const codeRaw = await client.getCode({ address }).catch((e) => {
    throw new Error(`RPC error while reading bytecode: ${String(e?.shortMessage ?? e?.message ?? e).slice(0, 160)}`);
  });
  if (!codeRaw || codeRaw === "0x") throw new AnalysisError(`${address} has no contract code on ${chain.name}`, "not_a_contract");
  const code = codeRaw;
  const bytecodeSize = (code.length - 2) / 2;
  const own = scanBytecode(code);

  // Stage 2 (parallel): Blockscout, ERC-20 probe, proxy slots.
  const [erc20, bs] = await Promise.all([probeErc20(client, address), lookupSource(chain, address)]);
  const proxy = await detectProxy(client, address, code, bs.blockscout.implementations ?? []);

  // Implementation bytecode + source (stage 3).
  let implScan: ReturnType<typeof scanBytecode> | undefined;
  let implSize = 0;
  let implBs: SourceLookup | undefined;
  if (proxy?.implementation) {
    const impl = proxy.implementation as Address;
    const [implCode, ibs] = await Promise.all([tryOr(client.getCode({ address: impl })), lookupSource(chain, impl)]);
    if (implCode && implCode !== "0x") {
      implScan = scanBytecode(implCode);
      implSize = (implCode.length - 2) / 2;
    }
    implBs = ibs;
  }

  const push4 = new Set<string>([...own.push4, ...(implScan?.push4 ?? [])]);
  const found = matchSelectors(push4);

  // Source used for static analysis and for the "verified" judgement: the logic contract.
  const logic = implBs && implBs.verified !== null ? implBs : bs;
  const verified = logic.verified; // null = unknown
  const sourceFiles: SourceFile[] = logic.files;

  const solidity = !logic.language || logic.language.toLowerCase() === "solidity";
  const remaining = HARD_DEADLINE_MS - (Date.now() - t0) - 1_500;
  const aderyn: AderynResult = solidity
    ? await runAderyn(sourceFiles, Math.min(15_000, remaining), logic.remappings)
    : { ran: false, reason: `unsupported language: ${logic.language}` };

  const logicSelfdestruct = implScan ? implScan.hasSelfdestruct : own.hasSelfdestruct;
  const ownerNotRenounced = erc20.owner !== null && erc20.ownerRenounced === false;
  const { score, level, flags } = computeScore({
    verified,
    isProxy: proxy !== null,
    ownerNotRenounced,
    foundSelectors: found,
    hasSelfdestruct: logicSelfdestruct,
    currentlyPaused: erc20.paused === true,
    aderynHigh: aderyn.ran ? aderyn.counts.high : null,
  });

  const notes = [
    "Selector presence is a bytecode heuristic: a PUSH4 of the selector in the dispatcher suggests the function exists, it does not prove it is reachable, unrestricted or abusable.",
    "Opcode flags come from a linear walk that skips PUSH data; SELFDESTRUCT/DELEGATECALL presence does not prove they are reachable.",
    "Score is deterministic, higher = riskier. It is a triage signal, not an audit or a guarantee of safety.",
  ];
  if (proxy) notes.push("Proxy detected: selectors, opcodes and source analysis cover the implementation as well. The upgrade admin can change behaviour at any time.");
  if (verified === null) notes.push("Neither Blockscout nor Sourcify was reachable: source verification status is unknown and was NOT penalised in the score.");
  else if (!bs.blockscout.available) notes.push("Blockscout was unreachable; verification status comes from Sourcify only.");
  if (!aderyn.ran) notes.push(`Static analysis did not run: ${aderyn.reason}.`);
  if (proxy && !proxy.implementation) notes.push("Proxy detected but the implementation address could not be resolved.");

  return {
    chainId: chain.id,
    address,
    analyzedAt: new Date().toISOString(),
    isContract: true,
    bytecodeSize,
    proxy,
    erc20,
    opcodes: {
      selfdestruct: own.hasSelfdestruct,
      delegatecall: own.hasDelegatecall,
      ...(implScan ? { implementation: { bytecodeSize: implSize, selfdestruct: implScan.hasSelfdestruct, delegatecall: implScan.hasDelegatecall } } : {}),
    },
    selectors: { found },
    blockscout: { ...bs.blockscout, ...(implBs ? { implementation: implBs.blockscout } : {}) },
    ...(bs.sourcify || implBs?.sourcify
      ? { sourcify: { ...(bs.sourcify ?? { available: false, verified: false, reason: "not queried" }), ...(implBs?.sourcify ? { implementation: implBs.sourcify } : {}) } }
      : {}),
    aderyn,
    score,
    level,
    flags,
    notes,
  };
}

const cache = new Map<string, { at: number; report: RiskReport }>();
const inflight = new Map<string, Promise<RiskReport>>();

/** Test helper. */
export function clearCache(): void {
  cache.clear();
  inflight.clear();
}

export async function analyzeContract(chainId: number, rawAddress: string): Promise<RiskReport> {
  const chain = getChain(chainId);
  if (!chain) throw new AnalysisError(`Unsupported chainId ${chainId}`, "unsupported_chain");
  if (!/^0x[0-9a-fA-F]{40}$/.test(rawAddress)) throw new AnalysisError("Invalid address", "invalid_address");
  const address = getAddress(rawAddress.toLowerCase());
  const key = `${chainId}:${address.toLowerCase()}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.report;
  const pending = inflight.get(key);
  if (pending) return pending;

  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new AnalysisError("Analysis exceeded the time budget", "timeout")), HARD_DEADLINE_MS);
  });
  const p = Promise.race([analyzeUncached(chain, address), deadline])
    .then((report) => {
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
      cache.set(key, { at: Date.now(), report });
      return report;
    })
    .finally(() => {
      clearTimeout(timer);
      inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}
