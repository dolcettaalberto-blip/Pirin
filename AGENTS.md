<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:git-push-rule -->
# Git push: use Desktop Commander only

This repo has two possible execution paths from Claude: the Desktop Commander MCP
(runs on this Mac, zsh, git credential.helper = osxkeychain, already authenticated
to GitHub) and the remote-devices device_bash Linux VM bridge (a separate sandboxed
environment with no GitHub credentials configured).

Always commit and push through Desktop Commander (start_process / interact_with_process).
device_bash can read/edit files in this mounted folder fine, but `git push` from it
fails with "could not read Username for 'https://github.com'" — and because `git
fetch` over HTTPS to this private repo also needs auth, a device_bash session can
silently work from a stale local main and diverge from what actually got pushed
elsewhere. That happened on 2026-09-23 (two same-day "briefing" commits built on
different bases) and had to be reconciled with a merge (e3f3659).

Before pushing, always `git fetch origin` and compare `git log --oneline -3
origin/main` against local main first. If they have diverged, merge (-X ours favors
the local/newer coaching update on conflicts) rather than force-pushing.
<!-- END:git-push-rule -->
