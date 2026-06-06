#!/usr/bin/env bash
# ci_sync_logic.sh
# Category: CI / Fork Sync Logic
#
# Contains the pure decision logic for the Fork Sync Workflow, separated from
# git commands so it can be tested independently.
#
# Inputs (environment variables):
#   FETCH_OK    "1" if upstream was fetched successfully, "0" otherwise
#   BRANCH_OK   "1" if upstream branch exists, "0" otherwise
#   BEHIND      Number of commits fork is behind upstream (integer)
#   AHEAD       Number of local commits not in upstream (integer)
#   MERGE_OK    "1" if fast-forward merge succeeded, "0" if it diverged
#   DEFAULT_BRANCH  Branch name (default: "master")
#
# Exit codes:
#   0   Success or skipped-with-warning (Scenarios 1, 2, 3)
#   1   Error — manual action required (Scenarios 4, 5)

FETCH_OK="${FETCH_OK:-1}"
BRANCH_OK="${BRANCH_OK:-1}"
BEHIND="${BEHIND:-0}"
AHEAD="${AHEAD:-0}"
MERGE_OK="${MERGE_OK:-1}"
UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/PublicAffairs/tg-transcribot.git}"
DEFAULT_BRANCH="${DEFAULT_BRANCH:-master}"

# ── Scenario 5: upstream unreachable / not a fork ─────────────────────────────
if [ "$FETCH_OK" != "1" ]; then
  echo "::error::Could not fetch upstream repository at $UPSTREAM_URL."
  echo "::error::This repository may not be a fork of PublicAffairs/tg-transcribot, or the upstream repo may be unavailable."
  echo ""
  echo "  To resolve:"
  echo "  1. Make sure this repository is a fork of https://github.com/PublicAffairs/tg-transcribot"
  echo "  2. Alternatively, disable this workflow in .github/workflows/sync.yml"
  exit 1
fi

if [ "$BRANCH_OK" != "1" ]; then
  echo "::error::Upstream branch '$DEFAULT_BRANCH' was not found."
  echo "::error::The upstream repository structure may have changed."
  exit 1
fi

# ── Scenario 1: already up to date ────────────────────────────────────────────
if [ "$BEHIND" = "0" ]; then
  echo "✅ Already up to date with upstream. Nothing to sync."
  exit 0
fi
echo "$BEHIND new commit(s) found in upstream."

# ── Scenario 3: local commits ahead of upstream ───────────────────────────────
if [ "$AHEAD" != "0" ]; then
  echo "::warning::This fork has $AHEAD local commit(s) that are not in upstream."
  echo "::warning::Automatic sync is skipped to prevent overwriting your changes."
  echo ""
  echo "  To manually sync, run:"
  echo "    git fetch upstream"
  echo "    git merge upstream/$DEFAULT_BRANCH"
  echo "  Resolve any conflicts, then push."
  exit 0
fi

# ── Scenario 2 / 4: fast-forward merge result ─────────────────────────────────
if [ "$MERGE_OK" = "1" ]; then
  echo "✅ Fork successfully synced with upstream ($BEHIND commit(s) applied)."
  exit 0
else
  echo "::error::Fast-forward merge failed. Your fork has diverged from upstream."
  echo "::error::Automatic sync is not possible without risking data loss."
  echo ""
  echo "  To resolve manually:"
  echo "    git fetch upstream"
  echo "    git rebase upstream/$DEFAULT_BRANCH   # or: git merge upstream/$DEFAULT_BRANCH"
  echo "    git push origin $DEFAULT_BRANCH --force-with-lease"
  exit 1
fi
