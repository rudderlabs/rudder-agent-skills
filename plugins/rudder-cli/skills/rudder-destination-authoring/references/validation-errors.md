# Validation errors seen

Each message below was produced by `rudder-cli validate` built from rudder-iac `origin/main` (7d274cef), by mutating a validated webhook project one change at a time. File and line numbers differ per project.

| Message (shortened) | Cause | Fix |
|---|---|---|
| `undefined variable "WEBHOOK_AUTH"` (rule `project/var-substitution`) | The spec references a variable that no var file or `RUDDER_` environment variable defines | Pass `--var-file`, or add the key to the file |
| `variable file must use the .vars.yaml or .vars.yml suffix` | `--var-file` points at a file with another name | Rename it to `<name>.vars.yaml` |
| `destination type 'slack' is not supported; supported types: ...` | The type is unknown, or unverified with the flags off | Pick a type from the printed list, or set `RUDDERSTACK_CLI_EXPERIMENTAL=true` and `RUDDERSTACK_X_UNVERIFIED_DESTINATIONS=true` |
| `unknown config field "webhookUrl"` together with `'webhook_url' is required` | A camelCase key | Use snake_case |
| `'webhook_url' is not valid: must be a public http(s) domain URL and must not use localhost or ngrok` | Localhost, an IP address or an ngrok host | Use a public hostname |
| `'definition_version' is required` | The key is missing from `spec` | Add `definition_version: 1` |
| `'display_name' is not valid: must be 2-100 characters ...` | The name is too short or has other characters | Use letters, digits, underscore, space, period, hyphen |
| `'headers[0].to' expected type 'string', got unconvertible type 'int'` | An unquoted number as a header value | Quote it |
| `destination '<id>' config has no 'connection_mode' entry for source type 'web'` | The destination lacks an entry for the connected source's type | Add `connection_mode.web: cloud`, or the token the message names |
| `'kind' must be one of [...]` | A misspelled kind, such as `event-stream-connection` | Use the exact kind from the printed list |
| `kind 'destination' is not supported with version 'rudder/v0.1'` | A legacy `version` | Use `rudder/v1` |
| `warning[event-stream/connection/enabled-endpoints-valid]: ... destination '<id>' is disabled` | `enabled` is missing on the destination, or false | Write `enabled: true` |
| `access token is required, please run rudder-cli auth login, or set the access token via the RUDDERSTACK_ACCESS_TOKEN environment variable` | `validate` on a CLI that checks credentials first, with no token | Ask the user to run `rudder-cli auth login` or export `RUDDERSTACK_ACCESS_TOKEN` in their shell |
| `fetching workspace information: http status code: 401` | A token is set and the API rejects it | The user needs a valid token for the right workspace |
