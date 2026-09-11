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
 * `arctic` is the default and is never written by the emitter: writing a default back
 * out would be correct and noisy, and this text is read by people.
 *
 * `congee` requires `persist` to be stated explicitly: it can be persisted, and the macro
 * simply will not pick a default for it.
 *
 * `fxhash` is the one backend that is not an ordered tree. It is accepted only on a `vec: true`
 * table and refused on a paged one, because a paged table generates a range select per index
 * and writes each persisted index to disk as sorted pages, and a hash map can do neither. A
 * table using it gets no range methods at all. The emitter carries it because the grammar does;
 * whether a given declaration may use it is the macro's rule to enforce, not this type's.
 *
 * Arctic was on the explicit-persistence list once and is not any more: it became the default,
 * and a default that forced every table to state persistence would make the common declaration
 * illegal. See {@link Persistence}.
 */
export type IndexBackend = "WorktablesIndex" | "Indexset" | "Congee" | "FxHash" | "Arctic";

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
  FxHash: "fxhash",
  Arctic: "arctic",
};

/**
 * The backends that require {@link Schema.persist} to be stated rather than omitted.
 *
 * Congee alone. Arctic was on this list and is no longer: it became the default backend, and a
 * default that forced every table to state persistence would make the common declaration
 * illegal.
 */
export const REQUIRES_EXPLICIT_PERSISTENCE: readonly IndexBackend[] = ["Congee"];

/**
 * The backend a column gets when it does not name one.
 *
 * **This is `Arctic`, not `WorktablesIndex`.** The default changed in WorkTable and this
 * constant did not follow, so the emitter wrote `using arctic` on every single-column key,
 * which the Rust emitter omits, and omitted `using worktables_index` on every composite key,
 * which the Rust emitter writes. Both texts parse; neither matched, and the corpus test failed
 * on all 121 declarations.
 *
 * A composite key is the reason the rule cannot be "write nothing when unset": Arctic's native
 * key contract cannot represent tuples, so a composite declaration with no `using` retains
 * `WorktablesIndex` rather than becoming invalid because a global default moved. That is not
 * the default, so it is written.
 */
export const DEFAULT_INDEX_BACKEND: IndexBackend = "Arctic";

/**
 * Whether persistence was selected, and whether it was selected at all.
 *
 * Three states, not a boolean. "Not stated" is distinct from "stated false": the macro requires
 * the choice to be stated before it will accept `congee` or `arctic`, so an emitter that turned
 * `Omitted` into `persist: false` would silently answer a question the author left open.
 */
export type Persistence = "Omitted" | "MemoryOnly" | "Persisted";

/**
 * Which storage a table has.
 *
 * `"Paged"` is pages behind links, which is what a `worktable!` has always been. `"Vec"` is one
 * contiguous `Vec<Row>` and an index of positions into it, declared as `vec: true`, and it pays
 * for none of the paging, archived rows, lock map, change-data-capture or async surface.
 *
 * The grammar spells it as a boolean and the model carries an enum, deliberately: the schema is
 * serialized and round-tripped, and serde enforces no cross-field invariant, so one enum saying
 * one thing is safer than two flags that could disagree.
 *
 * Absent means `"Paged"`, and the emitter does not write it, for the same reason it does not
 * write a default index backend: `vec: false` is what every declaration written before the key
 * existed meant.
 */
export type Storage = "Paged" | "Vec";

/**
 * How many rows one partition holds, written as an index width.
 *
 * Required beside `partition_by` and never meaningful without it. A type rather than a count
 * because it is an index width, which is what the generator needs, and because a count is not a
 * power of two and duplicates a constant that lives in the caller's code and will drift.
 *
 * `"bool"` is 2 rows, `"u8"` is 256 and `"u16"` is 65,536, and each generates a partition
 * addressed by position with no primary index at all. `"u32"` and `"u64"` are unbounded in
 * practice and generate a full table per partition, which is what a partitioned declaration got
 * before this key existed. There is no `unbounded` keyword: the widths run out of smallness, so
 * `"u64"` is the escape.
 */
export type PartitionMaxSize = "bool" | "u8" | "u16" | "u32" | "u64";

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
  /** The `columnar(...)` options, when the column declared them. */
  columnar?: ColumnarSpec | null;
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
  /**
   * The declared `partition_max_size`.
   *
   * Not optional, because the key it belongs to is not: emitting a `partition_by` without it
   * produces text the Rust parser refuses.
   */
  max_size: PartitionMaxSize;
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
  /**
   * The profile named by `update runtime <profile>:`, when written.
   *
   * Unresolved on purpose: the grammar accepts any identifier here and codegen currently
   * ignores it, so this carries the text rather than a validated choice. Dropping it would
   * still lose what the author wrote.
   */
  update_runtime?: string | null;
  /** The profile named by `delete runtime <profile>:`, when written. */
  delete_runtime?: string | null;
  /** The profile named by `in_place runtime <profile>:`, when written. */
  in_place_runtime?: string | null;
}

/** The `config` block. */
export interface ConfigSpec {
  /**
   * Page size in bytes.
   *
   * Combines with `persist: "Persisted"` at any size. It did not: the on-disk layer used to
   * hardcode 16384 in every file seek, so a persisted table with any other page size read and
   * wrote the wrong pages. The page stride is tunable now, and WorkTable carries a test that
   * asserts the file lengths a half-size page produces, so refusing to write one would refuse a
   * declaration the macro accepts. See {@link DATA_BUCKET_PAGE_SIZE} for the default.
   */
  page_size?: number | null;
  /** Extra derives placed on the generated row type. */
  row_derives?: string[];
  /**
   * `columnar_slot_id`, when it differs from the default.
   *
   * The written form is the Rust type name, `ColumnSlotId32` and so on, not a lowercase
   * identifier: the grammar takes the type here. Absent means the default, because the Rust
   * side stores the difference rather than the resolved value, and emitting a default nobody
   * wrote is noise.
   */
  columnar_slot_id?: string | null;
  /** `columnar_chunk_rows`, when it differs from the default. */
  columnar_chunk_rows?: number | null;
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
  /**
   * Which storage the table has. Absent means `"Paged"`, and the emitter does not write a
   * default.
   */
  storage?: Storage;
  /** Defaults to `"Omitted"`. */
  persist?: Persistence;
  partition_by?: PartitionKeySpec | null;
  /** Columns in declaration order. */
  columns: ColumnSpec[];
  /** Secondary indexes in declaration order. */
  indexes?: IndexSpec[];
  queries?: QueriesSpec;
  config?: ConfigSpec;
  /**
   * The runtime the table is built against.
   *
   * Absent means the default, and the emitter does not write a default: an omitted `runtime`
   * and an explicit `runtime: nagoya` are the same table.
   */
  runtime?: RuntimeBackend;
  /**
   * Columnar indexes in declaration order.
   *
   * A table with columnar fields but no clustering is legal, so an empty list and an absent
   * one are the same thing and neither is written.
   */
  columnar_indexes?: ColumnarIndexSpec[];
}

/**
 * A nagoya pool flavor.
 *
 * The wire form is the Rust variant name; the grammar takes the snake_case spelling.
 */
export type Flavor = "Locality" | "Spread" | "Throughput" | "LowLatency" | "WideInjector" | "SharedSlot";

export const FLAVOR_DSL_NAME: Readonly<Record<Flavor, string>> = {
  Locality: "locality",
  Spread: "spread",
  Throughput: "throughput",
  LowLatency: "low_latency",
  WideInjector: "wide_injector",
  SharedSlot: "shared_slot",
};

export const DEFAULT_FLAVOR: Flavor = "Locality";

/**
 * The runtime a table is built against.
 *
 * **A tagged union, not a string.** `Nagoya` carries a {@link Flavor} and `Tokio` does not, so
 * serde writes `{ "Nagoya": "SharedSlot" }` for the first and `"Tokio"` for the second. Modelling
 * it as a plain string emits `runtime: undefined` for every table, which is what it did.
 */
export type RuntimeBackend = { Nagoya: Flavor } | "Tokio";

export const DEFAULT_RUNTIME_BACKEND: RuntimeBackend = { Nagoya: DEFAULT_FLAVOR };

/** Whether two runtime selections are the same table. */
export function sameRuntime(left: RuntimeBackend, right: RuntimeBackend): boolean {
  if (left === "Tokio" || right === "Tokio") {
    return left === right;
  }
  return left.Nagoya === right.Nagoya;
}

/**
 * The declaration spelling.
 *
 * The flavor is written even when it is the default one: this is only reached for a backend
 * that is not the default overall, and a reader comparing two declarations should not have to
 * know which flavor a bare `nagoya` means.
 */
export function runtimeToDsl(backend: RuntimeBackend): string {
  return backend === "Tokio" ? "tokio" : `nagoya(${FLAVOR_DSL_NAME[backend.Nagoya]})`;
}

/**
 * A column's `columnar(...)` options.
 *
 * Present means the column declared `columnar`, with or without options. Absent options stay
 * absent rather than being defaulted: `columnar` and `columnar(chunk_rows(2))` are different
 * declarations, and the second is not the first plus a default.
 */
export interface ColumnarSpec {
  /** `chunk_rows(n)`, when written. */
  chunk_rows?: number | null;
  /** `compression(name)`, when it differs from the default. */
  compression?: string | null;
}

/** A columnar index: `name: { cluster_by: [field, ..] }`. */
export interface ColumnarIndexSpec {
  name: string;
  /** The fields it clusters by, in declaration order. */
  cluster_by: string[];
}
