// Minimal EVM bytecode walker. It skips PUSH immediate data so that data bytes are never mistaken for opcodes,
// and collects the 4-byte PUSH4 immediates (where solc/vyper dispatchers keep function selectors).

export interface OpcodeScan {
  hasSelfdestruct: boolean; // opcode 0xff
  hasDelegatecall: boolean; // opcode 0xf4
  push4: Set<string>; // lowercase 0x-prefixed 4-byte immediates
}

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(Math.floor(h.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function scanBytecode(code: string | Uint8Array): OpcodeScan {
  const bytes = typeof code === "string" ? hexToBytes(code) : code;
  const scan: OpcodeScan = { hasSelfdestruct: false, hasDelegatecall: false, push4: new Set() };
  let i = 0;
  while (i < bytes.length) {
    const op = bytes[i];
    if (op >= 0x60 && op <= 0x7f) {
      const n = op - 0x5f; // PUSH1..PUSH32 carry 1..32 data bytes
      if (op === 0x63 && i + 4 < bytes.length) {
        let s = "0x";
        for (let k = 1; k <= 4; k++) s += bytes[i + k].toString(16).padStart(2, "0");
        scan.push4.add(s);
      }
      i += 1 + n;
      continue;
    }
    if (op === 0xff) scan.hasSelfdestruct = true;
    else if (op === 0xf4) scan.hasDelegatecall = true;
    i += 1;
  }
  return scan;
}
