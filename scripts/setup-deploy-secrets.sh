#!/usr/bin/env bash
# Run on YOUR LAPTOP (needs the GitHub CLI `gh`, logged in as the repo owner).
#
#   bash scripts/setup-deploy-secrets.sh [LAB_IP]
#
# 1. Creates the deploy secrets POSTGRES_PASSWORD and JWT_SECRET with random
#    values, but only if they do not exist yet (Postgres keeps the password it
#    was first created with, so never change it casually).
# 2. Sets the variable CLIENT_ORIGIN to http://<LAB_IP>:8080.
# 3. Prints the one command to run on the lab PC, with a fresh runner
#    registration token (valid for 1 hour).
#
# Secret values are piped straight into GitHub and never printed.
set -euo pipefail

REPO="danit-x/Queueless"
LAB_IP="${1:-10.50.80.174}"
PORT="8080"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"

command -v gh >/dev/null || { echo "Install the GitHub CLI first: https://cli.github.com"; exit 1; }
command -v openssl >/dev/null || { echo "openssl is missing"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Run 'gh auth login' first"; exit 1; }

existing="$(gh secret list --repo "$REPO" --json name --jq '.[].name')"

set_secret_if_missing() {
  local name="$1" bytes="$2"
  if printf '%s\n' "$existing" | grep -qx "$name"; then
    echo "  $name already exists - kept as is"
  else
    openssl rand -hex "$bytes" | gh secret set "$name" --repo "$REPO"
    echo "  $name created (random value, not shown)"
  fi
}

echo "==> Secrets"
set_secret_if_missing POSTGRES_PASSWORD 24
set_secret_if_missing JWT_SECRET 32

echo "==> Variables"
gh variable set CLIENT_ORIGIN --repo "$REPO" --body "http://${LAB_IP}:${PORT}"
echo "  CLIENT_ORIGIN = http://${LAB_IP}:${PORT}"

echo "==> Runner registration token"
TOKEN="$(gh api -X POST "repos/${REPO}/actions/runners/registration-token" --jq .token)"

cat <<EOF

Now run this on the lab PC (${LAB_IP}) within 1 hour:

  curl -fsSL https://raw.githubusercontent.com/${REPO}/${BRANCH}/scripts/lab-runner-setup.sh -o lab-runner-setup.sh
  bash lab-runner-setup.sh ${TOKEN}

EOF
