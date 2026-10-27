# Source, connection and destination specs

Step 4 writes the destination spec from `rudder-cli docs destination <type> --source <source type> --id <id>
--json`, which prints the type's keys, allowed values, defaults, patterns, connection modes and secret keys from
the definitions compiled into the installed rudder-cli, plus a spec to start from. This file holds only what that
output cannot say: how to read it, where the files go, the source and connection specs, how to get a webhook
endpoint, and how to write values in the var file. It names no destination keys. Read them from the docs output.

Layout:

```text
rudder/
  sources/<source-id>.yaml
  destinations/<destination-id>.yaml
  connections.yaml
  secrets.vars.yaml      # git-ignored; never committed
```

Ids are lowercase kebab-case, start with a letter and are unique per kind. A destination's secret variable names
are built from its id, so `docs destination` rejects an id that would give an invalid name, with the rule in its
message. `display_name` matches `^[\w .-]{2,100}$`; the docs template sets it to the id.

## Reading the docs output

Step 4 reads `rudder-cli docs destination <type> --source <source type> --id <id> --json` this way.

When it prints an `error`, act on `error.code`:

| `error.code` | What to do |
|---|---|
| `invalid_id` | Build an id that follows the rule `error.message` states and run the command again. This code carries no suggestions. |
| `unsupported_source` | Say this destination takes no events from a `<source type>` source, name the types in `error.validTypes` and ask for another destination. |
| `unknown_type` | Offer `error.suggestions`. When there are none, answer as step 4 does when no type matches the user's words. |
| `unknown_source` | Work out the source type again, as step 2 does. |

Each entry in `fields` describes one key:

- `enum`: offer these values as options. `openEnum` means a template or an `env.` value also passes; offer only
  the `enum` values, and accept only them.
- `pattern` names an entry in `patterns`: a typed value must match its `regex` and must not match its `reject`.
- `min` and `max` bound a string's or a list's length and a number's value.
- `type`: write the value with it, and quote a string YAML would read as a number or a boolean.
- `acceptsTemplate`: a `{{ path || fallback }}` template also passes; offer none.

The template leaves out the keys only a condition requires:

- Add a key whose `requiredIf` conditions all hold, or none of whose `requiredUnless` conditions holds, judging a
  key the spec leaves out by its `default`.
- Add a key whose `requiredWith` names a key the spec has.
- Never add a key whose `excludedWith` or `excludedIf` applies.
- `requiredWhenParentPresent` and `defaultRequiresParent` apply once the parent block or list item is written.

## Source

```yaml
version: rudder/v1
kind: event-stream-source
metadata:
  name: storefront
spec:
  id: storefront
  name: Storefront
  type: javascript
  enabled: true
```

`type` is one of the types `rudder-cli docs source` lists. Each connects to a destination as the token listed
beside it, `javascript` as `web` and every backend language as `cloud`. A destination's `connection_mode` needs an
entry for that token; `docs destination --source <type>` shows only that token under `connectionModes`.

## Connection

One file holds every connection. Entries take no config; an extra key fails validation.

```yaml
version: rudder/v1
kind: event-stream-connections
metadata:
  name: connections
spec:
  connections:
    - id: storefront-to-webhook
      source: "#event-stream-source:storefront"
      destination: "#destination:storefront-webhook"
      enabled: true
```

## A webhook endpoint

A webhook's URL must match the pattern the docs output gives it: a public http(s) domain, so a `localhost` URL
fails validate. When the user has no public endpoint, offer one of these. Each passes every payload through a
third party, so say so, and use the one the user picks.

### A quick tunnel to a server on this machine

Offer it only in an agent whose background processes outlive a shell call, such as Claude Code (fact
background-processes). In an agent that stops them when a call returns, such as Codex, the server and the
tunnel stop with the call and RudderStack's deliveries fail, so offer only a request bin. Cloudflare ends the
HTTPS connection at its edge and forwards each request through the tunnel, so Cloudflare can read the
payloads. It needs `node` and `cloudflared`; installing `cloudflared` is the user's call.

This command starts both in the background and prints the folder, the two process ids and the tunnel's URL,
or exits 3 with the lines that say why it failed:

```sh
d=$(mktemp -d)
node -e "require('http').createServer((q,s)=>{let b='';q.on('data',c=>b+=c).on('end',()=>{console.log(b);s.end('ok')})}).listen(0,'127.0.0.1',function(){console.error('port '+this.address().port)})" >"$d/hook.log" 2>"$d/server.log" &
spid=$!
until grep -qs '^port ' "$d/server.log"; do kill -0 "$spid" 2>/dev/null || { cat "$d/server.log" >&2; exit 3; }; sleep 0.1; done
cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$(sed -n 's/^port //p' "$d/server.log")" >"$d/tunnel.log" 2>&1 &
tpid=$!; n=0
until url=$(sed -n 's/.*| *\(https:\/\/[a-z0-9-]*\.trycloudflare\.com\) *|.*/\1/p' "$d/tunnel.log" | head -n 1); [ -n "$url" ]; do
  if ! kill -0 "$tpid" 2>/dev/null || [ "$n" -ge 300 ]; then tail -n 3 "$d/tunnel.log" >&2; kill "$spid" "$tpid" 2>/dev/null; exit 3; fi
  n=$((n+1)); sleep 0.1
done
echo "D=$d PIDS=$spid $tpid URL=$url"
```

- Write `<URL>` into the spec. Each request's body arrives as one line in `<D>/hook.log`; step 8 reads the
  payloads there.
- When you are not sure the agent keeps background processes, as in Cursor, run `kill -0 <PIDS>` in your next
  call. If it fails, the agent stopped them: say so and offer a request bin.
- Step 9 stops both with `kill <PIDS>`. Never use `pkill` or a match on a name.
- A quick tunnel can stop answering after a few days while its process stays up, and its URL changes each time.
  Start a new one for each run, a resume in a later session included, and write the new URL into the spec
  before step 5's dry run.

### A request bin

A request bin, such as webhook.site, shows each request it receives. Its owner sees every payload.

## Secrets in the var file

`rudder/secrets.vars.yaml` is flat YAML, one `NAME: value` line per variable, and its file name must end in
`.vars.yaml`. Step 4 writes one line per variable the docs output names, with no value, for the user to fill in:

```yaml
NAME:
```

- Until the user fills a line, validate and apply fail with `key "NAME" has a null or empty value`. The error
  names only the first empty line, so ask the user to fill every line at once. Never write `NAME: ""`: it
  validates clean and sends an empty secret, even though that error message suggests empty quotes.
- Pass the file with `--var-file rudder/secrets.vars.yaml` on `validate` and `apply`; nothing else reads it. An
  environment variable `RUDDER_<NAME>` overrides the line `NAME`.
- The CLI reads the value from the var file, then pastes it into the spec's text before parsing it, inside the
  single quotes of the slot. So in the value the CLI reads, every `'` must be doubled.
- The var file is YAML too, so write a one-line value in single quotes, `NAME: 'value'`, with each `'` of the
  value written four times, as in `'it''''s'` for `it's`. YAML turns the four into two, and the slot's quotes
  turn the two into one. Unquoted, YAML cuts the value at ` #`, reads a leading `!` or `&` as a tag or an
  anchor, and drops trailing spaces, and validate still passes. A `RUDDER_<NAME>` environment variable is not
  YAML, so there each `'` is written twice.
- Write a JSON value, such as a service account key, on one line in single quotes, `NAME: '{"type": ...}'`, and
  keep its `\n` escapes as they are. Inside those quotes, each `'` of the value is written four times.
- For a key file, ask the user for its path and run this command with that path and the variable's name in
  place of `key.json` and `NAME`, instead of asking the user to paste the key. It replaces the line `NAME:` with
  the key written as above and prints nothing. Never print a key file or the var file.

  ```sh
  t=$(mktemp) && jq -e . key.json >/dev/null && { grep -v '^NAME:' rudder/secrets.vars.yaml; printf "NAME: '%s'\n" "$(jq -c . key.json | sed "s/'/''''/g")"; } > "$t" && mv "$t" rudder/secrets.vars.yaml
  ```

- A value that spans lines, such as a PEM private key, keeps its line breaks from rudder-cli 0.29.0, the first
  release with rudder-iac#998. #998 merged before #990, so every release that step 1's `cli_features` probe
  accepts has it. Ask the user to write the value in the var file as a YAML literal block, `NAME: |` with the
  value's lines below it, each indented by two spaces. The slot in the spec keeps its single quotes. A block
  keeps every character as written, so each `'` in it is written twice. Up to 0.28.0, and in a build from
  source without #998, the CLI pastes the value into the spec's text, where YAML turns each line break into a
  space, and validate still passes.

## Errors you will meet

| Rule id | Cause | Fix |
|---|---|---|
| `destination/secret-reference` (warning, exit 0) | a secret key holds a value, a default, or anything but one variable reference | write the key's `slot` from the docs output; the value goes in the var file |
| `destination/secret-reference-unique` (warning, exit 0) | one variable fills two secret keys | give each key the `slot` the docs output prints for its own destination id |
| `destination/spec-syntax-valid` | a missing, unknown or invalid config key | read the key's entry in the docs output's `fields` |
| `event-stream/connection/semantic-valid` | the destination has no `connection_mode` entry for the source's token | add the entry the message names, with a mode from `connectionModes` |
| `event-stream/connection/enabled-endpoints-valid` (warning) | destination or source not enabled | set `enabled: true` |
| `project/var-substitution` | a `{{ .NAME }}` with no value, or a `'` not doubled | add it to the var file or `RUDDER_<NAME>`, or double the `'` |
| none: `key "NAME" has a null or empty value` | the user has not filled `NAME` in the var file | ask the user to fill it; never write `NAME: ""` |
| `project/spec-syntax-parse-valid` | a YAML syntax error in a spec, or a non-spec YAML file under the location | fix the line it names; keep specs in `rudder/`, pass `-l rudder` |
