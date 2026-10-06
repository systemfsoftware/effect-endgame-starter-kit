# dprint, from the official GitHub release archive for this host's platform.
#
# Pinned to the exact version the tree was last formatted with, so replacing the
# npm package cannot move a byte of formatted output. The SHA-256 sums are the
# ones dprint publishes in its release notes:
# https://github.com/dprint/dprint/releases/tag/0.54.0
#
# Its plugins are WebAssembly that dprint would otherwise download at run time
# from the URLs in dprint.json. Each one is fetched here against a pinned hash,
# and the wrapper hands dprint the store copies, so formatting never reaches the
# network and works inside the sandbox. A plugin URL without a hash below fails
# evaluation.
{ lib, stdenv, stdenvNoCC, fetchurl, unzip, autoPatchelfHook, xz, writeShellScriptBin, dprintConfig }:

let
  version = "0.54.0";

  releases = {
    x86_64-linux = {
      target = "x86_64-unknown-linux-gnu";
      sha256 = "8cb5925a0d6d0d8aa74c82a00f76734577592dfa1eda9517c261a84fe06accd7";
    };
    aarch64-linux = {
      target = "aarch64-unknown-linux-gnu";
      sha256 = "6b86329e17678ff3358f88d69a3774d371b601c665cc8cebbf2a4e1234a6d289";
    };
    x86_64-darwin = {
      target = "x86_64-apple-darwin";
      sha256 = "fdbffa16cf0890ca30e958ffdabe7748e733867651a438ede1501f0e1a7b5e91";
    };
    aarch64-darwin = {
      target = "aarch64-apple-darwin";
      sha256 = "1d6a8fb14d66cba0f049738edd4ab3b1afc1de6d936cd32e483e33284cfd1ade";
    };
  };

  system = stdenvNoCC.hostPlatform.system;
  release = releases.${system} or (throw "dprint: no release archive pinned for ${system}");

  pluginHashes = {
    "https://plugins.dprint.dev/typescript-0.96.1.wasm" = "sha256-nFIkTeLCWjOt3H3az/REMjSi3EtdPzQTEmLR4N81AHw=";
    "https://plugins.dprint.dev/json-0.19.3.wasm" = "sha256-6JtfO11zcS8bHKAXvOnN9n3jCn0NukeAeAng0mKwH7k=";
    "https://plugins.dprint.dev/markdown-0.17.8.wasm" = "sha256-PIEN9UnYC8doJpdzS7M6QEHQNQtj7WwXAgvewPsTjqs=";
    "https://plugins.dprint.dev/toml-0.6.2.wasm" = "sha256-oEUfrvYkRgTsi/4Ea/wpOv9iUn0JMgz69TNw8RjAO80=";
    "https://plugins.dprint.dev/g-plane/pretty_yaml-v0.5.0.wasm" = "sha256-6ua021G7ZW7Ciwy/OHXTA1Joj9PGEx3SZGtvaA//gzo=";
  };

  plugins = map
    (url: fetchurl {
      inherit url;
      hash = pluginHashes.${url} or (throw "dprint: no pinned hash for plugin ${url}; add it to nix/dprint.nix");
    })
    (builtins.fromJSON (builtins.readFile dprintConfig)).plugins;

  unwrapped = stdenvNoCC.mkDerivation {
  pname = "dprint";
  inherit version;

  src = fetchurl {
    url = "https://github.com/dprint/dprint/releases/download/${version}/dprint-${release.target}.zip";
    inherit (release) sha256;
  };

  # The archive holds one bare executable, so there is no directory to enter.
  sourceRoot = ".";

  nativeBuildInputs = [ unzip ] ++ lib.optional stdenvNoCC.hostPlatform.isLinux autoPatchelfHook;
  # `xz` supplies liblzma.so.5, which the official x86_64-linux binary links.
  buildInputs = lib.optionals stdenvNoCC.hostPlatform.isLinux [ stdenv.cc.cc.lib xz ];

  installPhase = ''
    runHook preInstall
    install -Dm755 dprint "$out/bin/dprint"
    runHook postInstall
  '';

  meta = {
    description = "Pluggable and configurable code formatting platform";
    homepage = "https://dprint.dev";
    license = lib.licenses.mit;
    mainProgram = "dprint";
    platforms = lib.attrNames releases;
    sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
  };
  };
in
# --plugins takes several values, so --config-discovery=true (dprint's default)
# ends the list before the caller's own arguments.
writeShellScriptBin "dprint" ''
  if [ "$#" -eq 0 ]; then exec ${unwrapped}/bin/dprint; fi
  exec ${unwrapped}/bin/dprint "$1" --plugins ${lib.escapeShellArgs plugins} --config-discovery=true "''${@:2}"
''
