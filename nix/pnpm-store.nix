# The pnpm store the sandbox installs from, built offline from a lockfile.
# Every tarball is its own fixed-output fetch whose hash is the lockfile's
# integrity for it, so the store has no hash of its own to go stale.
{
  lib,
  runCommand,
  stdenvNoCC,
  yq-go,
  mitm-cache,
  nodejs,
  pnpm,
  importPnpmLock,
}:
{
  pname,
  lockFile,
  workspaceFile,
  # Directories the lockfile and workspace doc refer to (file: tarballs,
  # patchedDependencies), by path relative to the workspace root, e.g.
  # { patches = ./patches; ".sfs-deps" = <derivation holding *.tgz>; }.
  files ? { },
}:
let
  # A file: tarball is read from files; it has no URL to fetch.
  fetchable = runCommand "${pname}-fetchable-pnpm-lock.yaml" { nativeBuildInputs = [ yq-go ]; } ''
    yq 'del(.packages[] | select(.resolution.tarball // "" | test("^file:")))' ${lockFile} > "$out"
  '';
in
stdenvNoCC.mkDerivation {
  name = "${pname}-pnpm-store";
  dontUnpack = true;
  mitmCache = importPnpmLock {
    inherit pname;
    version = "0";
    lockFile = fetchable;
  };
  nativeBuildInputs = [
    mitm-cache
    nodejs
    pnpm
  ];
  buildPhase = ''
    runHook preBuild
    cp ${lockFile} pnpm-lock.yaml
    cp ${workspaceFile} pnpm-workspace.yaml
    ${lib.concatStrings (
      lib.mapAttrsToList (dir: source: ''
        mkdir -p ${lib.escapeShellArg dir}
        cp -r ${source}/. ${lib.escapeShellArg dir}/
      '') files
    )}
    # mitm-cache replays the fetches as a plain-HTTP proxy on 127.0.0.1.
    export HOME="$TMPDIR" https_proxy="http://$https_proxy" http_proxy="http://$http_proxy"
    export pnpm_config_store_dir="$out" pnpm_config_trust_lockfile=true pnpm_config_update_notifier=false
    pnpm fetch
    # pnpm may register the build directory as a project using the store;
    # the link would dangle, and the launcher binds this directory read-only.
    rm -rf "$out"/v*/projects
    runHook postBuild
  '';
  dontInstall = true;
}
