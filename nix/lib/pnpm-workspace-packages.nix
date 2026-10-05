{
  pkgs,
  src,
  hash,
  pname ? "workspace",
  pnpm ? pkgs.pnpm_12,
  nodejs ? pkgs.nodejs_24,
  buildScript ? "build",
  nativeBuildInputs ? [ ],
}:
let
  inherit (pkgs) lib;

  workspaceGlobs =
    let
      lines = lib.splitString "\n" (builtins.readFile (src + "/pnpm-workspace.yaml"));
      entry = line: builtins.match ''[[:space:]]*-[[:space:]]+["']?([^"'#]+[^"'#[:space:]])["']?[[:space:]]*(#.*)?'' line;
      inPackages =
        builtins.foldl'
          (acc: line:
            if builtins.match "packages:[[:space:]]*" line != null then acc // { on = true; }
            else if acc.on && builtins.match "[^[:space:]-].*" line != null then acc // { on = false; }
            else if acc.on && entry line != null then acc // { globs = acc.globs ++ [ (builtins.head (entry line)) ]; }
            else acc)
          { on = false; globs = [ ]; }
          lines;
    in
    inPackages.globs;

  dirsOf = glob:
    if lib.hasPrefix "!" glob then [ ]
    else if lib.hasSuffix "/*" glob then
      let parent = lib.removeSuffix "/*" glob;
      in lib.mapAttrsToList (name: _: "${parent}/${name}")
        (lib.filterAttrs (name: type: type == "directory" && builtins.pathExists (src + "/${parent}/${name}/package.json"))
          (builtins.readDir (src + "/${parent}")))
    else if lib.hasInfix "*" glob then
      throw "mkPnpmWorkspacePackages: workspace glob '${glob}' is not supported; use 'dir/*' or a literal path"
    else if builtins.pathExists (src + "/${glob}/package.json") then [ glob ]
    else [ ];

  excluded = map (glob: lib.removePrefix "!" glob) (lib.filter (lib.hasPrefix "!") workspaceGlobs);

  members = lib.filter (dir: !(builtins.elem dir excluded)) (lib.unique (lib.concatMap dirsOf workspaceGlobs));

  manifestOf = dir: lib.importJSON (src + "/${dir}/package.json");

  public = lib.filter (dir: !((manifestOf dir).private or false)) members;

  attrOf = name: lib.last (lib.splitString "/" name);

  entries = map (dir: rec {
    inherit dir;
    name = (manifestOf dir).name;
    version = (manifestOf dir).version;
    attr = attrOf name;
    tarball = "${attr}-${version}.tgz";
  }) public;

  duplicateAttrs = lib.filter (attr: lib.count (e: e.attr == attr) entries > 1) (map (e: e.attr) entries);

  pinnedPnpm =
    let
      packageManager = (lib.importJSON (src + "/package.json")).packageManager or null;
      pinned = if packageManager == null then null else builtins.match "pnpm@([^+]+).*" packageManager;
    in
    if pinned == null then null else builtins.head pinned;

  pnpmDeps =
    assert pinnedPnpm == null || pinnedPnpm == pnpm.version
      || throw "mkPnpmWorkspacePackages: package.json pins pnpm@${pinnedPnpm} but the build uses pnpm ${pnpm.version}; pin the version Nix provides so every pnpm run resolves the same way";
    pkgs.fetchPnpmDeps {
    inherit pname src pnpm hash;
    version = "0";
    fetcherVersion = 4;
  };

  pnpm-store = pkgs.runCommand "${pname}-pnpm-store" { nativeBuildInputs = [ pkgs.zstd pkgs.sqlite ]; } ''
    mkdir -p "$out"
    tar --zstd -xf ${pnpmDeps}/pnpm-store.tar.zst -C "$out"
    chmod -R u+w "$out"
    for dump in "$out"/v*/index.db.sql; do
      [ -e "$dump" ] || continue
      sqlite3 "''${dump%.sql}" < "$dump"
      rm "$dump"
    done
  '';

  workspace-tarballs =
    assert duplicateAttrs == [ ]
      || throw "mkPnpmWorkspacePackages: packages share the attribute name(s) ${lib.concatStringsSep ", " (lib.unique duplicateAttrs)}";
    pkgs.stdenvNoCC.mkDerivation {
      pname = "${pname}-tarballs";
      version = "0";
      inherit src pnpmDeps;

      nativeBuildInputs = [ nodejs pnpm pkgs.pnpmConfigHook pkgs.jq ] ++ nativeBuildInputs;

      pnpmInstallFlags = [ "--ignore-scripts" ];

      buildPhase = ''
        runHook preBuild
        pnpm --recursive --if-present ${lib.concatMapStringsSep " " (e: "--filter ${lib.escapeShellArg "${e.name}..."}") entries} run ${lib.escapeShellArg buildScript}
        runHook postBuild
      '';

      installPhase = ''
        runHook preInstall
        mkdir -p "$out"
        ${lib.concatMapStringsSep "\n" (e: ''
          (cd ${lib.escapeShellArg e.dir} && pnpm pack --out "$out"/${lib.escapeShellArg e.tarball})
        '') entries}
        jq -n '$ARGS.positional | map(split("=") | {name: .[0], file: .[1]})' --args \
          ${lib.concatMapStringsSep " " (e: lib.escapeShellArg "${e.name}=${e.tarball}") entries} > "$out/index.json"
        runHook postInstall
      '';

      passthru.members = entries;
    };

  perPackage = lib.listToAttrs (map (e: {
    name = e.attr;
    value = pkgs.runCommand "${e.attr}-${e.version}.tgz" { } ''
      cp ${workspace-tarballs}/${lib.escapeShellArg e.tarball} "$out"
    '';
  }) entries);
in
perPackage // { inherit workspace-tarballs pnpm-store; }
