usage() {
  cat >&2 <<'EOF'
usage: sandbox [--allow-host HOST[:PORT]]... [--pass-env NAME]... [--pnpm-store DIR] [--] COMMAND [ARG]...

Runs COMMAND with the project directory read-write, /nix/store read-only, an
empty $HOME, a cleared environment and loopback-only networking. Each
--allow-host opens HTTPS egress to that host (default port 443; "*.example.com"
matches subdomains) through an allow-list proxy; nothing else leaves.
--pnpm-store (default $SANDBOX_PNPM_STORE) resolves pnpm offline from that
read-only store, so pnpm needs no registry.
EOF
  exit 2
}

hosts=()
pnpm_store="${SANDBOX_PNPM_STORE:-}"
pass=(PATH TERM LANG LC_ALL TZ CI NO_COLOR FORCE_COLOR COLORTERM)
while [ $# -gt 0 ]; do
  case "$1" in
    --allow-host) [ $# -ge 2 ] || usage; hosts+=("$2"); shift 2 ;;
    --pass-env) [ $# -ge 2 ] || usage; pass+=("$2"); shift 2 ;;
    --pnpm-store) [ $# -ge 2 ] || usage; pnpm_store="$2"; shift 2 ;;
    --) shift; break ;;
    -h | --help) usage ;;
    -*) usage ;;
    *) break ;;
  esac
done
[ $# -gt 0 ] || usage

project="${SANDBOX_PROJECT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd -P)}"
project="$(cd "$project" && pwd -P)"
cwd="$(pwd -P)"
case "$cwd/" in "$project"/*) ;; *) cwd="$project" ;; esac

work="$(mktemp -d "${TMPDIR:-/tmp}/sandbox.XXXXXX")"
work="$(cd "$work" && pwd -P)"
proxy_pid=""
cleanup() {
  [ -z "$proxy_pid" ] || kill "$proxy_pid" 2>/dev/null || true
  rm -rf "$work"
}
trap cleanup EXIT INT TERM

start_proxy() {
  "@node@" "@egressProxy@" "$1" "$work/proxy.addr" "${hosts[@]}" &
  proxy_pid=$!
  for _ in $(seq 1 100); do
    [ -s "$work/proxy.addr" ] && return 0
    kill -0 "$proxy_pid" 2>/dev/null || break
    sleep 0.05
  done
  echo "sandbox: egress proxy failed to start" >&2
  exit 1
}

envs=(
  HOME=/home/sandbox
  TMPDIR=/tmp
  SSL_CERT_FILE="@caBundle@"
  NIX_SSL_CERT_FILE="@caBundle@"
  NODE_EXTRA_CA_CERTS="@caBundle@"
  SANDBOX=1
  XDG_CACHE_HOME="$project/.cache"
)
for name in "${pass[@]}"; do
  if [ -n "${!name+x}" ]; then envs+=("$name=${!name}"); fi
done
if [ -n "$pnpm_store" ]; then
  store_view="$work/tmp/pnpm-store"
  for layout in "$pnpm_store"/v*; do
    [ -d "$layout" ] || continue
    mkdir -p "$store_view/${layout##*/}"
    for entry in "$layout"/*; do
      if [ "${entry##*/}" = index.db ]; then
        cp "$entry" "$store_view/${layout##*/}/index.db"
        chmod u+w "$store_view/${layout##*/}/index.db"
      else
        ln -s "$entry" "$store_view/${layout##*/}/${entry##*/}"
      fi
    done
  done
  envs+=(
    pnpm_config_store_dir="$store_view"
    pnpm_config_offline=true
    pnpm_config_frozen_lockfile=true
    pnpm_config_trust_lockfile=true
    pnpm_config_ignore_scripts=true
    pnpm_config_package_import_method=clone-or-copy
  )
fi
proxy_url="http://127.0.0.1:3128"
if [ "${#hosts[@]}" -gt 0 ]; then
  envs+=(
    HTTPS_PROXY="$proxy_url" https_proxy="$proxy_url"
    HTTP_PROXY="$proxy_url" http_proxy="$proxy_url"
    "NO_PROXY=localhost,127.0.0.1" "no_proxy=localhost,127.0.0.1"
    NODE_USE_ENV_PROXY=1
  )
fi

case "$(uname -s)" in
  Linux)
    args=(
      --unshare-all --die-with-parent --new-session --cap-drop ALL --clearenv
      --ro-bind /nix/store /nix/store
      --proc /proc --dev /dev --tmpfs /tmp
      --tmpfs /home --dir /home/sandbox
    )
    for path in /usr /bin /lib /lib64 /sbin /run/current-system/sw \
      /etc/passwd /etc/group /etc/hosts /etc/nsswitch.conf /etc/localtime; do
      args+=(--ro-bind-try "$path" "$path")
    done
    args+=(--bind "$project" "$project" --chdir "$cwd")
    if [ -n "${store_view:-}" ]; then args+=(--bind "$store_view" "$store_view"); fi
    for entry in "${envs[@]}"; do args+=(--setenv "${entry%%=*}" "${entry#*=}"); done

    status=0
    if [ "${#hosts[@]}" -gt 0 ]; then
      start_proxy "$work/egress.sock"
      args+=(--ro-bind "$work/egress.sock" /run/egress.sock)
      # shellcheck disable=SC2016
      "@bwrap@" "${args[@]}" -- "@sh@" -c '
        "@socat@" TCP-LISTEN:3128,bind=127.0.0.1,fork,reuseaddr UNIX-CONNECT:/run/egress.sock 2>/dev/null &
        i=0
        until "@socat@" -u /dev/null TCP:127.0.0.1:3128 2>/dev/null || [ "$i" -ge 100 ]; do
          i=$((i + 1))
          "@sleep@" 0.05
        done
        exec "$@"' sandbox "$@" || status=$?
    else
      "@bwrap@" "${args[@]}" -- "$@" || status=$?
    fi
    exit "$status"
    ;;
  Darwin)
    home="$work/home"
    tmp="$work/tmp"
    mkdir -p "$home" "$tmp"
    darwin_envs=()
    for entry in "${envs[@]}"; do
      case "$entry" in
        HOME=*) darwin_envs+=("HOME=$home") ;;
        TMPDIR=*) darwin_envs+=("TMPDIR=$tmp") ;;
        *) darwin_envs+=("$entry") ;;
      esac
    done
    if [ "${#hosts[@]}" -gt 0 ]; then
      start_proxy tcp
      url="http://$(cat "$work/proxy.addr")"
      for index in "${!darwin_envs[@]}"; do
        darwin_envs[index]="${darwin_envs[index]//$proxy_url/$url}"
      done
    fi
    cd "$cwd"
    /usr/bin/sandbox-exec -f "@darwinProfile@" \
      -D PROJECT="$project" -D HOME="$home" -D TMP="$tmp" \
      /usr/bin/env -i "${darwin_envs[@]}" "$@"
    ;;
  *)
    echo "sandbox: unsupported system $(uname -s)" >&2
    exit 1
    ;;
esac
