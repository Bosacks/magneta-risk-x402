import assert from "node:assert/strict";
import test from "node:test";
import { scanBytecode } from "../src/risk/opcodes.js";

test("detects bare SELFDESTRUCT and DELEGATECALL opcodes", () => {
  const s = scanBytecode("0x5bf4ff");
  assert.equal(s.hasDelegatecall, true);
  assert.equal(s.hasSelfdestruct, true);
});

test("0xff / 0xf4 inside PUSH data are NOT opcodes", () => {
  // PUSH2 0xfff4 ; PUSH1 0xff ; STOP
  const s = scanBytecode("0x61fff460ff00");
  assert.equal(s.hasSelfdestruct, false);
  assert.equal(s.hasDelegatecall, false);
});

test("a truncated PUSH at the end does not crash or false-positive", () => {
  const s = scanBytecode("0x7fffff");
  assert.equal(s.hasSelfdestruct, false);
});

test("collects PUSH4 immediates only", () => {
  // PUSH4 40c10f19 ; EQ ; PUSH2 0040 ; JUMPI ; PUSH4 8456cb59
  const s = scanBytecode("0x6340c10f191461004057638456cb59");
  assert.deepEqual([...s.push4].sort(), ["0x40c10f19", "0x8456cb59"]);
});
