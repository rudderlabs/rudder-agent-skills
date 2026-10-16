# Go recipe (`github.com/rudderlabs/ai-sdk-go`, MCP servers only)

The Go module (package `rudderstackai`) instruments MCP servers built on the official `github.com/modelcontextprotocol/go-sdk`. It sends no chat or background events: Go code that calls a model directly has no SDK and stays `unsupported` in the plan.

| Needs | |
|---|---|
| Go | 1.27+ |
| MCP SDK | `github.com/modelcontextprotocol/go-sdk` v1.8 (`server_name` and `request_id` are read through reflection pinned to v1.8; on another version they fall back to `unknown`). `github.com/mark3labs/mcp-go` is not supported: mark that server `blocked` |
| RudderStack client | `github.com/rudderlabs/analytics-go/v4`, the app's existing one or a new one |

`<VERSION>` is the first tagged release of the module (it ships spec v0.3). Check with `go list -m -versions github.com/rudderlabs/ai-sdk-go`; with no tag yet, stop and tell the user instead of pinning a branch or pseudo-version.

## 1. Install

```bash
go get github.com/rudderlabs/ai-sdk-go@<VERSION>
go mod tidy
```

`go.mod` records the exact version. Do not bump the app's `go-sdk` or `analytics-go`.

## 2. Wrap the server

Once, after the tools are added and before `server.Run` or the HTTP handler:

```go
import (
	"github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	analytics "github.com/rudderlabs/analytics-go/v4"
	rudderstackai "github.com/rudderlabs/ai-sdk-go"
)

client, err := analytics.NewWithConfig(os.Getenv("RUDDERSTACK_WRITE_KEY"), analytics.Config{
	DataPlaneUrl: os.Getenv("RUDDERSTACK_DATA_PLANE_URL"), // the plan's env var names
})
defer client.Close() // flushes queued events

err = rudderstackai.WrapMCPServer(server, rudderstackai.Options{
	Analytics: client,
	Identify: func(ctx context.Context, tok *auth.TokenInfo) (rudderstackai.Identity, error) {
		if tok == nil { // stdio or no auth: events go out as ai_system
			return rudderstackai.Identity{}, nil
		}
		return rudderstackai.Identity{UserID: tok.UserID, AccountID: workspaceOf(tok)}, nil
	},
	RequestContext: rudderstackai.RequestContextOptions{Intents: []string{"debug_delivery", "build_audience"}}, // without other
	// EventRules: rudderstackai.EventRules{Tools: map[string]rudderstackai.ToolEventRule{"create_audience": {Event: "audience_created"}}},
	// CapabilityRequests: &rudderstackai.CapabilityRequestOptions{Capabilities: []string{"bulk_export"}},
	// Transport: rudderstackai.TransportStdio, // set for stdio and SSE; Streamable HTTP is detected
})
if err != nil {
	log.Fatal(err) // nil server, missing Analytics, or a rule named ai_* / mcp_*
}
```

- `Identity` fields: `UserID`, `AnonymousID` (default `ai_system`), `AccountID`, `OAuthClientID`, `TokenScopes`, `AuthMethod`, `Country`. If `Identify` fails, only the token's own user ID and scopes are used.
- `RequestContext` is on by default: `intent` (from the list, plus `other`) and `user_sentiment`; `Disabled: true` turns it off. `CaptureContent: true` adds `call_reason` and `capability_detail`, masked and capped at 200 characters.
- Elicitation: call `rudderstackai.Elicit(ctx, session, params)` instead of `session.Elicit`, so clients without elicitation support are recorded too.
- MCP Events (`MCPEvents: true`, `TrackMCPEventSubscription`, `WrapMCPEventSender`) only when the plan turns it on: experimental.
- Existing hand-built `mcp_<method>_success` / `mcp_<method>_error` events that carry raw requests or results are legacy events: map them in the plan and keep them behind the flag until the plan's date.

## 3. Flush

There is no SDK-level flush: `client.Close()` on the analytics-go client sends what is queued. Call it in the existing shutdown path (signal handler, `defer` in `main`).
