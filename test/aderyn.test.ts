import assert from "node:assert/strict";
import test from "node:test";
import { parseAderynReport, safeRelPath } from "../src/risk/aderyn.js";

test("safeRelPath strips absolute prefixes and traversal", () => {
  assert.equal(safeRelPath("/Users/x/contracts/A.sol"), "Users/x/contracts/A.sol");
  assert.equal(safeRelPath("../../etc/passwd"), "etc/passwd");
  assert.equal(safeRelPath("@openzeppelin/contracts/X.sol"), "@openzeppelin/contracts/X.sol");
  assert.equal(safeRelPath(".."), "Contract.sol");
});

test("parseAderynReport counts by severity and sorts findings", () => {
  const r = parseAderynReport({
    high_issues: { issues: [{ title: "H1", instances: [{}] }] },
    low_issues: { issues: [{ title: "L1", instances: [{}] }, { title: "L2", instances: [{}, {}, {}] }] },
  });
  assert.deepEqual(r.counts, { high: 1, low: 2 });
  assert.deepEqual(r.top.map((f) => f.title), ["H1", "L2", "L1"]);
});

test("sanitizeRemappings keeps well-formed relative remappings and drops unsafe ones", async () => {
  const { sanitizeRemappings } = await import("../src/risk/aderyn.js");
  const out = sanitizeRemappings([
    "@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/",
    "forge-std/=lib/forge-std/src/",
    "evil/=../../etc/",
    "abs/=/etc/passwd",
    "spaces bad/=lib/x/",
    "noequals",
  ]);
  assert.deepEqual(out, ["@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/", "forge-std/=lib/forge-std/src/"]);
});

test("dedupeSpdx keeps the first SPDX line and neutralises the others", async () => {
  const { dedupeSpdx } = await import("../src/risk/aderyn.js");
  const src = "// SPDX-License-Identifier: MIT\npragma solidity ^0.6.4;\n// SPDX-License-Identifier: Apache-2.0\ncontract A {}\n";
  const out = dedupeSpdx(src);
  assert.equal((out.match(/SPDX-License-Identifier:/g) ?? []).length, 1);
  assert.ok(out.includes("SPDX-License-Identifier-duplicate: Apache-2.0"));
});
