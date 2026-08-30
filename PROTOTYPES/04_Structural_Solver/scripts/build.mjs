import { readdir, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { join, relative, dirname } from "node:path";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const tests = process.argv.includes("--tests");
const output = join(root, tests ? ".test-dist" : "dist");

const compileTree = async (input, outputRoot, relativeRoot = input) => {
  for (const entry of await readdir(input, { withFileTypes: true })) {
    const source = join(input, entry.name);
    if (entry.isDirectory()) {
      await compileTree(source, outputRoot, relativeRoot);
      continue;
    }
    if (!entry.name.endsWith(".ts")) continue;
    const target = join(outputRoot, relative(relativeRoot, source).replace(/\.ts$/, ".js"));
    const typeScript = await readFile(source, "utf8");
    const javaScript = stripTypeScriptTypes(typeScript, {
      mode: "transform",
      sourceMap: true,
      sourceUrl: source,
    });
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, javaScript, "utf8");
  }
};

await rm(output, { recursive: true, force: true });
if (tests) {
  await compileTree(join(root, "src"), join(output, "src"));
  await compileTree(join(root, "tests"), join(output, "tests"));
} else {
  await compileTree(join(root, "src"), output);
}
console.log(`Built ${tests ? "test" : "browser"} modules with Node's TypeScript transform.`);
