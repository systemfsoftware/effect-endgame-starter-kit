failures=0
pass() { printf 'ok   %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1"; failures=$((failures + 1)); }

alive=SANDBOX-PROOF-ALIVE

refused() {
  local name="$1"
  shift
  local out status=0
  out="$("$@" 2>/dev/null)" || status=$?
  if [ "$status" -ne 0 ] && printf '%s\n' "$out" | grep -qx "$alive"; then pass "$name"; else fail "$name"; fi
}

allowed() {
  local name="$1"
  shift
  local out status=0
  out="$("$@")" || status=$?
  if [ "$status" -eq 0 ] && printf '%s\n' "$out" | grep -qx "$alive"; then pass "$name"; else fail "$name"; fi
}

scratch="$(mktemp -d "${TMPDIR:-/tmp}/sandbox-proofs.XXXXXX")"
scratch="$(cd "$scratch" && pwd -P)"
project="$scratch/project"
outside="$scratch/outside"
mkdir -p "$project" "$outside" "$HOME/.ssh" "$HOME/.config"
ssh_canary="$HOME/.ssh/sandbox-proof-canary"
config_canary="$HOME/.config/sandbox-proof-canary"
echo secret > "$ssh_canary"
echo secret > "$config_canary"
cleanup() { rm -rf "$scratch" "$ssh_canary" "$config_canary"; }
trap cleanup EXIT
git -C "$project" init -q
cd "$project"

refused "reading ~/.ssh is refused" \
  sandbox -- sh -c "echo $alive; cat '$ssh_canary'"
refused "reading ~/.config is refused" \
  sandbox -- sh -c "echo $alive; cat '$config_canary'"

refused "writing outside the project is refused" \
  sandbox -- sh -c "echo $alive; echo escaped > '$outside/written'"
if [ -e "$outside/written" ]; then fail "nothing lands outside the project"; else pass "nothing lands outside the project"; fi

allowed "the project directory is writable" \
  sandbox -- sh -c "echo inside > written && echo $alive"
if [ "$(cat "$project/written" 2>/dev/null)" = inside ]; then pass "project writes reach the host"; else fail "project writes reach the host"; fi

allowed "the environment is cleared to the pass-list" \
  env SSH_AUTH_SOCK=/tmp/agent.sock GPG_AGENT_INFO=/tmp/gpg PROOF_SECRET=leaked \
  sandbox -- sh -c '[ -z "${SSH_AUTH_SOCK:-}${GPG_AGENT_INFO:-}${PROOF_SECRET:-}" ] && echo '"$alive"

refused "an undeclared outbound connection is refused" \
  sandbox -- sh -c "echo $alive; curl -ksS --max-time 15 -o /dev/null https://example.com"

allowed "a declared host is reachable" \
  sandbox --allow-host example.com -- sh -c "curl -sS --max-time 15 -o /dev/null https://example.com && echo $alive"

refused "a declared allow-list refuses every other host" \
  sandbox --allow-host example.com -- sh -c "echo $alive; curl -ksS --max-time 15 -o /dev/null https://github.com"

allowed "loopback serves a local dev server" \
  sandbox -- sh -c 'node -e "require(\"node:http\").createServer((q, s) => s.end(\"'"$alive"'\")).listen(4321, \"127.0.0.1\")" & sleep 1; curl -sS --max-time 5 http://127.0.0.1:4321; echo; kill $!'

if [ "$failures" -gt 0 ]; then
  echo "$failures sandbox proof(s) failed" >&2
  exit 1
fi
