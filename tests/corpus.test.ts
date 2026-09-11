/**
 * The TypeScript emitter against every `worktable!` declaration in WorkTable itself.
 *
 * `tests/roundtrip.test.ts` checks the cases somebody thought to invent, which is to say the
 * cases whose rules its author already understood. This one checks the tables people actually
 * wrote, and it is where an unexamined assumption shows up: an ordering that happens to hold in
 * every hand-written case, a clause combination nobody thought to pair, a default that is only
 * ever written one way in a corpus of eleven.
 *
 * The Rust side does the scanning and the parsing. `worktable-schemas` walks the tree, reads
 * each declaration with `declarations_in_source`, and prints the model beside the canonical
 * text `Schema::to_dsl()` produced for it. This file deserialises the model, emits it, and
 * compares. No parsing happens here and none should: the emitter is the only thing under test.
 *
 * It fails when the Rust side is unavailable, for the reason given in `roundtrip.test.ts`.
 */

import { describe, expect, test } from "bun:test";
import { emit } from "../src/emit.js";
import type { Schema } from "../src/types.js";
import { RS, rustBinary } from "./rust-cli.js";


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
    "`wt-dsl` and `worktable-schemas` binaries under `dsl/src/bin/`, and that cargo",
    "is on PATH.",
  ].join("\n");
}

interface Entry {
  file: string;
  /** What `Schema::to_dsl()` produced. The target. */
  dsl: string;
  schema: Schema;
}

interface Corpus {
  /** `worktable!` inside a `macro_rules!` body: a template, not a declaration. */
  templates: number;
  /** Invocations the Rust parser could not read. Any at all is a broken corpus. */
  rejected: number;
  schemas: Entry[];
}

async function loadCorpus(): Promise<Corpus> {
  const proc = Bun.spawn(
    [rustBinary("worktable-schemas"), "."],
    {
      cwd: RS,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, PATH: `/opt/homebrew/opt/rustup/bin:${process.env.PATH}` },
    },
  );
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error(remedy(RS, err, code));
  }
  return JSON.parse(out) as Corpus;
}

const corpus = await loadCorpus();

describe("every declaration in WorkTable emits byte-identically", () => {
  test("the corpus is large enough to mean something", () => {
    // A guard against the scan silently finding nothing — an empty corpus passes every
    // assertion below and proves precisely nothing.
    expect(corpus.schemas.length).toBeGreaterThan(100);
    expect(corpus.rejected).toBe(0);
  });

  test("emitting each one matches to_dsl() byte for byte", () => {
    const wrong: string[] = [];
    const seen = new Set<string>();

    for (const entry of corpus.schemas) {
      // The same table is declared in more than one place across benches and tests. Emitting
      // it repeatedly costs nothing and tells nothing, so each distinct declaration counts once
      // and the failure list stays readable.
      const key = entry.dsl;
      if (seen.has(key)) continue;
      seen.add(key);

      const emitted = emit(entry.schema);
      if (emitted !== entry.dsl) {
        wrong.push(
          `${entry.file} (${entry.schema.name})\n--- rust\n${entry.dsl}--- typescript\n${emitted}`,
        );
      }
    }

    expect(wrong.join("\n\n"), `${wrong.length} of ${seen.size} distinct declarations differ`).toBe("");
  });
});
