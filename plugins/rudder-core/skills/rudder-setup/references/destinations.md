# Source, connection and destination specs

Step 4 writes the destination spec from `rudder-cli docs destination <type> --source <source type> --id <id>
--json`, which prints the type's keys, allowed values, defaults, patterns, connection modes and secret keys from
the definitions compiled into the installed rudder-cli, plus a spec to start from. This file holds only what that
output cannot say: where the files go, the source and connection specs, how to get a webhook endpoint, and how to
write values in the var file. It names no destination keys. Read them from the docs output.

Layout:

```text
rudder/
  sources/<source-id>.yaml
  destinations/<destination-id>.yaml
  connections.yaml
  secrets.vars.yaml      # git-ignored; never committed
```

Ids are lowercase kebab-case, start with a letter and are unique per kind. A destination's secret variable names
are built from its id, so `docs destination` rejects an id that would give an invalid name and suggests one that
works. `display_name` matches `^[\w .-]{2,100}$`; the docs template sets it to the id.

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
fails validate. When the user has no public endpoint, offer one of these:

- A quick tunnel to a server on this machine. Start a server that accepts POST requests and prints each body,
  for example `node -e "require('http').createServer((q,s)=>{let b='';q.on('data',c=>b+=c).on('end',()=>{console.log(b);s.end('ok')})}).listen(8787)"`,
  then `cloudflared tunnel --url http://localhost:8787`, which prints an `https://<name>.trycloudflare.com` URL
  that passes. Only this machine sees the payloads. `cloudflared` must be installed, and installing it is the
  user's call. A quick tunnel stops with its process and can stop answering after a few days while the process
  stays up, so start a new one for each run. The URL changes each time, and the destination spec must follow.
- A request bin, such as webhook.site, which shows each request it receives. It is a third party that sees every
  payload, so use one only when the user says yes to that.

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

- A value that spans lines, such as a PEM private key, cannot go through the var file yet. The CLI pastes it
  into the spec's text, where YAML turns each line break into a space, and validate still passes. When a secret
  key's pattern accepts line breaks (its `regex` starts with `(?s)`), offer the type's other way to sign in, such
  as a password, or say this workflow cannot connect that destination yet.

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
