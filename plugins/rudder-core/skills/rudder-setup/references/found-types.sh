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
# index.html at the top, in public/ or in src/). Frameworks come first and claim the android/ and ios/ folders
# under them, because their apps hold both. Only when it finds none of these does it look for a server: node
# (express, fastify, koa, nest, hapi, hono or restify), python, go, java, dotnet, php, ruby or rust. A package.json
# with none of these frameworks prints none.
#
# An app's folder is the one that holds the file it was found by, except that an Android app's is its Gradle root
# (the nearest folder up with a settings.gradle or settings.gradle.kts), an iOS app's is the one that holds the
# Xcode project, and an index.html in public/ or src/ belongs to this folder. A server's folder inside another
# folder of the same server type is part of that server, such as a module of a Maven or Gradle build.
m() { find . -maxdepth 4 \( -name node_modules -o -name '.?*' -o -name build -o -name dist -o -name Pods -o -name vendor -o -name target -o -name rudder \) -prune -o "$@" 2>/dev/null; }
rel() { sed 's#^\./##'; }
dirs() { sed -n 's#/[^/]*$##p' | rel; }
xc() { sed -nE 's#/[^/]+\.(xcodeproj|xcworkspace)(/.*)?$##p; s#/Podfile$##p' | rel; }
groot() { while IFS= read -r f; do [ -n "$f" ] || continue; d=${f%/*}; until [ -f "$d/settings.gradle" ] || [ -f "$d/settings.gradle.kts" ] || [ "$d" = . ]; do d=${d%/*}; done; [ -f "$d/settings.gradle" ] || [ -f "$d/settings.gradle.kts" ] || d=${f%/*}; printf '%s\n' "$d"; done | rel; }
outer() { dirs | awk '{ a[NR] = $0 } END { for (i = 1; i <= NR; i++) { k = 1; for (j = 1; j <= NR; j++) if (a[j] != a[i] && (a[j] == "." || index(a[i], a[j] "/") == 1)) k = 0; if (k) print a[i] } }'; }
flutter=$(m -name pubspec.yaml -exec grep -lE '^[[:space:]]*sdk:[[:space:]]*flutter' {} +)
rn=$(m -name package.json -exec jq -r 'select(.dependencies["react-native"]) | input_filename' {} \;)
hybrid=$(m -name package.json -exec grep -l '"@capacitor/core"[[:space:]]*:' {} +; m -name config.xml -exec grep -l 'w3\.org/ns/widgets' {} +)
roots=$(printf '%s\n' "$flutter" "$rn" "$hybrid" | sed -n 's#/[^/]*$#/#p')
own() { if [ -n "$roots" ]; then grep -vF -e "$roots"; else cat; fi; }
clients() {
  "$1" flutter "$(printf '%s\n' "$flutter" | dirs)"
  "$1" react_native "$(printf '%s\n' "$rn" | dirs)"
  "$1" javascript "$(printf '%s\n' "$hybrid" | dirs)"
  "$1" unity "$([ -f ProjectSettings/ProjectVersion.txt ] && echo .)"
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
if [ "${1-}" = --apps ]; then
  line() { [ -z "$2" ] || printf '%s\n' "$2" | while IFS= read -r f; do printf '%s %s\n' "$1" "$f"; done; }
  "$found" line | sort -u
else
  echo "${t:-none}"
fi
