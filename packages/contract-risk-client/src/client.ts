import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import type { ChainInfo, PaymentReceipt, QuickFlags, RiskReport } from "./types.js";

export const DEFAULT_BASE_URL = "https://x402.magneta.finance";
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Same list the free MCP tool `supported_chains` returns (there is no HTTP route for it). */
export const SUPPORTED_CHAINS: ChainInfo[] = [
  [1, "Ethereum"], [10, "OP Mainnet"], [56, "BNB Smart Chain"], [100, "Gnosis"], [130, "Unichain"], [137, "Polygon"],
  [146, "Sonic"], [480, "World Chain"], [5000, "Mantle"], [8453, "Base"], [42161, "Arbitrum One"], [42220, "Celo"],
  [43114, "Avalanche C-Chain"], [59144, "Linea"], [81457, "Blast"], [534352, "Scroll"],
].map(([chainId, name]) => ({ chainId: chainId as number, name: name as string, testnet: false })).concat([
  { chainId: 84532, name: "Base Sepolia", testnet: true },
  { chainId: 11155111, name: "Sepolia", testnet: true },
  { chainId: 11155420, name: "OP Sepolia", testnet: true },
  { chainId: 421614, name: "Arbitrum Sepolia", testnet: true },
]);

/** Structural subset of a viem account that the exact EVM scheme needs (signTypedData + address). */
export type PayerAccount = ConstructorParameters<typeof ExactEvmScheme>[0];

export interface ContractRiskClientOptions {
  /** Hex private key of a wallet holding USDC on Base (no ETH needed). Provide this OR `account`. */
  privateKey?: `0x${string}`;
  account?: PayerAccount;
  /** Default https://x402.magneta.finance */
  baseUrl?: string;
  /** Per-payment cap, x402 price string. Default "$0.05" (the call costs $0.02). */
  maxAmountPerPayment?: `$${string}`;
  /** Inject a fetch implementation (tests, proxies). Default: global fetch. */
  fetch?: typeof fetch;
}

export class ContractRiskError extends Error {
  constructor(public status: number, public body: string, message?: string) {
    super(message ?? `Magneta Contract Risk HTTP ${status}: ${body.slice(0, 300)}`);
    this.name = "ContractRiskError";
  }
}

export interface ContractRiskClient {
  /** Paid ($0.02). Full report; `_payment` carries the settlement receipt. 400/422/429/502 are not charged. */
  risk(chainId: number, address: string): Promise<RiskReport>;
  /** Free bytecode-only preview. */
  quickFlags(chainId: number, address: string): Promise<QuickFlags>;
  /** Static list of the 20 supported chains (no network call). */
  supportedChains(): Promise<ChainInfo[]>;
}

function check(chainId: number, address: string) {
  if (!Number.isInteger(chainId) || chainId <= 0) throw new TypeError("chainId must be a positive integer");
  if (!ADDRESS_RE.test(address)) throw new TypeError("address must be 0x followed by 40 hex characters");
}

export function createContractRiskClient(opts: ContractRiskClientOptions): ContractRiskClient {
  const baseFetch = opts.fetch ?? globalThis.fetch;
  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const account = opts.account ?? (opts.privateKey ? privateKeyToAccount(opts.privateKey) : undefined);
  if (!account) throw new TypeError("createContractRiskClient needs `privateKey` or `account`");

  const client = new x402Client();
  client.setSpendControls({ maxAmountPerPayment: opts.maxAmountPerPayment ?? "$0.05" });
  client.register("eip155:*", new ExactEvmScheme(account));
  const paidFetch = wrapFetchWithPayment(baseFetch, client);
  const httpClient = new x402HTTPClient(client);

  return {
    async risk(chainId, address) {
      check(chainId, address);
      const res = await paidFetch(`${baseUrl}/v1/risk/${chainId}/${address}`, { method: "GET" });
      if (!res.ok) throw new ContractRiskError(res.status, await res.text());
      const report = (await res.json()) as RiskReport;
      try {
        const s = httpClient.getPaymentSettleResponse((n) => res.headers.get(n));
        if (s?.transaction) report._payment = { transaction: s.transaction, network: String(s.network), payer: s.payer } satisfies PaymentReceipt;
      } catch { /* no PAYMENT-RESPONSE header: leave _payment undefined */ }
      return report;
    },
    async quickFlags(chainId, address) {
      check(chainId, address);
      const res = await baseFetch(`${baseUrl}/v1/flags/${chainId}/${address}`);
      if (!res.ok) throw new ContractRiskError(res.status, await res.text());
      return (await res.json()) as QuickFlags;
    },
    async supportedChains() {
      return SUPPORTED_CHAINS.map((c) => ({ ...c }));
    },
  };
}
