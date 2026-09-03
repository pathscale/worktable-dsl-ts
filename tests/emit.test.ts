/**
 * The emitter's own decisions, tested where the corpus cannot reach.
 *
 * `tests/corpus.test.ts` runs every declaration in WorkTable through this emitter and is the
 * stronger check by far. What it cannot contain is a schema the macro would reject, or a
 * distinction that happens to be invisible in the text — so this file covers exactly those, and
 * does not restate what 121 real declarations already prove.
 */

import { describe, expect, test } from "bun:test";
import { emit, emitMacroInvocation } from "../src/emit.js";
import type { Schema } from "../src/types.js";

function minimal(overrides: Partial<Schema> = {}): Schema {
  return {
    name: "T",
    version: 1,
    columns: [{ name: "id", ty: "u64", primary_key: true, index_backend: "WorktablesIndex" }],
    ...overrides,
  };
}

describe("persistence has three states", () => {
  test("omitted writes nothing, which is not the same as writing false", () => {
    // The macro requires an explicit acknowledgement before accepting an index backend that
    // cannot be persisted. Turning `Omitted` into `persist: false` would answer a question the
    // author deliberately left open, and it would do it silently.
    expect(emit(minimal())).not.toContain("persist");
    expect(emit(minimal({ persist: "Omitted" }))).not.toContain("persist");
  });

  test("memory-only and persisted are written", () => {
    expect(emit(minimal({ persist: "MemoryOnly" }))).toContain("persist: false,\n");
    expect(emit(minimal({ persist: "Persisted" }))).toContain("persist: true,\n");
  });
});

describe("the page size a persisted table may not have", () => {
  test("refuses the combination that corrupts files", () => {
    // Not a compile error on the Rust side either — it parses. The macro refuses it, and the
    // reason is that the on-disk layer seeks in 16384-byte pages regardless, so a persisted
    // table with any other page size reads and writes the wrong ones.
    expect(() => emit(minimal({ persist: "Persisted", config: { page_size: 4096 } }))).toThrow(
      /cannot be combined with persist: true/,
    );
  });

  test("16384 is allowed, because it is what the on-disk layer already assumes", () => {
    expect(emit(minimal({ persist: "Persisted", config: { page_size: 16384 } }))).toContain(
      "page_size: 16384,",
    );
  });

  test("any page size is fine in memory", () => {
    expect(emit(minimal({ persist: "MemoryOnly", config: { page_size: 4096 } }))).toContain(
      "page_size: 4096,",
    );
  });
});

describe("null and absent are the same thing", () => {
  test("a schema from serde emits identically to a hand-written one", () => {
    // Rust writes an absent Option as `null`, so a schema deserialised from the Rust side has
    // explicit nulls where a hand-written one omits the key. One schema, one text.
    const fromRust: Schema = {
      name: "T",
      version: 1,
      partition_by: null,
      columns: [
        { name: "id", ty: "u64", optional: false, primary_key: true, generator: "None", index_backend: "WorktablesIndex" },
        { name: "a", ty: "u64", optional: false, primary_key: false, generator: "None", index_backend: null },
      ],
      indexes: [],
      queries: { updates: [], deletes: [], in_place: [] },
      config: { page_size: null, row_derives: [] },
    };
    const handWritten: Schema = {
      name: "T",
      version: 1,
      columns: [
        { name: "id", ty: "u64", primary_key: true, index_backend: "WorktablesIndex" },
        { name: "a", ty: "u64" },
      ],
    };
    expect(emit(fromRust)).toBe(emit(handWritten));
  });
});

describe("the default backend is never written", () => {
  test("neither on a primary key nor on a secondary index", () => {
    // A primary-key column always carries a backend once parsed, because the model fills the
    // default in. Writing it back would be correct and noisy, and this text is read by people.
    const text = emit(
      minimal({
        columns: [
          { name: "id", ty: "u64", primary_key: true, index_backend: "WorktablesIndex" },
          { name: "a", ty: "u64" },
        ],
        indexes: [{ name: "by_a", column: "a", backend: "WorktablesIndex" }],
      }),
    );
    expect(text).not.toContain("using");
  });

  test("a deliberate choice is written, in the grammar's spelling and not serde's", () => {
    const text = emit(
      minimal({
        persist: "MemoryOnly",
        columns: [{ name: "id", ty: "u64", primary_key: true, index_backend: "Congee" }],
      }),
    );
    expect(text).toContain("id: u64 primary_key using congee,");
  });
});

describe("trailing commas are asymmetric on purpose", () => {
  test("columns, indexes and queries blocks end with one; config does not", () => {
    // Every block parser accepts a trailing comma as of 1.0.0-beta.17, so emitting one after
    // `config` would parse. It is still wrong to: emitted text is routinely fed to a macro
    // older than the emitter that wrote it, and versions before beta.17 leave that comma for
    // the top-level dispatch, which reports it as an unexpected identifier.
    const text = emit(
      minimal({
        indexes: [{ name: "by_id", column: "id", unique: true }],
        queries: { updates: [{ name: "SetId", columns: ["id"], by: "id" }] },
        config: { page_size: 4096 },
      }),
    );
    // Each of columns, indexes and queries closes with a comma before the next key.
    expect(text).toContain("},\nindexes:");
    expect(text).toContain("},\nqueries:");
    expect(text).toContain("},\nconfig:");
    expect(text.endsWith("config: {\n    page_size: 4096,\n}\n")).toBe(true);
    // The query sub-block closes without one for the same reason.
    expect(text).toContain("    }\n},\n");
  });
});

describe("clause order within a column is the grammar's", () => {
  test("generator binds to primary_key, and optional follows both", () => {
    const text = emit(
      minimal({
        columns: [
          {
            name: "id",
            ty: "u64",
            optional: true,
            primary_key: true,
            generator: "Autoincrement",
            index_backend: "Arctic",
          },
        ],
      }),
    );
    expect(text).toContain("id: u64 primary_key autoincrement optional using arctic,");
  });
});

describe("the invocation wrapper", () => {
  test("indents the body and wraps it", () => {
    // The emitter's output is the macro body, so anything writing a Rust file needs this.
    expect(emitMacroInvocation(minimal())).toBe(
      "worktable! {\n" +
        "    name: T,\n" +
        "    version: 1,\n" +
        "    columns: {\n" +
        "        id: u64 primary_key,\n" +
        "    },\n" +
        "}\n",
    );
  });
});

describe("version is always written", () => {
  test("even when it is the default", () => {
    // The model resolves an absent `version` to 1 rather than storing the absence, so there is
    // no way to emit "the author did not say". Writing it is the honest option.
    expect(emit(minimal({ version: 1 }))).toContain("version: 1,");
  });
});
