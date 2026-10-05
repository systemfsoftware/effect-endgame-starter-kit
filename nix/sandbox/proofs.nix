{ writeShellApplication, sandbox, coreutils, curl, git, gnugrep, nodejs_24 }:
writeShellApplication {
  name = "sandbox-proofs";
  runtimeInputs = [ sandbox coreutils curl git gnugrep nodejs_24 ];
  text = builtins.readFile ./proofs.sh;
  excludeShellChecks = [ "SC2016" ];
}
