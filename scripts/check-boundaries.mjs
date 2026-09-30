// Fails if packages/schemas stops being framework-independent.
// Allowed runtime dependency: zod. Forbidden imports: frameworks, UI, Node built-ins, other workspace packages.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const pkgDir = join(root, "packages/schemas");
const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));

const ALLOWED_DEPS = new Set(["zod"]);
const problems = [];

for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
  for (const dep of Object.keys(pkg[field] ?? {})) {
    if (!ALLOWED_DEPS.has(dep)) problems.push(`${field} contains "${dep}" (only ${[...ALLOWED_DEPS].join(", ")} allowed)`);
  }
}

const FORBIDDEN = /^(next|react|react-dom|server-only|@investment-app\/|node:|fs$|path$|http$|https$|child_process$)/;
const importRe = /(?:import|export)\s[^'"]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) {
      const source = readFileSync(path, "utf8");
      for (const m of source.matchAll(importRe)) {
        const spec = m[1] ?? m[2] ?? m[3] ?? m[4];
        if (spec && FORBIDDEN.test(spec)) problems.push(`${path.slice(root.length)} imports "${spec}"`);
      }
    }
  }
}
walk(join(pkgDir, "src"));

if (problems.length > 0) {
  console.error("packages/schemas boundary violations:\n" + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
console.log("packages/schemas is framework-independent (runtime deps: zod only; no framework/Node imports).");
