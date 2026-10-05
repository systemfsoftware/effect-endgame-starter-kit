

{ lib, stdenv, stdenvNoCC, fetchurl, unzip, autoPatchelfHook, xz }:

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
    aarch64-darwin = {
      target = "aarch64-apple-darwin";
      sha256 = "1d6a8fb14d66cba0f049738edd4ab3b1afc1de6d936cd32e483e33284cfd1ade";
    };
  };

  system = stdenvNoCC.hostPlatform.system;
  release = releases.${system} or (throw "dprint: no release archive pinned for ${system}");
in
stdenvNoCC.mkDerivation {
  pname = "dprint";
  inherit version;

  src = fetchurl {
    url = "https://github.com/dprint/dprint/releases/download/${version}/dprint-${release.target}.zip";
    inherit (release) sha256;
  };

  sourceRoot = ".";

  nativeBuildInputs = [ unzip ] ++ lib.optional stdenvNoCC.hostPlatform.isLinux autoPatchelfHook;

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
}
