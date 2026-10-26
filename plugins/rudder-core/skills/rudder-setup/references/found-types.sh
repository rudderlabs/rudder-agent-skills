#!/bin/sh
# Step 2's probe. Run it unchanged from the folder to look in; it changes nothing. It prints the source types the
# code there points to, joined with + when there are several (android_kotlin+javascript), or none.
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
m() { find . -maxdepth 4 \( -name node_modules -o -name '.?*' -o -name build -o -name dist -o -name Pods -o -name vendor -o -name target -o -name rudder \) -prune -o "$@" 2>/dev/null; }
flutter=$(m -name pubspec.yaml -exec grep -lE '^[[:space:]]*sdk:[[:space:]]*flutter' {} +)
rn=$(m -name package.json -exec jq -r 'select(.dependencies["react-native"]) | input_filename' {} \;)
hybrid=$(m -name package.json -exec grep -l '"@capacitor/core"[[:space:]]*:' {} +; m -name config.xml -exec grep -l 'w3\.org/ns/widgets' {} +)
roots=$(printf '%s\n' "$flutter" "$rn" "$hybrid" | sed -n 's#/[^/]*$#/#p')
own() { if [ -n "$roots" ]; then grep -vF -e "$roots"; else cat; fi; }
t=; add() { case "+$t+" in *"+$1+"*) ;; *) t=${t:+$t+}$1 ;; esac; }
[ -n "$flutter" ] && add flutter
[ -n "$rn" ] && add react_native
[ -n "$hybrid" ] && add javascript
[ -f ProjectSettings/ProjectVersion.txt ] && add unity
[ -n "$(m \( -name build.gradle -o -name build.gradle.kts \) -exec grep -lE 'android\.?[Aa]pplication|com\.android\.tools\.build|^[[:space:]]*android[[:space:]]*\{' {} + | own)" ] && add android_kotlin
[ -n "$(m \( -name '*.xcodeproj' -o -name '*.xcworkspace' -o -name Podfile \) -print | own)" ] && add ios_swift
[ -n "$(m -name package.json -exec grep -lE '"(react-dom|vue|svelte|@sveltejs/kit|@angular/core|next|nuxt|vite|preact|solid-js|astro|gatsby|@remix-run/react)"[[:space:]]*:' {} + | own)$(find . -maxdepth 2 \( -path ./index.html -o -path ./public/index.html -o -path ./src/index.html \) -print | own)" ] && add javascript
if [ -z "$t" ]; then
  [ -n "$(m -name package.json -exec grep -lE '"(express|fastify|koa|@nestjs/core|@hapi/hapi|hono|restify)"[[:space:]]*:' {} +)" ] && add node
  [ -n "$(m \( -name pyproject.toml -o -name 'requirements*.txt' -o -name Pipfile -o -name setup.py \) -print)" ] && add python
  [ -n "$(m -name go.mod -print)" ] && add go
  [ -n "$(m \( -name pom.xml -o -name build.gradle -o -name build.gradle.kts \) -print)" ] && add java
  [ -n "$(m \( -name '*.csproj' -o -name '*.fsproj' -o -name '*.sln' \) -print)" ] && add dotnet
  [ -n "$(m -name composer.json -print)" ] && add php
  [ -n "$(m -name Gemfile -print)" ] && add ruby
  [ -n "$(m -name Cargo.toml -print)" ] && add rust
fi
echo "${t:-none}"
