{ lib, stdenv, writeShellApplication, replaceVars, bubblewrap, socat, nodejs_24, cacert, coreutils, git, bash }:
let
  script = replaceVars ./sandbox.sh {
    node = lib.getExe nodejs_24;
    egressProxy = builtins.path { path = ./egress-proxy.mjs; name = "egress-proxy.mjs"; };
    caBundle = "${cacert}/etc/ssl/certs/ca-bundle.crt";
    bwrap = if stdenv.hostPlatform.isLinux then lib.getExe bubblewrap else "bwrap-is-linux-only";
    socat = lib.getExe socat;
    sh = lib.getExe bash;
    sleep = "${coreutils}/bin/sleep";
    darwinProfile = builtins.path { path = ./darwin.sb; name = "sandbox-darwin.sb"; };
  };
in
writeShellApplication {
  name = "sandbox";
  runtimeInputs = [ coreutils git ];
  text = builtins.readFile script;
}
