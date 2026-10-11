# Destination and connection specs

Every file below validates with `rudder-cli validate -l rudder --var-file rudder/secrets.vars.yaml` on
rudder-cli built from rudder-iac main (7d274cef, 11 Oct 2026). Full per-type documentation, including every
optional key, is in rudder-iac under `cli/internal/providers/destination/definitions/<type>/README.md`.

Layout:

```text
rudder/
  sources/<source-id>.yaml
  destinations/<destination-id>.yaml
  connections.yaml
  secrets.vars.yaml      # git-ignored; never committed
```

Ids are kebab-case and unique per kind. `display_name` matches `^[\w .-]{2,100}$`.

## Source: JavaScript (browser)

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

A `javascript` source is source type `web`, so every destination it connects to needs a `web` entry in
`connection_mode`.

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

## Webhook

```yaml
version: rudder/v1
kind: destination
metadata:
  name: storefront-webhook
spec:
  id: storefront-webhook
  display_name: Storefront Webhook
  type: webhook
  definition_version: 1
  enabled: true
  config:
    webhook_url: https://sink.example.com/hook
    webhook_method: POST
    connection_mode:
      web: cloud
```

- `webhook_url` must be a public http(s) domain. `localhost` and `*.ngrok.io` fail with
  `'webhook_url' is not valid: must be a public http(s) domain URL and must not use localhost or ngrok`.
- Only when the endpoint needs auth, add headers. `from` is the header name and `to` is its value, the
  reverse of the `http` type. Header values are secrets:

  ```yaml
      headers:
        - from: Authorization
          to: '{{ .WEBHOOK_AUTH }}'
  ```

## Google Analytics 4

```yaml
  type: ga4
  definition_version: 1
  enabled: true
  config:
    api_secret: '{{ .GA4_API_SECRET }}'
    client_type: gtag
    measurement_id: '{{ .GA4_MEASUREMENT_ID }}'
    connection_mode:
      web: cloud
```

`measurement_id` starts with `G-`. `web` also supports `device` and `hybrid`.

## Amplitude

```yaml
  type: am
  definition_version: 1
  enabled: true
  config:
    api_key: '{{ .AMPLITUDE_API_KEY }}'
    residency_server: standard   # or EU
    connection_mode:
      web: cloud
```

## Mixpanel

```yaml
  type: mp
  definition_version: 1
  enabled: true
  config:
    token: '{{ .MIXPANEL_TOKEN }}'
    data_residency: us           # us, eu or in
    identity_merge_api: simplified
    connection_mode:
      web: cloud
```

Other types: `rudder-cli` always registers webhook, http, ga4, am, mp, posthog, braze, hs, iterable,
customerio, s3, gcs, bq, snowflake, rs, postgres and a few more. Anything else needs the
`unverifiedDestinations` experimental flag. Ask the user before enabling it.

## Secrets

`rudder/secrets.vars.yaml` is flat `KEY: value` YAML, and the name must end in `.vars.yaml`:

```yaml
WEBHOOK_AUTH: ""
```

- Pass it with `--var-file rudder/secrets.vars.yaml` on `validate` and `apply`. An environment variable
  `RUDDER_<KEY>` overrides the file.
- Substitution pastes the value into the raw text before YAML is parsed, so write every reference in
  single quotes, `'{{ .VAR }}'`, as these samples do. In a double-quoted slot a value containing `"` or `\`
  breaks the YAML or silently changes the secret. A `'` inside the value must be doubled (`''`); the CLI
  reports an unescaped one as an error.
- Every referenced variable must be defined, even for `validate`. A missing one fails with
  `error[project/var-substitution]` and the file, line and column.

## Errors you will meet

| Rule id | Cause | Fix |
|---|---|---|
| `event-stream/connection/semantic-valid` | destination has no `connection_mode` entry for the source type | add `connection_mode: {web: cloud}` |
| `event-stream/connection/enabled-endpoints-valid` (warning) | destination or source not enabled | set `enabled: true` |
| `destination/spec-syntax-valid` | bad config value, for example a localhost webhook URL | follow the message |
| `project/var-substitution` | a `{{ .VAR }}` with no value | add it to the var file or `RUDDER_<VAR>` |
| `project/spec-syntax-parse-valid` | a non-spec YAML file under the location | keep specs in `rudder/`, pass `-l rudder` |
