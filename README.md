# @pathscale/worktable-dsl

TypeScript types and a canonical-text emitter for the `worktable!` schema language.

Schema object in, declaration text out:

```ts
import { emit, emitMacroInvocation, type Schema } from "@pathscale/worktable-dsl";

const schema: Schema = {
  name: "Users",
  version: 1,
  persist: "MemoryOnly",
  columns: [
    { name: "id", ty: "u64", primary_key: true, generator: "Autoincrement" },
    { name: "nickname", ty: "String", optional: true },
  ],
  indexes: [{ name: "by_nickname", column: "nickname", unique: true }],
};

emit(schema);
// name: Users,
// version: 1,
// persist: false,
// columns: {
//     id: u64 primary_key autoincrement,
//     nickname: String optional,
// },
// indexes: {
//     by_nickname: nickname unique,
// },

emitMacroInvocation(schema); // the same, wrapped in `worktable! { .. }`
```

`emit` returns the macro **body**, which is what
[`worktable_dsl`](https://github.com/pathscale/WorkTable)'s `Schema::parse` accepts and what its
`Schema::to_dsl` produces. `emitMacroInvocation` wraps it for writing into a Rust file.

## There is no parser here

Deliberately. `worktable_dsl` reads the language and is authoritative; a design tool needs to
*write* schemas. A second parser is a second set of semantics to keep in agreement, and the
parser is the expensive half of that pair to keep honest.

## The output is byte-exact

The target is `Schema::to_dsl()`, character for character, and `tests/corpus.test.ts` checks it
against **every `worktable!` declaration in WorkTable itself** — 121 of them at the time of
writing, covering every construct in the grammar. `tests/roundtrip.test.ts` adds hand-written
cases for combinations the repository does not happen to contain.

Byte-exactness rather than semantic agreement is the property on purpose. Two emitters can agree
on every meaning and still disagree on every character a person reads, and the disagreement gets
discovered as a diff in a file nobody edited.

**The tests fail, loudly, when the Rust side is unavailable.** That is the opposite of skipping,
and it is intentional. A cross-implementation guard that can be skipped will be skipped — in CI,
on the machine without the sibling checkout, on the day somebody is in a hurry — and a suite
reporting green having compared nothing is worse than no suite. The cost is that this repository
cannot be tested without a Rust toolchain and a WorkTable checkout. That is the right price.

Point them at a checkout with `WORKTABLE_RS`; it defaults to `../WorkTable`.

```bash
bun install && bun test
```

## Three things that are easy to get wrong

**Persistence has three states, not two.** `"Omitted"` is not `"MemoryOnly"`. The macro requires
an explicit `persist: false` before it will accept `congee` or `arctic`, which cannot be
persisted, so writing `persist: false` in place of silence answers a question the author left
open.

**Trailing commas are asymmetric, and that is not a bug.** The `columns`, `indexes` and
`queries` blocks close with a comma; the `config` block and each query sub-block do not. Every
block parser accepts one as of `worktable_dsl` 1.0.0-beta.17, so emitting them everywhere would
parse — against a current macro. Emitted text is routinely fed to a macro older than the emitter
that wrote it, and before beta.17 that comma reaches the top-level dispatch and is reported as
an unexpected identifier.

**`page_size` and `persist: true` combine only at 16384.** The on-disk layer hardcodes that page
size in every file seek, so a persisted table with any other one reads and writes the wrong
pages and corrupts its files. `emit` throws rather than writing that combination — the only rule
it enforces instead of leaving to the macro, because this one costs data rather than a
compile error.

## Releasing

`0.1.0` was published by hand, because npm requires a package to exist before a trusted
publisher can be configured. Everything after it comes from CI over OIDC, with no token in the
repository and none on anybody's machine.

A release is deliberate: bump the version in `package.json`, push to `master`, and
`.github/workflows/release.yml` ships it. Pushing without a bump publishes nothing.

## Licence

Dual [Apache-2.0](LICENSE-APACHE) / [MIT](LICENSE-MIT). Contributions are taken under both.
