{
  description = "rat-stack scorecard: the verifier-owned instrument that measures the starter against rat-stack";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/494ce7fd23ff6a5dff39e1fb11e9b6f2ac74bf25";
    pnpm-release-management = {
      url = "github:systemfsoftware/pnpm-release-management/8f1984418fef130956a3d1f50dc471fd1984d2ec";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, pnpm-release-management }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ];
      forEachSystem = fn: nixpkgs.lib.genAttrs systems (system: fn nixpkgs.legacyPackages.${system});
      pin = builtins.fromJSON (builtins.readFile ./ratstack.pin.json);
      toolsStoreHash = {
        x86_64-linux = "sha256-jUyIV2ysOxkIij/Ff5VGuIADTibbY0SsCPGglmIvdn0=";
        aarch64-linux = "sha256-jUyIV2ysOxkIij/Ff5VGuIADTibbY0SsCPGglmIvdn0=";
        aarch64-darwin = "sha256-XWYBTy3xZbQwJxdGbAK4+R69XNmL3RRyXu6+nY+XPXc=";
      };
    in
    {
      packages = forEachSystem (pkgs:
        let
          system = pkgs.stdenv.hostPlatform.system;
          sandbox = pnpm-release-management.packages.${system}.sandbox;
          tools-store = (pnpm-release-management.lib.mkPnpmWorkspacePackages {
            inherit pkgs;
            src = self;
            pname = "ratstack-scorecard";
            pnpm = pkgs.pnpm_12;
            hash = "sha256-9/W9Q1CNzoBbRBhd+qdu7TfR8xk/7mjoiEOkOLwSRpU=";
          }).pnpm-store;
          ratstack-src = pkgs.fetchFromGitHub {
            inherit (pin) owner repo;
            rev = pin.commit;
            hash = pin.narHash;
          };
          scorecard = pkgs.writeShellApplication {
            name = "scorecard";
            runtimeInputs = [ pkgs.deno pkgs.git pkgs.bash ];
            text = ''
              export SCORECARD_INSTRUMENT=${self}
              export SCORECARD_SANDBOX=${sandbox}/bin/sandbox
              export SCORECARD_TOOLS_STORE=${tools-store}
              export SCORECARD_RATSTACK_SRC=${ratstack-src}
              export SCORECARD_TOOL_PATH=${pkgs.lib.makeBinPath [ pkgs.nodejs_24 pkgs.pnpm_12 pkgs.coreutils ]}
              export SCORECARD_NODE_VERSION=${pkgs.nodejs_24.version}
              export SCORECARD_PNPM_VERSION=${pkgs.pnpm_12.version}
              export DENO_NO_PACKAGE_JSON=1
              exec deno run --no-config --allow-read --allow-write --allow-env --allow-sys=hostname \
                --allow-run=git,bash,${pkgs.deno}/bin/deno,${sandbox}/bin/sandbox \
                ${self}/src/main.ts "$@"
            '';
          };
        in
        {
          inherit sandbox tools-store ratstack-src scorecard;
          default = scorecard;
        });

      devShells = forEachSystem (pkgs:
        let system = pkgs.stdenv.hostPlatform.system; in {
          default = pkgs.mkShell {
            packages = [ pkgs.nodejs_24 pkgs.pnpm_12 pkgs.deno pkgs.actionlint self.packages.${system}.sandbox ];
            SANDBOX_PNPM_STORE = self.packages.${system}.tools-store;
          };
        });
    };
}
