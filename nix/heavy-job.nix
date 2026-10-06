{ writeShellApplication, writeText, runCommand, jq, podman, socat, coreutils, image }:

let
  state = "/tmp/heavy-job";
  policy = writeText "heavy-job-policy.json" (builtins.toJSON {
    default = [ { type = "reject"; } ];
    transports.docker-archive."" = [ { type = "insecureAcceptAnything"; } ];
  });
  storageConf = writeText "heavy-job-storage.conf" ''
    [storage]
    driver = "overlay"
    graphroot = "${state}/storage"
    runroot = "${state}/runroot"
  '';
  containersConf = writeText "heavy-job-containers.conf" ''
    [containers]
    http_proxy = false

    [engine]
    cgroup_manager = "cgroupfs"
    events_logger = "none"
  '';
  digest = runCommand "heavy-job-image-digest" { nativeBuildInputs = [ jq ]; } ''
    tar -xOzf ${image} manifest.json | jq -jr '"sha256:" + (.[0].Config | rtrimstr(".json"))' >"$out"
  '';
in
writeShellApplication {
  name = "heavy-job";
  runtimeInputs = [ podman socat coreutils ];
  text = ''
    digest="$(<${digest})"
    if [ "''${1:-}" = --digest ]; then
      printf '%s\n' "$digest"
      exit 0
    fi
    if [ "''${SANDBOX:-}" != 1 ]; then
      echo 'heavy-job: runs only inside the sandbox launcher; the stack starts it' >&2
      exit 2
    fi
    if [ $# -lt 2 ]; then
      echo 'usage: heavy-job JOB_DIR ENTRY [ARG]...  (or heavy-job --digest)' >&2
      exit 2
    fi
    job_dir="$(realpath -e "$1")"
    entry="$2"
    shift 2

    export CONTAINERS_STORAGE_CONF=${storageConf} CONTAINERS_CONF=${containersConf}
    export XDG_RUNTIME_DIR=${state}/run TMPDIR=/tmp
    mkdir -p "$XDG_RUNTIME_DIR" /sys/fs/cgroup
    if ! podman --log-level=error image exists "$digest"; then
      podman --log-level=error load --quiet --signature-policy ${policy} --input ${image} >/dev/null
    fi

    socket_dir="$(mktemp -d ${state}/job.XXXXXX)"
    socket="$socket_dir/worker.sock"
    socat -d0 UNIX-LISTEN:"$socket",fork TCP:127.0.0.1:1337 &
    forwarder=$!
    trap 'kill "$forwarder" 2>/dev/null || true; rm -rf "$socket_dir"' EXIT
    for _ in $(seq 1 200); do
      [ -S "$socket" ] && break
      kill -0 "$forwarder" 2>/dev/null || break
      sleep 0.05
    done
    if [ ! -S "$socket" ]; then
      echo "heavy-job: the Worker socket never appeared at $socket" >&2
      exit 1
    fi

    status=0
    podman --log-level=error run --rm --read-only --network=none --cgroups=disabled \
      --volume="$job_dir:/job:ro" --volume="$socket:/run/endgame/worker.sock" \
      "$digest" "/job/$entry" "$@" || status=$?
    exit "$status"
  '';
}
