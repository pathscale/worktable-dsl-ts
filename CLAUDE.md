@AGENTS.md

# Claude Code notes — worktable-dsl-ts

The import above is binding: [`AGENTS.md`](AGENTS.md) is the **working agreement** for this
repository, and every Claude Code session loads it automatically. Don't copy rules here — one
source of truth, no drift. Only genuinely Claude-specific wiring belongs below.

- `cargo` is not on `PATH` by default on this machine; `/opt/homebrew/opt/rustup/bin` has to be
  exported onto it first. The test helpers already prepend it when they spawn `cargo`, so a
  failure to find it means the helper was bypassed rather than that the toolchain is missing.
