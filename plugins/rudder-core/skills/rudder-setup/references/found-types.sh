#!/bin/sh
# Step 2's probe. Run it unchanged from the folder to look in; it changes nothing. It prints the source types the
# code there points to, joined with + when there are several (android_kotlin+javascript), or none. With --apps it
# prints one line per app instead, its type and its folder from here, such as `android_kotlin apps/consumer`, with
# `.` for this folder, and nothing when it finds no app.
#
# It looks four levels down, skips dependency and build folders, and checks in this order: flutter (a pubspec.yaml
# with the Flutter SDK), react_native (a package.json whose dependencies name react-native), javascript for a
# Capacitor or Cordova app, unity, android_kotlin (a Gradle file that applies the Android application plugin, puts
# the Android Gradle plugin on its classpath, or holds an android block), ios_swift (an Xcode project or workspace,
# or a Podfile; a Package.swift alone is a library) and javascript (a package.json with a browser framework, or an
# index.html at the top, in public/ or in src/). Frameworks come first, because their apps hold native and web
# builds of their own. A framework app claims only those: the android/, ios/ and macos/ folders beside its manifest,
# platforms/ for Cordova, the manifest itself and the index.html checks in its folder. Another app in the
# repository, even one inside the framework app's folder, is still found. Only when it finds none of these does it
# look for a server: node (express, fastify, koa, nest, hapi, hono or restify), python, go, java, dotnet, php, ruby
# or rust. A package.json with none of these frameworks prints none.
#
# An app's folder is the one that holds the file it was found by, except that an Android app's is its Gradle root
# (the nearest folder up with a settings.gradle or settings.gradle.kts), an iOS app's is the one that holds the
# Xcode project, a Unity project's is the one that holds ProjectSettings/, and an index.html in public/ or src/
# belongs to this folder. When one Gradle root holds more than one module that applies the Android application
# plugin, each of those apps gets its own line, which ends with its module's Gradle path, such as
# `android_kotlin . :consumer`. A server's folder inside another folder of the same server type is part of that
# server, such as a module of a Maven or Gradle build.
#
# With --sdks '<a line --apps printed>' it prints the analytics SDKs that app's manifests name, one file:SDK line
# each, with paths from here. It reads only the manifests its type uses, in its folder, and leaves out every other
# client app's folder, a Node server's, and in a Gradle build with several apps, the other apps' modules.
m() { find . -maxdepth 4 \( -name node_modules -o -name '.?*' -o -name build -o -name dist -o -name Pods -o -name vendor -o -name target -o -name rudder \) -prune -o "$@" 2>/dev/null; }
rel() { sed 's#^\./##'; }
dirs() { sed -n 's#/[^/]*$##p' | rel; }
xc() { sed -nE 's#/[^/]+\.(xcodeproj|xcworkspace)(/.*)?$##p; s#/Podfile$##p' | rel; }
# A Gradle root's version catalog can name the Android application plugin with any alias, such as
# `android-app = { id = "com.android.application" }` for `alias(libs.plugins.android.app)`; settings can move a module
# to another folder with `project(":consumer").projectDir = file("apps/consumer")`, and its Gradle path is then the one
# settings gives.
appalias() { cat "$1"/gradle/*.versions.toml 2>/dev/null | awk '/^[[:space:]]*\[/ { p = $0 ~ /^[[:space:]]*\[plugins\]/ } p && /"com\.android\.application[":]/ { k = $1; sub(/=.*/, "", k); gsub(/"/, "", k); gsub(/[-_.]/, "[.]", k); printf "|plugins[.]%s([^.A-Za-z0-9_]|$)", k }'; }
gmap() { sed -nE "s#.*project\\(['\"](:[^'\"]+)['\"]\\)\\.projectDir *= *(file\\(|File\\(rootDir, *|new File\\(rootDir, *)['\"]([^'\"]+)['\"].*#\\1 \\3#p" "$1"/settings.gradle "$1"/settings.gradle.kts 2>/dev/null | sed -E 's# \./# #; s#/$##'; }
gpath() { gmap "$1" | awk -v w="$2" '$2 == w { print $1; exit }'; }
gdir() { x=$(gmap "$1" | awk -v g="$2" '$1 == g { print $2; exit }'); [ -n "$x" ] || x=$(printf '%s' "${2#:}" | tr : /); if [ "$1" = . ]; then printf '%s\n' "$x"; else printf '%s/%s\n' "$1" "$x"; fi; }
groot() { while IFS= read -r f; do [ -n "$f" ] || continue; d=${f%/*}; until [ -f "$d/settings.gradle" ] || [ -f "$d/settings.gradle.kts" ] || [ "$d" = . ]; do d=${d%/*}; done; [ -f "$d/settings.gradle" ] || [ -f "$d/settings.gradle.kts" ] || d=${f%/*}; a=; g=; ! grep -qE "android\.?[Aa]pplication$(appalias "$d")" "$f" || { a=${f%/*}; g=$(gpath "$d" "${a#"$d"/}"); }; printf '%s\t%s\t%s\n' "$d" "$a" "$g"; done | awk -F '\t' '{ r[NR] = $1; m[NR] = $2; g[NR] = $3; if ($2 != "" && $2 != $1) n[$1]++ } END { for (i = 1; i <= NR; i++) if (n[r[i]] < 2) print r[i]; else if (m[i] != "" && m[i] != r[i]) { p = r[i] == "." ? substr(m[i], 3) : substr(m[i], length(r[i]) + 2); gsub("/", ":", p); print r[i] " " (g[i] != "" ? g[i] : ":" p) } }' | rel; }
outer() { dirs | awk '{ a[NR] = $0 } END { for (i = 1; i <= NR; i++) { k = 1; for (j = 1; j <= NR; j++) if (a[j] != a[i] && (a[j] == "." || index(a[i], a[j] "/") == 1)) k = 0; if (k) print a[i] } }'; }
flutter=$(m -name pubspec.yaml -exec grep -lE '^[[:space:]]*sdk:[[:space:]]*flutter' {} +)
rn=$(m -name package.json -exec jq -r 'select(.dependencies["react-native"]) | input_filename' {} \;)
hybrid=$(m -name package.json -exec grep -l '"@capacitor/core"[[:space:]]*:' {} +; m -name config.xml -exec grep -l 'w3\.org/ns/widgets' {} +)
roots=$(printf '%s\n' "$flutter" "$rn" "$hybrid" | sed -n 's#/[^/]*$#/#p')
own() { R=$roots awk 'BEGIN { n = split(ENVIRON["R"], r, "\n") } { k = 1; for (i = 1; i <= n; i++) if (r[i] != "" && index($0, r[i]) == 1 && substr($0, length(r[i]) + 1) ~ /^((android|ios|macos|platforms)\/|package\.json$|(public\/|src\/)?index\.html$)/) k = 0; if (k) print }'; }
clients() {
  "$1" flutter "$(printf '%s\n' "$flutter" | dirs)"
  "$1" react_native "$(printf '%s\n' "$rn" | dirs)"
  "$1" javascript "$(printf '%s\n' "$hybrid" | dirs)"
  "$1" unity "$(m -path '*/ProjectSettings/ProjectVersion.txt' -print | sed 's#/ProjectSettings/ProjectVersion\.txt$##' | rel)"
  "$1" android_kotlin "$(m \( -name build.gradle -o -name build.gradle.kts \) -exec grep -lE 'android\.?[Aa]pplication|com\.android\.tools\.build|^[[:space:]]*android[[:space:]]*\{' {} + | own | groot)"
  "$1" ios_swift "$(m \( -name '*.xcodeproj' -o -name '*.xcworkspace' -o -name Podfile \) -print | own | xc)"
  "$1" javascript "$({ m -name package.json -exec grep -lE '"(react-dom|vue|svelte|@sveltejs/kit|@angular/core|next|nuxt|vite|preact|solid-js|astro|gatsby|@remix-run/react)"[[:space:]]*:' {} + | own; find . -maxdepth 2 \( -path ./index.html -o -path ./public/index.html -o -path ./src/index.html \) -print | own | sed 's#.*#./index.html#'; } | dirs)"
}
servers() {
  "$1" node "$(m -name package.json -exec grep -lE '"(express|fastify|koa|@nestjs/core|@hapi/hapi|hono|restify)"[[:space:]]*:' {} + | outer)"
  "$1" python "$(m \( -name pyproject.toml -o -name 'requirements*.txt' -o -name Pipfile -o -name setup.py \) -print | outer)"
  "$1" go "$(m -name go.mod -print | outer)"
  "$1" java "$(m \( -name pom.xml -o -name build.gradle -o -name build.gradle.kts \) -print | outer)"
  "$1" dotnet "$(m \( -name '*.csproj' -o -name '*.fsproj' -o -name '*.sln' \) -print | outer)"
  "$1" php "$(m -name composer.json -print | outer)"
  "$1" ruby "$(m -name Gemfile -print | outer)"
  "$1" rust "$(m -name Cargo.toml -print | outer)"
}
t=; add() { [ -z "$2" ] || case "+$t+" in *"+$1+"*) ;; *) t=${t:+$t+}$1 ;; esac; }
found=clients; clients add
[ -n "$t" ] || { found=servers; servers add; }
if [ "${1-}" = --sdks ]; then
  # --sdks '<a line --apps printed>': the analytics SDKs that app's manifests name, one `file:SDK` line each. It reads
  # only the manifests of the app's type, in the app's folder, and leaves out every other app's folder, a server's
  # included, and in a Gradle build with several apps, the other apps' modules.
  set -f; set -- $2; ty=$1; dir=$2; mod=${3-}
  case $ty in
    javascript|node) inc='package.json' ;;
    react_native) inc='package.json Podfile *.gradle *.gradle.kts' ;;
    flutter) inc='pubspec.yaml Podfile *.gradle *.gradle.kts' ;;
    android_kotlin) inc='*.gradle *.gradle.kts *.versions.toml' ;;
    ios_swift) inc='Podfile Package.swift Package.resolved project.pbxproj' ;;
    python) inc='requirements*.txt pyproject.toml Pipfile setup.py setup.cfg' ;;
    go) inc='go.mod' ;; java) inc='pom.xml *.gradle *.gradle.kts' ;; dotnet) inc='*.csproj *.fsproj' ;;
    php) inc='composer.json' ;; ruby) inc='Gemfile' ;; rust) inc='Cargo.toml' ;; *) inc='package.json' ;;
  esac
  o=; for i in $inc; do o="$o --include=$i"; done
  line() { [ -z "$2" ] || printf '%s\n' "$2" | while IFS= read -r f; do printf '%s %s\n' "$1" "$f"; done; }
  # the folders to leave out: every other client app's, a node server's, and in a Gradle build with several apps,
  # the other apps' modules. Only folders inside the app's own folder matter.
  own=$dir; [ -z "$mod" ] || own=$(gdir "$dir" "$mod")
  # globbing back on here: the app list reads gradle/*.versions.toml; it stays off for the include patterns below
  others=$(set +f; { clients line; servers line; } | while read -r t f g; do case $t in (python|go|java|dotnet|php|ruby|rust) continue ;; esac; [ -z "$g" ] || f=$(gdir "$f" "$g"); printf '%s\n' "$f"; done |
    awk -v d="$dir" -v o="$own" '$0 != o && $0 != d && $0 != "." && (d == "." || index($0, d "/") == 1)')
  grep -rIoE --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=Pods --exclude-dir=build --exclude-dir=vendor --exclude-dir=target --exclude-dir=.venv --exclude-dir=venv $o '@rudderstack/[a-z-]+|rudder-sdk-[a-z-]+|com\.rudderstack\.[a-z.]+|rudder_sdk_flutter|pod .Rudder.|rudderlabs/analytics-go|rudder-php-sdk|rudder_analytics_sync|[Rr]udder[Aa]nalytics|@segment/[a-z-]+|com\.segment\.analytics[a-z.]*|analytics-swift|segment_analytics|pod .Analytics[^A-Za-z]|segment-analytics-python|analytics-python|segmentio/analytics-[a-z]+|analytics-ruby|Segment\.Analytics' "$dir" 2>/dev/null |
    sed 's#^\./##' | O=$others awk 'BEGIN { n = split(ENVIRON["O"], x, "\n") } { k = 1; for (i = 1; i <= n; i++) if (x[i] != "" && index($0, x[i] "/") == 1) k = 0; if (k) print }'
elif [ "${1-}" = --apps ]; then
  line() { [ -z "$2" ] || printf '%s\n' "$2" | while IFS= read -r f; do printf '%s %s\n' "$1" "$f"; done; }
  "$found" line | sort -u
else
  echo "${t:-none}"
fi
