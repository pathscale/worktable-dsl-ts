/**
 * Packs the tarball, installs it into a throwaway consumer, and emits a schema through it.
 *
 * `bun test` exercises the source tree; this exercises what actually ships. The two differ in
 * ways that only ever bite a consumer: a file missing from `files`, an export map that does not
 * resolve, a relative import that kept its `.ts` extension, a type exported from a module the
 * build did not emit.
 *
 * It compares bytes rather than checking that the import succeeded, for the same reason the
 * cross-implementation tests do: a package that loads and emits something slightly different
 * is the failure that reaches a user.
 */

import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REFERENCE = `name: Users,
version: 1,
persist: false,
columns: {
    id: u64 primary_key autoincrement,
    nickname: String optional,
},
indexes: {
    by_nickname: nickname unique,
},
config: {
    page_size: 4096,
    row_derives: Clone,
}
`;

// Deliberately reaches for a type, a value export and the emitter, so a build that dropped any
// one of them fails here rather than in somebody's editor.
const CONSUMER = `import { emit, DEFAULT_INDEX_BACKEND, type Schema } from "@pathscale/worktable-dsl";
if (DEFAULT_INDEX_BACKEND !== "WorktablesIndex") {
  throw new Error("the shipped package disagrees about the default backend");
}
const schema: Schema = {
  name: "Users",
  version: 1,
  persist: "MemoryOnly",
  columns: [
    { name: "id", ty: "u64", primary_key: true, generator: "Autoincrement" },
    { name: "nickname", ty: "String", optional: true },
  ],
  indexes: [{ name: "by_nickname", column: "nickname", unique: true }],
  config: { page_size: 4096, row_derives: ["Clone"] },
};
process.stdout.write(emit(schema));
`;

const run = async (cmd: string[], cwd: string) => {
  const p = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  if (code !== 0) {
    console.error(`${cmd.join(" ")} failed:\n${err}`);
    process.exit(1);
  }
  return out;
};

const here = new URL("..", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "worktable-smoke-"));
try {
  await run(["bun", "run", "build"], here);
  await run(["bun", "pm", "pack", "--destination", dir], here);

  // Find the tarball rather than naming it. Hardcoding the version points a release gate at a
  // file that stops existing the moment the version changes, which is exactly the run where a
  // gate must not be the thing that breaks.
  const packed = readdirSync(dir).filter((f) => f.endsWith(".tgz"));
  if (packed.length !== 1) {
    console.error(`expected exactly one tarball in ${dir}, found ${packed.length}`);
    process.exit(1);
  }
  const tarball = join(dir, packed[0]!);

  writeFileSync(join(dir, "package.json"), '{"name":"smoke","private":true,"type":"module"}\n');
  writeFileSync(join(dir, "use.ts"), CONSUMER);
  await run(["bun", "add", tarball], dir);

  const got = await run(["bun", "run", "use.ts"], dir);
  if (got !== REFERENCE) {
    console.error("the shipped package emits different bytes than expected");
    console.error(`--- expected ---\n${REFERENCE}--- got ---\n${got}`);
    process.exit(1);
  }
  console.log("smoke: the packed tarball installs, resolves and emits correctly");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
