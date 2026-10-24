// Shared env helpers. Values come from process.env (loaded from .env.local when present).
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/** Reads a required env variable or exits with a clear message. */
export function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var ${name}`);
    process.exit(1);
  }
  return v;
}

export const env = (name: string, fallback: string): string => process.env[name] || fallback;

export const PORT = (): number => parseInt(env("PORT", "3011"), 10);
export const NETWORK = (): `${string}:${string}` => env("X402_NETWORK", "eip155:84532") as `${string}:${string}`;
export const PRICE = "$0.01";
/** Public base URL of this service (https in production); used as the MCP resource URL for Bazaar discovery. */
/** Optional second payment network: Solana mainnet (or devnet when X402_NETWORK is a testnet). Enabled when SOLANA_PAY_TO is set. */
export const SOLANA_NETWORK = (): `${string}:${string}` =>
  (NETWORK() === "eip155:8453" ? "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" : "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1") as `${string}:${string}`;
export const SOLANA_PAY_TO = (): string | undefined => process.env.SOLANA_PAY_TO || undefined;
export const PUBLIC_URL = (): string => env("PUBLIC_URL", `http://127.0.0.1:${PORT()}`).replace(/\/$/, "");
