/**
 * The emitter: a {@link Schema} to the text a `worktable!` declaration is written in.
 *
 * Byte-exact, not merely semantically equivalent. The target is `Schema::to_dsl()` in
 * `worktable_dsl` (`dsl/src/schema/emit_dsl.rs`), and `tests/roundtrip.test.ts` compares this
 * output against it character for character. Two emitters can agree on every meaning and still
 * disagree on every character a person reads, and the point of this package is text a person
 * reads.
 *
 * A pure function of its input. No clock, no locale, no environment, no I/O — the same schema
 * emits the same bytes on every machine, which is what makes the comparison meaningful.
 *
 * **The output is the macro body, not the invocation.** The caller decides whether it is going
 * inside `worktable! { .. }`, into a file, or into a diff; {@link emitMacroInvocation} wraps it
 * when the invocation is what is wanted. This mirrors the Rust side exactly, and it is also
 * what `Schema::parse` accepts.
 */

import {
  DEFAULT_INDEX_BACKEND,
  DEFAULT_RUNTIME_BACKEND,
  INDEX_BACKEND_DSL_NAME,
  runtimeToDsl,
  sameRuntime,
  type ColumnSpec,
  type IndexSpec,
  type OperationSpec,
  type Schema,
} from "./types.js";

const INDENT = "    ";

/** Emit the declaration body. The result always ends with a newline. */
export function emit(schema: Schema): string {
  const out: string[] = [];

  out.push(`name: ${schema.name},`);
  out.push(`version: ${schema.version},`);

  // An omitted `persist` is not the same as `persist: false`. The macro requires the choice to
  // be stated before it will accept `congee` or `arctic`, so writing one in would silently
  // answer a question the author left open.
  switch (schema.persist ?? "Omitted") {
    case "Omitted":
      break;
    case "MemoryOnly":
      out.push("persist: false,");
      break;
    case "Persisted":
      out.push("persist: true,");
      break;
  }

  if (schema.partition_by != null) {
    out.push(`partition_by: ${schema.partition_by.name}: ${schema.partition_by.ty},`);
  }

  // An omitted `runtime` and an explicit `runtime: nagoya` are the same table, so the default
  // is not written, for the same reason the default index backend is not.
  if (schema.runtime != null && !sameRuntime(schema.runtime, DEFAULT_RUNTIME_BACKEND)) {
    out.push(`runtime: ${runtimeToDsl(schema.runtime)},`);
  }

  out.push("columns: {");
  for (const column of schema.columns) {
    out.push(`${INDENT}${columnToDsl(column)},`);
  }
  out.push("},");

  const indexes = schema.indexes ?? [];
  if (indexes.length > 0) {
    out.push("indexes: {");
    for (const index of indexes) {
      out.push(`${INDENT}${indexToDsl(index)},`);
    }
    out.push("},");
  }

  const columnarIndexes = schema.columnar_indexes ?? [];
  if (columnarIndexes.length > 0) {
    out.push("columnar_indexes: {");
    for (const index of columnarIndexes) {
      out.push(`${INDENT}${index.name}: {`);
      out.push(`${INDENT}${INDENT}cluster_by: [${index.cluster_by.join(", ")}],`);
      out.push(`${INDENT}},`);
    }
    out.push("},");
  }

  const updates = schema.queries?.updates ?? [];
  const deletes = schema.queries?.deletes ?? [];
  const inPlace = schema.queries?.in_place ?? [];
  if (updates.length + deletes.length + inPlace.length > 0) {
    out.push("queries: {");
    out.push(...queryBlock("update", schema.queries?.update_runtime, updates));
    out.push(...queryBlock("delete", schema.queries?.delete_runtime, deletes));
    out.push(...queryBlock("in_place", schema.queries?.in_place_runtime, inPlace));
    out.push("},");
  }

  // `!= null` throughout: serde writes an absent Option as `null`, so a schema that came from
  // the Rust side carries explicit nulls where a hand-written one omits the key. Both mean the
  // same thing, and treating them differently would emit two texts for one schema.
  const pageSize = schema.config?.page_size;
  const rowDerives = schema.config?.row_derives ?? [];
  const columnarSlotId = schema.config?.columnar_slot_id;
  const columnarChunkRows = schema.config?.columnar_chunk_rows;
  if (pageSize != null || rowDerives.length > 0 || columnarSlotId != null || columnarChunkRows != null) {
    out.push("config: {");
    if (pageSize != null) {
      if (!Number.isInteger(pageSize) || pageSize <= 0) {
        throw new RangeError(`page_size must be a positive integer, got ${pageSize}`);
      }
      out.push(`${INDENT}page_size: ${pageSize},`);
    }
    if (columnarSlotId != null) {
      out.push(`${INDENT}columnar_slot_id: ${columnarSlotId},`);
    }
    if (columnarChunkRows != null) {
      if (!Number.isInteger(columnarChunkRows) || columnarChunkRows <= 0) {
        throw new RangeError(`columnar_chunk_rows must be a positive integer, got ${columnarChunkRows}`);
      }
      out.push(`${INDENT}columnar_chunk_rows: ${columnarChunkRows},`);
    }
    if (rowDerives.length > 0) {
      // `row_derives` reads identifiers until it meets another config key, so it has to be
      // written last of all of them.
      out.push(`${INDENT}row_derives: ${rowDerives.join(", ")},`);
    }
    // No comma. `parse_configs` does not consume one after its block in versions before
    // 1.0.0-beta.17, and emitted text is routinely fed to a macro older than the emitter that
    // wrote it. `config` is emitted last, so nothing needs to follow it.
    out.push("}");
  }

  return `${out.join("\n")}\n`;
}

/** Wrap the body in a `worktable! { .. }` invocation, ready to be written into a Rust file. */
export function emitMacroInvocation(schema: Schema): string {
  const body = emit(schema)
    .split("\n")
    .map((line) => (line === "" ? "" : `${INDENT}${line}`))
    .join("\n");
  return `worktable! {\n${body}}\n`;
}

function columnToDsl(column: ColumnSpec): string {
  let out = `${column.name}: ${column.ty}`;

  // Clause order is the grammar's and is not the order the fields are declared in: the
  // generator binds to `primary_key`, and `optional` follows both.
  if (column.primary_key) {
    out += " primary_key";
    switch (column.generator ?? "None") {
      case "None":
        break;
      case "Autoincrement":
        out += " autoincrement";
        break;
      case "Custom":
        out += " custom";
        break;
    }
  }

  if (column.optional) {
    out += " optional";
  }

  // `columnar`, with only the options that were written. A bare `columnar` and
  // `columnar(chunk_rows(2))` are different declarations and the second is not the first plus
  // a default, so nothing is filled in on the way out.
  if (column.columnar != null) {
    out += " columnar";
    const options: string[] = [];
    const chunkRows = column.columnar.chunk_rows;
    if (chunkRows != null) {
      if (!Number.isInteger(chunkRows) || chunkRows <= 0) {
        throw new RangeError(`chunk_rows must be a positive integer, got ${chunkRows}`);
      }
      options.push(`chunk_rows(${chunkRows})`);
    }
    if (column.columnar.compression != null) {
      options.push(`compression(${column.columnar.compression})`);
    }
    if (options.length > 0) {
      out += `(${options.join(", ")})`;
    }
  }

  // A primary-key column always carries a backend once parsed, because the model fills the
  // default in. Writing the default back out would be correct but noisy, and only a deliberate
  // choice is written.
  if (column.index_backend != null && column.index_backend !== DEFAULT_INDEX_BACKEND) {
    out += ` using ${INDEX_BACKEND_DSL_NAME[column.index_backend]}`;
  }

  return out;
}

function indexToDsl(index: IndexSpec): string {
  let out = `${index.name}: ${index.column}`;
  if (index.unique) {
    out += " unique";
  }
  if (index.backend != null && index.backend !== DEFAULT_INDEX_BACKEND) {
    out += ` using ${INDEX_BACKEND_DSL_NAME[index.backend]}`;
  }
  return out;
}

/**
 * One `update:` / `delete:` / `in_place:` block.
 *
 * `runtime` is the profile named by `update runtime <profile>:`. The grammar accepts any
 * identifier there and codegen currently ignores it, so this writes back what was given rather
 * than validating it. Dropping it would still lose what the author wrote.
 */
function queryBlock(kind: string, runtime: string | null | undefined, operations: OperationSpec[]): string[] {
  if (operations.length === 0) {
    return [];
  }
  const header = runtime != null ? `${kind} runtime ${runtime}` : kind;
  const out = [`${INDENT}${header}: {`];
  for (const operation of operations) {
    out.push(`${INDENT}${INDENT}${operation.name}(${operation.columns.join(", ")}) by ${operation.by},`);
  }
  // No comma after the closing brace, for the same backward-compatibility reason as `config`.
  out.push(`${INDENT}}`);
  return out;
}
