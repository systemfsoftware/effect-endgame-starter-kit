{ dockerTools, nodejs_24 }:

dockerTools.buildLayeredImage {
  name = "endgame-heavy-job";
  tag = "nix";
  contents = [ nodejs_24 ];
  config = {
    Entrypoint = [ "${nodejs_24}/bin/node" ];
    WorkingDir = "/job";
  };
}
