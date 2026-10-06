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
      url = "github:systemfsoftware/pnpm-release-management/149e762e73549f1664e792bcc048729a30fa41da";
      inputs.nixpkgs.follows = "nixpkgs";
      inputs.comment-checker.follows = "comment-checker";
    };
    systemfsoftware = {
      url = "github:systemfsoftware/systemfsoftware/c53bfc9253fe1d2d63119d0e4daae00da846432e";
      inputs.nixpkgs.follows = "nixpkgs";
      inputs.comment-checker.follows = "comment-checker";
      inputs.pnpm-release-management.follows = "pnpm-release-management";
    };
  };

  outputs = { self, nixpkgs, comment-checker, pnpm-release-management, systemfsoftware }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ];
      forEachSystem = fn: nixpkgs.lib.genAttrs systems (system: fn nixpkgs.legacyPackages.${system});
    in
    {
      packages = forEachSystem (pkgs:
        let
          inherit (pkgs) lib;
          system = pkgs.stdenv.hostPlatform.system;
          dprint = pkgs.callPackage ./nix/dprint.nix { };
          unwrapped = pkgs.callPackage ./nix/comment-checker.nix {
            hashes = "${comment-checker}/nix/release-hashes.json";
          };
          sandboxed = pkgs.callPackage ./nix/comment-checker-sandbox.nix {
            comment-checker = unwrapped;
          };
          local-stack = pkgs.callPackage ./nix/local-stack.nix { };
          sfs-deps = systemfsoftware.packages.${system}.workspace-tarballs;
          manifests = lib.fileset.toSource {
            root = ./.;
            fileset = lib.fileset.unions [
              ./package.json
              ./pnpm-lock.yaml
              ./pnpm-workspace.yaml
              (lib.fileset.fileFilter (file: file.name == "package.json") ./apps)
              (lib.fileset.maybeMissing ./patches)
            ];
          };
          workspace = pnpm-release-management.lib.mkPnpmWorkspacePackages {
            inherit pkgs;
            pname = "starter";
            src = pkgs.runCommand "starter-manifests" { } ''
              cp -r ${manifests} "$out"
              chmod -R u+w "$out"
              mkdir -p "$out/packages" "$out/.sfs-deps"
              cp ${sfs-deps}/*.tgz "$out/.sfs-deps/"
            '';
            hash = "sha256-coha4HuDKh3eiVuLQLnAypzVxNeS1nLe0fHaszmvmsk=";
          };
        in {
          inherit dprint local-stack sfs-deps;
          inherit (workspace) pnpm-store;
          sandbox = pnpm-release-management.packages.${system}.sandbox;
          sandbox-proofs = pnpm-release-management.packages.${system}.sandbox-proofs;
          comment-checker = sandboxed;
          comment-checker-unwrapped = unwrapped;
          default = dprint;
        });

      devShells = forEachSystem (pkgs:
        let
          own = self.packages.${pkgs.stdenv.hostPlatform.system};
        in {
        default = pkgs.mkShell {
          packages = [
            own.dprint
            own.comment-checker
            own.local-stack
            own.sandbox
            pkgs.actionlint
            pkgs.jq
            pkgs.nodejs_24
            pkgs.pnpm_12
            pkgs.deno
          ];
          SANDBOX_PNPM_STORE = own.pnpm-store;
          shellHook = ''
            sfs_deps="$(git rev-parse --show-toplevel)/.sfs-deps"
            rm -rf "$sfs_deps"
            cp -r --no-preserve=mode ${own.sfs-deps} "$sfs_deps"
          '';
          env = pkgs.lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
            PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers.override {
              withChromium = false;
              withFirefox = false;
              withWebkit = false;
              withFfmpeg = false;
            }}";
          };
        };
      });
    };
}
