/**
 * The `worktable!` schema language, as data.
 *
 * A mirror of `worktable_dsl`'s model (`dsl/src/schema/mod.rs` and `dsl/src/model/` in
 * [WorkTable](https://github.com/pathscale/WorkTable)). Field names and shapes match the Rust
 * types so that a schema serialised there with its `serde` feature deserialises here without a
 * mapping layer, and so that a divergence shows up as a type error rather than as text that
 * looks right.
 *
 * Nothing here describes a *file*. A schema is a description of a table, and comments,
 * whitespace and declaration formatting never reach it — the Rust parser is token-based, so
 * they are gone before a model exists. What round-trips is meaning.
 */

/**
 * The physical implementation of an index.
 *
 * `worktables_index` is the default and is never written by the emitter: writing a default back
 * out would be correct and noisy, and this text is read by people.
 *
 * `congee` and `arctic` require `persist` to be stated explicitly. Both can be persisted; the
 * macro simply will not pick a default for them. See {@link Persistence}.
 */
export type IndexBackend = "WorktablesIndex" | "Indexset" | "Congee" | "Arctic";

/**
 * The spelling each backend has in the declaration text.
 *
 * The wire form and the written form differ: `serde` gives the Rust variant name, and the
 * grammar takes a lowercase identifier. Both are here so neither has to be guessed, and the
 * type is the wire form because that is the one a caller receives rather than writes.
 */
export const INDEX_BACKEND_DSL_NAME: Readonly<Record<IndexBackend, string>> = {
  WorktablesIndex: "worktables_index",
  Indexset: "indexset",
  Congee: "congee",
  Arctic: "arctic",
};

/** The backends that require {@link Schema.persist} to be stated rather than omitted. */
export const REQUIRES_EXPLICIT_PERSISTENCE: readonly IndexBackend[] = ["Congee", "Arctic"];

export const DEFAULT_INDEX_BACKEND: IndexBackend = "WorktablesIndex";

/**
 * Whether persistence was selected, and whether it was selected at all.
 *
 * Three states, not a boolean. "Not stated" is distinct from "stated false": the macro requires
 * the choice to be stated before it will accept `congee` or `arctic`, so an emitter that turned
 * `Omitted` into `persist: false` would silently answer a question the author left open.
 */
export type Persistence = "Omitted" | "MemoryOnly" | "Persisted";

/**
 * The primary-key generator. Meaningful only on a primary-key column, and shared by every
 * column of a composite key.
 */
export type GeneratorType = "None" | "Autoincrement" | "Custom";

/** A column: `name: Type [primary_key [autoincrement|custom]] [optional] [using backend]`. */
export interface ColumnSpec {
  name: string;
  /**
   * The type as written, with any `optional` wrapper removed. The grammar accepts a single
   * identifier here, so this is never a path and never a generic.
   */
  ty: string;
  /** Whether `optional` was written, making the field `Option<ty>`. */
  optional?: boolean;
  primary_key?: boolean;
  /** Only meaningful when `primary_key` is set. Defaults to `"None"`. */
  generator?: GeneratorType;
  /**
   * The primary index backend. Present on primary-key columns, carrying the declared backend
   * or the default when `using` was omitted; absent elsewhere, because `using` on a non-key
   * column is a parse error.
   */
  index_backend?: IndexBackend | null;
}

/** A secondary index: `name: column [unique] [using backend]`. */
export interface IndexSpec {
  name: string;
  /** The column it is built over. */
  column: string;
  unique?: boolean;
  backend?: IndexBackend | null;
}

/**
 * The `partition_by` key.
 *
 * Not a column: it is stored once per partition rather than once per row, and no query can name
 * it. `ty` is an unsigned integer type.
 */
export interface PartitionKeySpec {
  name: string;
  ty: string;
}

/** One generated query: `Name(columns) by key`. */
export interface OperationSpec {
  name: string;
  /** Columns the query touches. Empty for a delete. */
  columns: string[];
  /** The column the query selects rows by. */
  by: string;
}

/**
 * The `queries` block.
 *
 * An empty block and an absent one are the same thing to the macro, so the emitter writes
 * neither.
 */
export interface QueriesSpec {
  updates?: OperationSpec[];
  deletes?: OperationSpec[];
  in_place?: OperationSpec[];
}

/** The `config` block. */
export interface ConfigSpec {
  /**
   * Page size in bytes.
   *
   * Cannot be combined with `persist: "Persisted"` unless it is exactly 16384: the on-disk
   * layer hardcodes that page size in every file seek, so a persisted table with any other one
   * reads and writes the wrong pages and corrupts its files. Custom page sizes remain available
   * for in-memory tables, where they only size index nodes. See {@link DATA_BUCKET_PAGE_SIZE}.
   */
  page_size?: number | null;
  /** Extra derives placed on the generated row type. */
  row_derives?: string[];
}

/** The only page size a persisted table may state. */
export const DATA_BUCKET_PAGE_SIZE = 16384;

/** One `worktable!` declaration. */
export interface Schema {
  /**
   * The table name, as written. This becomes a Rust type name, so it is `UpperCamel` by
   * convention, and the parser does not enforce that.
   */
  name: string;
  /**
   * Schema version. Absent in a declaration means 1, and the model stores the resolved value
   * rather than the absence, because a consumer comparing an on-disk version against a declared
   * one wants a number either way. The emitter always writes it.
   */
  version: number;
  /** Defaults to `"Omitted"`. */
  persist?: Persistence;
  partition_by?: PartitionKeySpec | null;
  /** Columns in declaration order. */
  columns: ColumnSpec[];
  /** Secondary indexes in declaration order. */
  indexes?: IndexSpec[];
  queries?: QueriesSpec;
  config?: ConfigSpec;
}
