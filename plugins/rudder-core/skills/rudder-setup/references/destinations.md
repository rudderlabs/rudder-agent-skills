# Destination and connection specs

Every file below validates with `rudder-cli validate -l rudder --var-file rudder/secrets.vars.yaml` on
rudder-cli built from rudder-iac main (d8abd910, 21 Oct 2026). Full per-type documentation, including every
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

That is a web data stream. A mobile app's events belong in an app data stream, which is Firebase. For an
`android_kotlin`, `ios_swift`, `flutter`, `react_native`, `unity`, `android` or `ios` source, use
`client_type: firebase` with the stream's Firebase App ID in place of `measurement_id`, and the source type's
`connection_mode` key. The App ID is not a secret; write it as a literal. Validate also accepts `gtag` on an app
source, so it cannot catch this.

```yaml
  config:
    api_secret: '{{ .GA4_API_SECRET }}'
    client_type: firebase
    firebase_app_id: 1:123456789012:android:0123456789abcdef
    connection_mode:
      android_kotlin: cloud
```

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

Amplitude has two secret keys, `api_key` and `api_secret`. Only `api_key` is required. If the user adds
`api_secret`, reference it the same way, as `'{{ .AMPLITUDE_API_SECRET }}'`.

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

Mixpanel has four secret keys: `token`, `gdpr_api_token`, `service_account_secret` and
`service_account_user_name`. Only `token` is required, unless `user_deletion_api` is `task`, which also requires
`gdpr_api_token`. Reference any of the others the user adds the same way, never as a literal.

Other types: `rudder-cli` always registers these 24: active_campaign, am, attentive_tag, bq, bqstream, braze,
customerio, facebook_conversions, facebook_pixel, ga4, gcs, googleads, hs, http, iterable, mp, postgres, posthog,
rs, s3, s3_datalake, snowflake, tiktok_ads and webhook. A type that is not registered fails validate, which lists
the registered ones. Any other type needs both `RUDDERSTACK_CLI_EXPERIMENTAL=true` and
`RUDDERSTACK_X_UNVERIFIED_DESTINATIONS=true` in the environment of every `validate` and `apply`. Ask the user
before setting them.

## Secrets

`rudder/secrets.vars.yaml` is flat `KEY: value` YAML, and the name must end in `.vars.yaml`. Write each variable
with no value, for the user to fill in:

```yaml
WEBHOOK_AUTH:
```

- Until the user fills it, validate and apply fail with `key "WEBHOOK_AUTH" has a null or empty value`. The
  error names only the first empty key, so ask the user to fill every line at once. Never write
  `WEBHOOK_AUTH: ""`: it validates clean and sends an empty secret, even though that error message suggests empty
  quotes.
- Pass it with `--var-file rudder/secrets.vars.yaml` on `validate` and `apply`. An environment variable
  `RUDDER_<KEY>` overrides the file.
- Substitution pastes the value into the raw text before YAML is parsed, so write every reference in
  single quotes, `'{{ .VAR }}'`, as these samples do. In a double-quoted slot a value containing `"` or `\`
  breaks the YAML or silently changes the secret. Each `'` in the value must reach the spec doubled (`''`); the
  CLI reports a single one as an error.
- The var file is YAML too. When you ask the user to fill it, tell them to write a one-line value in single
  quotes, `NAME: 'value'`, with each `'` of the value written four times, as in `'it''''s'` for `it's`. YAML
  turns the four into two, and the spec's single quotes turn the two into one. Unquoted, YAML cuts the value at
  ` #`, reads a leading `!` or `&` as a tag or an anchor, and drops trailing spaces, and validate still passes.
  A `RUDDER_<KEY>` environment variable is not YAML, so there each `'` is written twice.
- Every referenced variable must be defined, even for `validate`. A missing one fails with
  `error[project/var-substitution]` and the file, line and column.
- A value that spans lines, such as a PEM private key or certificate, keeps its line breaks only from rudder-cli
  0.29.0. Older releases paste it into the spec's text inside the quotes, where YAML turns each line break into a
  space, and validate still passes, so RudderStack stores a key that does not work. Snowflake's key-pair
  `private_key` is such a value. With 0.28.0 or earlier, offer the type's other way to sign in, such as a password
  for Snowflake, or say that this rudder-cli cannot connect that destination. From 0.29.0, ask the user to write
  the value in the var file as a YAML literal block, `NAME: |` with the value's lines below it, each indented by
  two spaces. The reference in the spec keeps its single quotes. A block keeps every character as written, so
  each `'` in it is written twice.

## Errors you will meet

| Rule id | Cause | Fix |
|---|---|---|
| `event-stream/connection/semantic-valid` | destination has no `connection_mode` entry for the source type | add the entry the message names, `{web: cloud}` for a `javascript` source |
| `event-stream/connection/enabled-endpoints-valid` (warning) | destination or source not enabled | set `enabled: true` |
| `destination/spec-syntax-valid` | bad config value, for example a localhost webhook URL | follow the message |
| `project/var-substitution` | a `{{ .VAR }}` with no value | add it to the var file or `RUDDER_<VAR>` |
| none: `key "VAR" has a null or empty value` | the user has not filled `VAR` in the var file | ask the user to fill it; never write `VAR: ""` |
| `project/spec-syntax-parse-valid` | a non-spec YAML file under the location | keep specs in `rudder/`, pass `-l rudder` |
