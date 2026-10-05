{ lib, stdenvNoCC, fetchurl, deno }:
let
  version = deno.version;
  base = "https://dl.deno.land/release/v${version}";
  releases = {
    x86_64-linux = {
      target = "x86_64-unknown-linux-gnu";
      sha256 = "sha256-9diJt3ks+a0Jk0luLuUyJRbn4d66NsGlp5oAK/AHWbs=";
    };
    aarch64-linux = {
      target = "aarch64-unknown-linux-gnu";
      sha256 = "sha256-jHNAcJjW+p/FE9HY0Hgc+0u+SsGZ7P9aEnhruc4QQcw=";
    };
    aarch64-darwin = {
      target = "aarch64-apple-darwin";
      sha256 = "sha256-MV02kF6hCB49Dhw5iQ8aG7DUd+SXmVkp6ZMw+7Z59ZU=";
    };
  };

  system = stdenvNoCC.hostPlatform.system;
  release = releases.${system} or (throw "denort: no release archive pinned for ${system}");
in
assert lib.assertMsg (version == "2.9.6")
  "denort: pinned zips are v2.9.6 but pkgs.deno is ${version} — re-pin releases";
stdenvNoCC.mkDerivation {
  pname = "denort-cache";
  inherit version;

  src = fetchurl {
    url = "${base}/denort-${release.target}.zip";
    inherit (release) sha256;
  };

  dontUnpack = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall
    mkdir -p "$out/dl/release/v${version}"
    cp "$src" "$out/dl/release/v${version}/denort-${release.target}.zip"
    runHook postInstall
  '';

  meta = {
    description = "Pre-seeded deno compile runtime cache (offline sandbox support)";
    homepage = "https://deno.land";
    license = lib.licenses.mit;
    platforms = lib.attrNames releases;
    sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
  };
}
