# Destination examples

Every example here passed `rudder-cli validate -l . --var-file secrets.vars.yaml` against rudder-iac `origin/main` (7d274cef, after v0.28.0), together with the source and connection files from `SKILL.md`. Each pairs a JavaScript source (`connection_mode.web`) with the destination.

These are minimums. The per-type README in rudder-iac, under `cli/internal/providers/destination/definitions/<type>/README.md`, lists every key. A minimum that validates may still be missing what the real service needs, so read the README before applying.

## Webhook

```yaml
# destinations/storefront-webhook.yaml
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
    webhook_url: https://events.example.com/hook
    webhook_method: POST
    headers:
      - from: Authorization
        to: "{{ .WEBHOOK_AUTH }}"
    connection_mode:
      web: cloud
```

```yaml
# secrets.vars.yaml  (gitignored)
WEBHOOK_AUTH: ""
```

Omit `headers` entirely when the endpoint is open. Omit `webhook_method` to get `POST`.

## Google Analytics 4

```yaml
version: rudder/v1
kind: destination
metadata:
  name: storefront-ga4
spec:
  id: storefront-ga4
  display_name: Storefront GA4
  type: ga4
  definition_version: 1
  enabled: true
  config:
    api_secret: "{{ .GA4_API_SECRET }}"
    client_type: gtag
    measurement_id: "{{ .GA4_MEASUREMENT_ID }}"
    connection_mode:
      web: cloud
```

```yaml
GA4_API_SECRET: ""
GA4_MEASUREMENT_ID: ""
```

`api_secret` is a secret. `client_type: firebase` needs `firebase_app_id` instead of `measurement_id`. `hybrid` mode on web needs `gtag`.

## Amplitude

```yaml
version: rudder/v1
kind: destination
metadata:
  name: storefront-am
spec:
  id: storefront-am
  display_name: Storefront Amplitude
  type: am
  definition_version: 1
  enabled: true
  config:
    api_key: "{{ .AMPLITUDE_API_KEY }}"
    residency_server: standard
    connection_mode:
      web: cloud
```

```yaml
AMPLITUDE_API_KEY: ""
```

`residency_server` is required and has no default. `api_secret` is optional and secret.

## Mixpanel

```yaml
version: rudder/v1
kind: destination
metadata:
  name: storefront-mp
spec:
  id: storefront-mp
  display_name: Storefront Mixpanel
  type: mp
  definition_version: 1
  enabled: true
  config:
    token: "{{ .MIXPANEL_TOKEN }}"
    data_residency: us
    identity_merge_api: simplified
    connection_mode:
      web: cloud
```

```yaml
MIXPANEL_TOKEN: ""
```

`data_residency` and `identity_merge_api` are required and have no defaults.

## Two destinations from one source

Add a second destination spec and one more entry in `connections.yaml`. Do not add a second connections file.

```yaml
spec:
  connections:
    - id: storefront-to-webhook
      source: "#event-stream-source:storefront-source"
      destination: "#destination:storefront-webhook"
      enabled: true
    - id: storefront-to-ga4
      source: "#event-stream-source:storefront-source"
      destination: "#destination:storefront-ga4"
      enabled: true
```
