#!/usr/bin/env bash
# Sets up the GitHub Actions self-hosted runner on the lab PC. No sudo needed.
#
# Run on the lab PC as your normal user:
#   bash lab-runner-setup.sh <REGISTRATION_TOKEN>
#
# Get the token from scripts/setup-deploy-secrets.sh (run on your laptop),
# or from GitHub: Settings -> Actions -> Runners -> New self-hosted runner.
# The token is valid for 1 hour. It is only needed the first time.
#
# Safe to run again: every step is skipped if it is already done.
set -euo pipefail

REPO_URL="https://github.com/danit-x/Queueless"
RUNNER_NAME="queueless-lab"
RUNNER_LABELS="queueless-lab"
RUNNER_DIR="$HOME/actions-runner"
TOKEN="${1:-}"

step() { printf '\n==> %s\n' "$*"; }
ok()   { printf '    OK: %s\n' "$*"; }
fail() { printf '    ERROR: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- 1. checks
step "1/5 Checking this PC"
[ "$(id -u)" -ne 0 ] || fail "Do not run this with sudo or as root. Run it as your normal user."
for cmd in curl tar git docker crontab; do
  command -v "$cmd" >/dev/null 2>&1 || fail "'$cmd' is not installed. Ask the lab admin."
done
docker ps >/dev/null 2>&1 \
  || fail "Your user cannot use Docker (permission denied). Ask the lab admin to add you to the 'docker' group, then log out and back in."
docker compose version >/dev/null 2>&1 || fail "'docker compose' plugin is missing. Ask the lab admin."
ok "Docker, Compose, Git and curl work for user '$USER'"

case "$(uname -m)" in
  x86_64)  ARCH="x64" ;;
  aarch64) ARCH="arm64" ;;
  *) fail "Unsupported CPU type $(uname -m)" ;;
esac

# -------------------------------------------------------------- 2. download
step "2/5 Downloading the runner into $RUNNER_DIR"
mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"
if [ -x ./config.sh ]; then
  ok "Already downloaded"
else
  RELEASE_JSON="$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest)"
  VERSION="$(printf '%s' "$RELEASE_JSON" | grep -m1 '"tag_name"' | sed -E 's/.*"v([^"]+)".*/\1/')"
  [ -n "$VERSION" ] || fail "Could not find the latest runner version (GitHub API rate limit?). Try again in a few minutes."
  FILE="actions-runner-linux-${ARCH}-${VERSION}.tar.gz"
  curl -fL -o "$FILE" "https://github.com/actions/runner/releases/download/v${VERSION}/${FILE}"

  # Verify the download against the checksum published in the release notes.
  EXPECTED="$(printf '%s' "$RELEASE_JSON" | grep -o "BEGIN SHA linux-${ARCH} -->[0-9a-f]*" | sed 's/.*-->//')"
  if [ -n "$EXPECTED" ]; then
    echo "${EXPECTED}  ${FILE}" | sha256sum -c - >/dev/null || fail "Checksum mismatch for $FILE. Delete it and run again."
    ok "Checksum verified"
  else
    echo "    WARNING: no checksum found in release notes; skipping verification"
  fi
  tar xzf "$FILE"
  rm -f "$FILE"
  ok "Runner v$VERSION downloaded"
fi

# ------------------------------------------------------------- 3. configure
step "3/5 Registering the runner with GitHub"
if [ -f .runner ]; then
  ok "Already registered"
else
  [ -n "$TOKEN" ] || fail "No token given. Usage: bash $0 <REGISTRATION_TOKEN>"
  ./config.sh --url "$REPO_URL" --token "$TOKEN" \
    --name "$RUNNER_NAME" --labels "$RUNNER_LABELS" --unattended --replace
  ok "Registered as '$RUNNER_NAME' (labels: self-hosted, Linux, X64, $RUNNER_LABELS)"
fi

# ----------------------------------------------------------------- 4. start
step "4/5 Starting the runner in the background"
if pgrep -u "$(id -u)" -f "$RUNNER_DIR/bin/Runner.Listener" >/dev/null 2>&1; then
  ok "Already running"
else
  nohup ./run.sh > runner.log 2>&1 &
  sleep 5
  pgrep -u "$(id -u)" -f "$RUNNER_DIR/bin/Runner.Listener" >/dev/null 2>&1 \
    || fail "Runner did not start. Check $RUNNER_DIR/runner.log"
  ok "Running (log: $RUNNER_DIR/runner.log)"
fi

# ------------------------------------------------------- 5. start on reboot
step "5/5 Adding auto-start after reboot (user crontab)"
CRON_LINE="@reboot cd $RUNNER_DIR && nohup ./run.sh > runner.log 2>&1 &"
if crontab -l 2>/dev/null | grep -qF "$RUNNER_DIR && nohup ./run.sh"; then
  ok "Already in crontab"
else
  ( crontab -l 2>/dev/null || true; echo "$CRON_LINE" ) | crontab -
  ok "Added to crontab"
fi

# ------------------------------------------------------------------ summary
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
cat <<EOF

Done. Next:
  - Check GitHub: $REPO_URL/settings/actions/runners  (should show '$RUNNER_NAME' as Idle)
  - The queued deploy will now run: $REPO_URL/actions
  - After it finishes, open http://${IP:-<this-pc-ip>}:8080 and http://${IP:-<this-pc-ip>}:8080/api/health

Useful commands:
  tail -f $RUNNER_DIR/runner.log                    # watch the runner
  pkill -u \$USER -f $RUNNER_DIR/bin/Runner.Listener  # stop it
EOF
