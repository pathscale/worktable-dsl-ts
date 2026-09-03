# Working agreement — worktable-dsl-ts

The operating contract for **any** coding agent working in this repository. This file is the
single source of truth for the rules: Codex, Cursor and Gemini CLI read `AGENTS.md` natively,
and Claude Code loads it through the `@AGENTS.md` import in [`CLAUDE.md`](CLAUDE.md). **Never
fork these rules into a per-vendor file.**

**TypeScript types and canonical-text emitter** for the `worktable!` schema language. The
language itself lives in [WorkTable](https://github.com/pathscale/WorkTable), under `dsl/`.

## Invariants (don't break these)

- **`dsl/src/schema/emit_dsl.rs` in WorkTable is the specification of the output.** Not the
  examples, not this README. If the two disagree, that file is right and the fix goes here. If
  it is actually wrong, fix it there first, with a fixture, and then follow.

- **No parser.** `worktable_dsl` reads the language and is authoritative. A second parser is a
  second set of semantics to keep in agreement, and it is the expensive half of the pair.

- **No WASM.** Compiling the Rust crate was considered and rejected.

- **No `uml`.** The language has no foreign keys; `infer_relations` guesses from a naming
  convention WorkTable does not enforce. That mapping belongs to the application drawing the
  diagram, not here.

- **The cross-implementation tests must fail when the Rust side is missing, never skip.** A
  guard that can be skipped will be skipped, and a green suite that compared nothing is worse
  than no suite. If you are tempted to add a skip, you are removing the only thing keeping two
  implementations of one language in agreement.

- **Zero runtime dependencies.** The emitter is a pure function over plain data. Anything it
  needs, it can contain.

- **No Python.** Not a script, not `python3 -c`, not a heredoc. Do not assume `jq` is present:
  it does not ship with macOS.

- **Docs describe what is true now.** Behaviour change and README change land together. This
  repository exists partly because a sibling's README claimed a skip it did not implement.

## Build & test

```bash
bun install
bun run typecheck
bun test
bun run build
```

`WORKTABLE_RS` points at a WorkTable checkout; it defaults to `../WorkTable`. The tests build
and run two binaries from it, `worktable-parse` and `worktable-schemas`, so the first run is
slow and the rest are not.

## Git

- **`master`, never `main`.**
- One change per commit. Substantial work goes on a branch with a PR.
- **No AI attribution.** No `Co-Authored-By` trailers, no "Generated with" lines, anywhere.
- **No copyright, licence or SPDX banners in source.** Licensing lives in the manifest.

## Licence

Dual [Apache-2.0](LICENSE-APACHE) / [MIT](LICENSE-MIT). Contributions are taken under both.
