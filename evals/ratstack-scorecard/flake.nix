{
  description = "rat-stack scorecard: the verifier-owned instrument that measures the starter against rat-stack";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/494ce7fd23ff6a5dff39e1fb11e9b6f2ac74bf25";
    pnpm-release-management = {
      url = "github:systemfsoftware/pnpm-release-management/180122866dd537fa728b5563fb1820fbd2af88cc";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, pnpm-release-management }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ];
      forEachSystem = fn: nixpkgs.lib.genAttrs systems (system: fn nixpkgs.legacyPackages.${system});
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
            hash = "sha256-TylxLEQflTlKx6QDk9mFlBOEInUvvBBeOVFUYCURmYo=";
          }).pnpm-store;
        in
        {
          inherit sandbox tools-store;
        });

      devShells = forEachSystem (pkgs:
        let system = pkgs.stdenv.hostPlatform.system; in {
          default = pkgs.mkShell {
            packages = [ pkgs.nodejs_24 pkgs.pnpm_12 pkgs.deno self.packages.${system}.sandbox ];
            SANDBOX_PNPM_STORE = self.packages.${system}.tools-store;
          };
        });
    };
}
