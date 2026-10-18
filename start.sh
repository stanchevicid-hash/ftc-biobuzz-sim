#!/bin/sh
# FTC simulator: builds the simulated SDK + bridge (first run, or with --rebuild) and starts the local server.
cd "$(dirname "$0")" || exit 1
command -v java >/dev/null || { echo "Java not found. Install Java 8+ (Android Studio already has one)."; exit 1; }
SEP=":"; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) SEP=";";; esac
if [ "$1" = "--rebuild" ] || [ ! -f build/server/ftcsim/server/SimServer.class ]; then
  echo "Building simulated FTC SDK..."
  rm -rf build && mkdir -p build/sdk build/server
  find sdk/src -name '*.java' > build/sdk-files.txt
  java -jar server/lib/ecj.jar -1.8 -nowarn -g -encoding UTF-8 -d build/sdk @build/sdk-files.txt || exit 1
  find server/src -name '*.java' > build/server-files.txt
  java -jar server/lib/ecj.jar -1.8 -nowarn -g -encoding UTF-8 -cp "build/sdk${SEP}server/lib/ecj.jar" -d build/server @build/server-files.txt || exit 1
fi
java -cp "build/sdk${SEP}build/server${SEP}server/lib/ecj.jar" ftcsim.server.SimServer . 8740
