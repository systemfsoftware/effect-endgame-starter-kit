{ lib, writeShellApplication, process-compose, opentelemetry-collector-contrib, tempo, grafana, heavy-job ? null }:

writeShellApplication {
  name = "local-stack";
  runtimeInputs = [ process-compose opentelemetry-collector-contrib tempo grafana ]
    ++ lib.optional (heavy-job != null) heavy-job;
  text = ''
    export GRAFANA_HOME="${grafana}/share/grafana"
    # process-compose's TUI wants a terminal. An agent, a CI job or
    # `ssh host pnpm dev` has none, and the TUI aborts with "TUI startup error:
    # terminal entry not found" before a single process starts. Render plain
    # logs instead whenever stdout is not a TTY.
    if [ ! -t 1 ]; then
      export PC_DISABLE_TUI=1
    fi
    exec process-compose "$@"
  '';
}
