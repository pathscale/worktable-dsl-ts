/**
 * `@pathscale/worktable-dsl` — types and a canonical-text emitter for the `worktable!` schema
 * language.
 *
 * **There is no parser here, and there should not be.** `worktable_dsl` in
 * [WorkTable](https://github.com/pathscale/WorkTable) reads the language and is authoritative.
 * A design tool needs to *write* schemas; a second parser is a second set of semantics to keep
 * in agreement, and the parser is the expensive half of the pair to keep honest.
 *
 * @see https://github.com/pathscale/WorkTable
 */

export { emit, emitMacroInvocation } from "./emit.js";
export {
  DATA_BUCKET_PAGE_SIZE,
  DEFAULT_INDEX_BACKEND,
  DEFAULT_FLAVOR,
  DEFAULT_RUNTIME_BACKEND,
  FLAVOR_DSL_NAME,
  INDEX_BACKEND_DSL_NAME,
  REQUIRES_EXPLICIT_PERSISTENCE,
  runtimeToDsl,
  sameRuntime,
} from "./types.js";
export type * from "./types.js";
