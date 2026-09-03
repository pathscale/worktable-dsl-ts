/**
 * The check that matters: emit from TypeScript, canonicalise with Rust, compare bytes.
 *
 * Two independent implementations of one language drift unless something compares them, and
 * this file is that something. It is why the emitter needs no conformance suite of its own: the
 * Rust emitter *is* the specification of the output, and agreement with it is the property.
 *
 * The comparison is byte-for-byte against `Schema::to_dsl()`, not a parse-succeeded check. Two
 * emitters that agree on every meaning and disagree on layout are two emitters that will drift,
 * and the drift will be discovered by a person reading a diff of a file nobody edited.
 *
 * **It fails, loudly, when the Rust binary is absent.** That is deliberate and it is the
 * opposite of skipping. A cross-implementation guard that can be skipped will be skipped —
 * in CI, on the machine where the sibling checkout is missing, on the day someone is in a
 * hurry — and a suite that reports green having compared nothing is worse than no suite. The
 * cost of the strict choice is that this repository cannot be tested without a Rust toolchain
 * and a WorkTable checkout, which is the correct price for the guarantee.
 */

import { describe, expect, test } from "bun:test";
import { emit } from "../src/emit.js";
import type { Schema } from "../src/types.js";

// WORKTABLE_RS overrides the sibling default, so CI does not have to reproduce a directory
// layout with symlinks.
const RS = process.env.WORKTABLE_RS ?? new URL("../../WorkTable/", import.meta.url).pathname;

/**
 * What to do about a Rust side that will not run.
 *
 * A test that fails without saying why trains people to ignore it, and this one fails for a
 * mundane reason more often than for a real one: the sibling checkout is missing, is on a
 * branch without the binaries, or has no toolchain to build them.
 */
function remedy(rs: string, stderr: string, code: number): string {
  return [
    `The Rust side could not be run from ${rs} (exit ${code}).`,
    stderr.trim() === "" ? "(it printed nothing)" : stderr.trim(),
    "",
    "This is not a skippable test. It is the only thing comparing this emitter against the",
    "one it has to match byte for byte, so it fails rather than passing quietly.",
    "",
    "Check that WORKTABLE_RS points at a WorkTable checkout, that the checkout has the",
    "`worktable-parse` and `worktable-schemas` binaries under `dsl/src/bin/`, and that cargo",
    "is on PATH.",
  ].join("\n");
}

async function canonicaliseWithRust(text: string): Promise<{ ok: boolean; output: string }> {
  const proc = Bun.spawn(["cargo", "run", "-q", "-p", "worktable_dsl", "--bin", "worktable-parse"], {
    cwd: RS,
    stdin: new TextEncoder().encode(text),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, PATH: `/opt/homebrew/opt/rustup/bin:${process.env.PATH}` },
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { ok: code === 0, output: code === 0 ? out : remedy(RS, out + err, code) };
}

const cases: Record<string, Schema> = {
  "the smallest declaration there is": {
    name: "Minimal",
    version: 1,
    columns: [{ name: "id", ty: "u64", primary_key: true, index_backend: "WorktablesIndex" }],
  },

  "every column clause at once": {
    name: "Kitchen",
    version: 3,
    persist: "MemoryOnly",
    columns: [
      // The generator binds to `primary_key`, and `optional` follows both: clause order here is
      // the grammar's, not the order the fields happen to be declared in.
      { name: "id", ty: "u64", primary_key: true, generator: "Autoincrement", index_backend: "WorktablesIndex" },
      { name: "nickname", ty: "String", optional: true },
      { name: "score", ty: "i64" },
    ],
    indexes: [
      { name: "by_nickname", column: "nickname", unique: true },
      { name: "by_score", column: "score" },
    ],
  },

  "a custom generator and a non-default primary backend": {
    name: "Custom",
    version: 1,
    persist: "MemoryOnly",
    columns: [
      { name: "id", ty: "u64", primary_key: true, generator: "Custom", index_backend: "Congee" },
      { name: "payload", ty: "String" },
    ],
  },

  "the default backend is never written": {
    // Both spellings — stated-as-default and absent — must emit nothing, or the output stops
    // matching a schema the Rust parser produced from text that said neither.
    name: "Defaults",
    version: 1,
    columns: [
      { name: "id", ty: "u64", primary_key: true, index_backend: "WorktablesIndex" },
      { name: "a", ty: "u64" },
    ],
    indexes: [{ name: "by_a", column: "a", backend: "WorktablesIndex" }],
  },

  "each index backend": {
    name: "Backends",
    version: 1,
    persist: "MemoryOnly",
    columns: [
      { name: "id", ty: "u64", primary_key: true, index_backend: "WorktablesIndex" },
      { name: "a", ty: "u64" },
      { name: "b", ty: "u64" },
      { name: "c", ty: "u64" },
    ],
    indexes: [
      // `indexset` and `congee` are unique-only: a non-unique index currently requires
      // `worktables_index` or `arctic`. A rule the emitter does not enforce and the corpus
      // must still respect, or this file asserts against text the macro would refuse.
      { name: "by_a", column: "a", unique: true, backend: "Indexset" },
      { name: "by_b", column: "b", unique: true, backend: "Congee" },
      { name: "by_c", column: "c", backend: "Arctic" },
    ],
  },

  "a partitioned table": {
    name: "Partitioned",
    version: 2,
    partition_by: { name: "shard", ty: "u32" },
    columns: [
      { name: "id", ty: "u64", primary_key: true, index_backend: "WorktablesIndex" },
      { name: "value", ty: "String" },
    ],
  },

  "all three query kinds": {
    name: "Queried",
    version: 1,
    columns: [
      { name: "id", ty: "u64", primary_key: true, index_backend: "WorktablesIndex" },
      { name: "a", ty: "u64" },
      { name: "b", ty: "String" },
    ],
    queries: {
      updates: [
        { name: "SetA", columns: ["a"], by: "id" },
        { name: "SetBoth", columns: ["a", "b"], by: "id" },
      ],
      // A delete touches no columns, which is why `columns` is empty rather than absent.
      deletes: [{ name: "ById", columns: [], by: "id" }],
      in_place: [{ name: "BumpA", columns: ["a"], by: "id" }],
    },
  },

  "a config block, which is the one that ends without a comma": {
    name: "Configured",
    version: 1,
    columns: [{ name: "id", ty: "u64", primary_key: true, index_backend: "WorktablesIndex" }],
    config: { page_size: 4096, row_derives: ["Clone", "Debug"] },
  },

  "the only page size a persisted table may state": {
    name: "PersistedPages",
    version: 1,
    persist: "Persisted",
    columns: [{ name: "id", ty: "u64", primary_key: true, index_backend: "WorktablesIndex" }],
    config: { page_size: 16384 },
  },

  "a composite primary key": {
    name: "Composite",
    version: 1,
    columns: [
      { name: "left", ty: "u64", primary_key: true, index_backend: "WorktablesIndex" },
      { name: "right", ty: "u32", primary_key: true, index_backend: "WorktablesIndex" },
      { name: "payload", ty: "String", optional: true },
    ],
  },

  "row_derives alone, with no page size": {
    name: "Derived",
    version: 7,
    columns: [{ name: "id", ty: "u64", primary_key: true, index_backend: "WorktablesIndex" }],
    config: { row_derives: ["PartialEq"] },
  },
};

describe("emitted text canonicalises to itself through the Rust implementation", () => {
  test("the Rust binary is reachable", async () => {
    const { ok, output } = await canonicaliseWithRust("name: Probe,\ncolumns: { id: u64 primary_key },\n");
    expect(ok, `worktable-parse could not be run from ${RS}:\n${output}`).toBe(true);
  }, 180_000);

  for (const [name, schema] of Object.entries(cases)) {
    test(name, async () => {
      const emitted = emit(schema);
      const { ok, output } = await canonicaliseWithRust(emitted);
      expect(ok, `Rust rejected the emitted text:\n${emitted}\n${output}`).toBe(true);
      // The assertion. Not "it parsed" — that would pass for text laid out differently, which
      // is exactly the drift this file exists to catch.
      expect(output).toBe(emitted);
    }, 180_000);
  }

  test("emission is idempotent", () => {
    // The canonical form of a canonical document is itself. Without this, an emitter could
    // produce accepted-but-unstable output and every test above would still pass.
    for (const schema of Object.values(cases)) {
      expect(emit(structuredClone(schema))).toBe(emit(schema));
    }
  });
});
