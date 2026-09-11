/** Build the authoritative grammar without resolving WorkTable's storage workspace. */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const RS = resolve(process.env.WORKTABLE_RS ?? new URL("../../WorkTable/", import.meta.url).pathname);
const target = new URL("../target/", import.meta.url).pathname;
mkdirSync(target, { recursive: true });
const isolated = mkdtempSync(join(target, "rust-grammar-"));
let buildTarget: string;
try {
  try {
    cpSync(join(RS, "dsl", "src"), join(isolated, "src"), { recursive: true });
    const manifest = readFileSync(join(RS, "dsl", "Cargo.toml"), "utf8");
    writeFileSync(join(isolated, "Cargo.toml"), `${manifest}\n[workspace]\n`);
  } catch (error) {
    throw new Error(`Cannot read the authoritative grammar from ${RS}/dsl. Set WORKTABLE_RS to the matching WorkTable checkout.`, { cause: error });
  }

  // Different grammar revisions must not overwrite each other's executables.
  const identity = new Bun.CryptoHasher("sha256");
  for (const file of [...new Bun.Glob("**/*").scanSync({ cwd: isolated, onlyFiles: true })].sort()) {
    identity.update(file).update("\0").update(readFileSync(join(isolated, file)));
  }
  buildTarget = join(target, "rust-cli-build", identity.digest("hex"));
  const build = Bun.spawn([
    "cargo", "build", "--quiet", "--manifest-path", join(isolated, "Cargo.toml"),
    "--target-dir", buildTarget, "--features", "json", "--bins",
  ], {
    cwd: isolated,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, PATH: `/opt/homebrew/opt/rustup/bin:${process.env.PATH}` },
  });
  const [out, err, code] = await Promise.all([
    new Response(build.stdout).text(), new Response(build.stderr).text(), build.exited,
  ]);
  if (code !== 0) {
    throw new Error(`The authoritative Rust grammar failed to build (exit ${code}). This test cannot be skipped.\n${out}${err}`);
  }
} finally {
  // Only this invocation's source staging is removed, including after failure.
  rmSync(isolated, { recursive: true, force: true });
}

const suffix = process.platform === "win32" ? ".exe" : "";
export const rustBinary = (name: "wt-dsl" | "worktable-schemas"): string => join(buildTarget, "debug", name + suffix);
