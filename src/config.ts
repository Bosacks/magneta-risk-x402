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
export const PRICE = "$0.02";
/** Public base URL of this service (https in production); used as the MCP resource URL for Bazaar discovery. */
export const PUBLIC_URL = (): string => env("PUBLIC_URL", `http://127.0.0.1:${PORT()}`).replace(/\/$/, "");
