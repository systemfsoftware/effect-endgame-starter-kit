{
  description = "starter toolchain — the formatter, runtimes, systemfsoftware packages and dependency sandbox the check chain shells out to";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    # The release manifest (`nix/release-hashes.json`) rides in this input, so
    # Dependabot's bump of it is also the version and digest bump.
    comment-checker = {
      url = "github:systemfsoftware/comment-checker";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    pnpm-release-management = {
      url = "github:systemfsoftware/pnpm-release-management/main";
      inputs.nixpkgs.follows = "nixpkgs";
      inputs.comment-checker.follows = "comment-checker";
      inputs.importPnpmLock.follows = "importPnpmLock";
    };
    systemfsoftware = {
      url = "github:systemfsoftware/systemfsoftware/main";
      inputs.nixpkgs.follows = "nixpkgs";
      inputs.comment-checker.follows = "comment-checker";
      inputs.pnpm-release-management.follows = "pnpm-release-management";
    };
    # The pnpm store is hashless: each tarball's lockfile integrity is its fetch hash, so a lockfile change needs no hash edit.
    importPnpmLock = {
      url = "github:Scrumplex/importPnpmLock.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, comment-checker, pnpm-release-management, systemfsoftware, importPnpmLock }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forEachSystem = fn: nixpkgs.lib.genAttrs systems (system: fn nixpkgs.legacyPackages.${system});
    in
    {
      packages = forEachSystem (pkgs:
        let
          system = pkgs.stdenv.hostPlatform.system;
          dprint = pkgs.callPackage ./nix/dprint.nix { dprintConfig = ./dprint.json; };
          unwrapped = pkgs.callPackage ./nix/comment-checker.nix {
            hashes = "${comment-checker}/nix/release-hashes.json";
          };
          sandboxed = pkgs.callPackage ./nix/comment-checker-sandbox.nix {
            comment-checker = unwrapped;
          };
          sfs-deps = systemfsoftware.packages.${system}.workspace-tarballs;
          pnpm-store = pnpm-release-management.lib.mkPnpmConsumerStore {
            inherit pkgs;
            pname = "starter";
            src = pkgs.lib.fileset.toSource {
              root = ./.;
              fileset = pkgs.lib.fileset.unions [
                ./pnpm-lock.yaml
                ./pnpm-workspace.yaml
                (pkgs.lib.fileset.fileFilter (file: file.name == "package.json") ./.)
              ];
            };
            files.".sfs-deps" = sfs-deps;
          };
          sandbox = pkgs.callPackage "${pnpm-release-management}/nix/sandbox/default.nix" { };
        in {
          inherit dprint sfs-deps sandbox pnpm-store;
          sandbox-proofs = (pkgs.callPackage "${pnpm-release-management}/nix/sandbox/proofs.nix" {
            inherit pkgs sandbox;
            inherit (importPnpmLock.legacyPackages.${system}) iplConfigHook;
          }).sandbox-proofs;
          comment-checker = sandboxed;
          comment-checker-unwrapped = unwrapped;
          default = dprint;
        });

      devShells = forEachSystem (pkgs:
        let
          own = self.packages.${pkgs.stdenv.hostPlatform.system};
          playwrightBrowsers = pkgs.playwright-driver.browsers.override {
            withChromium = false;
            withFirefox = false;
            withWebkit = false;
            withFfmpeg = false;
          };
          # The launcher reads only store paths on PATH, the command and the
          # pnpm store, so a bare --pass-env cannot carry the browsers in. A
          # PATH entry whose closure reaches them makes the store path readable.
          playwrightBrowsersAnchor = pkgs.writeShellApplication {
            name = "playwright-browsers-anchor";
            runtimeInputs = [ playwrightBrowsers ];
            text = ":";
          };
        in {
        default = pkgs.mkShell {
          packages = [
            own.dprint
            own.comment-checker
            own.sandbox
            pnpm-release-management.packages.${pkgs.stdenv.hostPlatform.system}.release-tools
            pkgs.actionlint
            pkgs.nodejs_24
            pkgs.pnpm_12
            pkgs.deno
          ] ++ pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [ playwrightBrowsersAnchor ];
          SANDBOX_PNPM_STORE = own.pnpm-store;
          shellHook = ''
            root="$(git rev-parse --show-toplevel)"
            git config core.hooksPath .husky
            rm -rf "$root/.sfs-deps"
            cp -r --no-preserve=mode ${own.sfs-deps} "$root/.sfs-deps"
          '';
          env = pkgs.lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
            PLAYWRIGHT_BROWSERS_PATH = "${playwrightBrowsers}";
          };
        };
      });
    };
}
