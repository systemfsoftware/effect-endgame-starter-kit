{ writeShellApplication, process-compose, opentelemetry-collector-contrib, tempo, grafana }:

writeShellApplication {
  name = "local-stack";
  runtimeInputs = [ process-compose opentelemetry-collector-contrib tempo grafana ];
  text = ''
    export GRAFANA_HOME="${grafana}/share/grafana"
    exec process-compose "$@"
  '';
}
