// cursor.directory discovery preview — runs cursor.directory's REAL parser
// (vendored ./parse.ts) against the LOCAL working tree, so you see exactly what
// a submission would find without pushing or merging.
//
// parse.ts only ever fetches the default branch over the network (raw + GitHub
// tree API, both pinned to HEAD). We don't reimplement it — we feed it the local
// tree by replacing globalThis.fetch with a shim that serves ONLY those two URL
// shapes from disk and refuses everything else (no network, deny-by-default).
//
// Run with Node >= 22.6 (native TypeScript): node scripts/cursor-preview/preview.mts [repo_root]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseGitHubPlugin, GitHubParseError } from "./parse.ts";

const root = resolve(process.argv[2] ?? ".");

// Files as they WOULD be committed (tracked + untracked-not-ignored), all as
// "blob" — the only type parse.ts cares about. Mirrors the GitHub tree it fetches.
function localTree(): { path: string; type: string }[] {
  const out = execFileSync(
    "git",
    ["-C", root, "ls-files", "--cached", "--others", "--exclude-standard"],
    { encoding: "utf8" },
  );
  return out.split("\n").filter(Boolean).map((path) => ({ path, type: "blob" }));
}

const TREE = /^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+\/git\/trees\/HEAD\?recursive=1$/;
const RAW = /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/HEAD\/(.+)$/;

globalThis.fetch = (async (input: string | URL | Request): Promise<Response> => {
  const url = typeof input === "string" ? input : input.toString();
  if (TREE.test(url)) {
    return { ok: true, status: 200, json: async () => ({ tree: localTree() }) } as unknown as Response;
  }
  const m = RAW.exec(url);
  if (m) {
    try {
      const content = readFileSync(resolve(root, decodeURIComponent(m[1])), "utf8");
      return { ok: true, status: 200, text: async () => content } as unknown as Response;
    } catch {
      return { ok: false, status: 404, text: async () => "" } as unknown as Response;
    }
  }
  throw new Error(`cursor-preview: blocked non-local fetch -> ${url}`);
}) as typeof fetch;

try {
  // repoMeta: null short-circuits parse.ts's only other network call (repo metadata).
  const result = await parseGitHubPlugin("https://github.com/local/preview", { repoMeta: null });

  const byType = new Map<string, number>();
  for (const c of result.components) byType.set(c.type, (byType.get(c.type) ?? 0) + 1);
  const summary = [...byType].map(([t, n]) => `${n} ${t}${n === 1 ? "" : "s"}`).join(", ");

  console.log(`cursor.directory WOULD SUCCEED — ${result.components.length} component(s): ${summary}`);
  for (const c of result.components) console.log(`  [${c.type}] ${c.slug}`);
  process.exit(0);
} catch (e) {
  // parseGitHubPlugin throws GitHubParseError("no_components") on an empty result —
  // the exact failure a live submission hits.
  if (e instanceof GitHubParseError) {
    console.error(`cursor.directory WOULD FAIL:\n  ${e.message}`);
    process.exit(1);
  }
  throw e;
}
