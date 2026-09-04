import "server-only";

const API = "https://api.github.com";

export type FileChange = { path: string; content: string | null }; // null = delete

function config(): { token: string; repo: string; branch: string } | null {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO; // "owner/name"
  if (!token || !repo) return null;
  return { token, repo, branch: process.env.GITHUB_BRANCH ?? "main" };
}

export function githubConfigured(): boolean {
  return config() !== null;
}

async function gh<T>(path: string, init?: RequestInit): Promise<T> {
  const cfg = config()!;
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`GitHub ${init?.method ?? "GET"} ${path} -> ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/**
 * Commit several files in a single commit on the configured branch, so a plan
 * update either lands whole or not at all (Railway redeploys off this push).
 * Returns the commit URL.
 */
export async function commitFiles(args: {
  changes: FileChange[];
  message: string;
}): Promise<{ sha: string; url: string }> {
  const cfg = config();
  if (!cfg) throw new Error("GitHub writes are not configured (set GITHUB_TOKEN and GITHUB_REPO)");
  const { repo, branch } = cfg;

  const ref = await gh<{ object: { sha: string } }>(`/repos/${repo}/git/ref/heads/${branch}`);
  const headSha = ref.object.sha;
  const headCommit = await gh<{ tree: { sha: string } }>(`/repos/${repo}/git/commits/${headSha}`);

  const tree = await gh<{ sha: string }>(`/repos/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: headCommit.tree.sha,
      tree: args.changes.map((c) =>
        c.content === null
          ? { path: c.path, mode: "100644", type: "blob", sha: null }
          : { path: c.path, mode: "100644", type: "blob", content: c.content }
      ),
    }),
  });

  const commit = await gh<{ sha: string; html_url: string }>(`/repos/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message: args.message, tree: tree.sha, parents: [headSha] }),
  });

  await gh(`/repos/${repo}/git/refs/heads/${branch}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha }),
  });

  return { sha: commit.sha, url: commit.html_url };
}

/** Read a JSON file from the branch HEAD (not the container's deploy snapshot). */
export async function getRepoJson<T>(path: string): Promise<T> {
  const cfg = config();
  if (!cfg) throw new Error("GitHub reads are not configured (set GITHUB_TOKEN and GITHUB_REPO)");
  const file = await gh<{ content: string; encoding: string }>(
    `/repos/${cfg.repo}/contents/${path}?ref=${cfg.branch}`
  );
  return JSON.parse(Buffer.from(file.content, file.encoding as BufferEncoding).toString("utf8")) as T;
}
