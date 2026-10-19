# Go recipes (`github.com/rudderlabs/ai-sdk-go`, spec v0.3)

Go 1.26+. Events carry `context.wrapperLibrary.name: ai-sdk-go`. The root module (package `rudderstackai`) holds the interaction API, the `net/http` middleware and MCP support (`ruddermcpgo` included) and pulls no provider SDK. Each provider integration, and `rudderotel`, is its own module, so an MCP-only service never pulls provider SDKs.

| Needs | |
|---|---|
| Go | 1.26+ (root module and every integration module) |
| Repository access | the repository is internal until it is made public: `GOPRIVATE=github.com/rudderlabs/*` and git credentials for github.com/rudderlabs (a `~/.netrc` entry, or `git config --global url."git@github.com:".insteadOf "https://github.com/"`) |
| RudderStack client | `github.com/rudderlabs/analytics-go/v4` v4.3.1+, the app's existing one or a new one |
| Model clients | `github.com/openai/openai-go/v3` v3.70.0+, `github.com/anthropics/anthropic-sdk-go` v1.78.0+, `google.golang.org/genai` v1.72.0+, `github.com/aws/aws-sdk-go-v2/service/bedrockruntime` v1.63.1+; anything else through `RecordCall` |
| MCP servers | `github.com/modelcontextprotocol/go-sdk` v1.8.0 (`rudderstackai.WrapMCPServer`) or `github.com/mark3labs/mcp-go` v0.55.1+, tested through v1.2.1 (`ruddermcpgo.WrapServer`) |

`<VERSION>` is `v0.1.0`, the first release and the one that ships spec v0.3. Every module is tagged with it: `v0.1.0` for the root module, `<dir>/v0.1.0` for the others (`rudderopenai/v0.1.0`, `rudderanthropic/v0.1.0`, `ruddergenai/v0.1.0`, `rudderbedrock/v0.1.0`, `rudderotel/v0.1.0`). Check with `go list -m -versions github.com/rudderlabs/ai-sdk-go`; if it fails, fix repository access first. Never pin a branch or pseudo-version.

Runnable references in the SDK repository's `examples/`: `openai`, `anthropic`, `google-genai`, `bedrock-converse`, `background-agent`, `manual`, `mcp-server`, `mcp-server-mcpgo`, `mcp-stateless-http`, `mcp-auth`.

## 1. Install

Prerequisite while the repository is internal (else `go get` fails with a 404 or a checksum-database error):

```bash
export GOPRIVATE='github.com/rudderlabs/*'   # or: go env -w GOPRIVATE='github.com/rudderlabs/*'
```

```bash
go get github.com/rudderlabs/ai-sdk-go@<VERSION>
go get github.com/rudderlabs/ai-sdk-go/rudderopenai@<VERSION>   # one per provider the plan lists:
                                                              # rudderanthropic, ruddergenai, rudderbedrock
go get github.com/rudderlabs/ai-sdk-go/rudderotel@<VERSION>     # only with a tracing.trace_id_source
go get github.com/rudderlabs/analytics-go/v4@v4.3.1              # only when the plan says client: new
go mod tidy
```

`go.mod` records the exact versions. `ruddermcpgo` is a package of the root module, not a module of its own. Do not bump the app's provider SDKs, `go-sdk`, `mcp-go` or `analytics-go`; each module requires only the minimums above, so `go get` raises a dependency only when the app is below them: name any such raise in the diff summary.

## 2. Configure once at startup

Next to the existing `analytics-go` client, in `main` or the setup function that builds it:

```go
import (
	analytics "github.com/rudderlabs/analytics-go/v4"
	rudderstackai "github.com/rudderlabs/ai-sdk-go"
)

client, err := analytics.NewWithConfig(os.Getenv("RUDDERSTACK_WRITE_KEY"), analytics.Config{
	DataPlaneUrl: os.Getenv("RUDDERSTACK_DATA_PLANE_URL"), // the plan's env var names
})
if err != nil {
	return err
}
defer client.Close() // sends queued events

if err := rudderstackai.Configure(
	rudderstackai.WithAnalytics(client),
	rudderstackai.WithCaptureContent(false), // spec.config.capture_content
	// rudderstackai.WithToolBreakdown(true),    // spec.config.tool_breakdown
	// rudderstackai.WithServerFeedback(false),  // only when client_events.opt_out lists server_feedback
	// rudderstackai.WithIdentityFromCookies(false), // apps with no browser
	// rudderstackai.WithTraceIDFrom(rudderotel.TraceID), // only with a tracing.trace_id_source (section 9)
); err != nil {
	return err
}
```

`Configure` changes only the options passed and returns an error for an invalid one (changing nothing). `WrapMCPServer` / `ruddermcpgo.WrapServer` take their own options; `Configure` does not apply to them.

## 3. Wrap the model client

Attach the integration where the client is constructed; the client keeps its type and API:

| Integration | Change |
|---|---|
| OpenAI (Chat Completions, Responses) | `openai.NewClient(rudderopenai.WithTracking())`; gateways: `rudderopenai.WithTracking(rudderopenai.WithProvider("openrouter"))` (`litellm`, `azure.ai.openai`, ...) |
| Anthropic | `anthropic.NewClient(rudderanthropic.WithTracking())`; Bedrock or Vertex AI clients: `rudderanthropic.WithTracking(rudderanthropic.WithProvider("aws.bedrock"))` (or `"gcp.vertex_ai"`) placed before `bedrock.WithLoadDefaultConfig` / `vertex.WithGoogleAuth` |
| Google Gen AI | `genai.ClientConfig{..., HTTPClient: ruddergenai.HTTPClient(nil)}`; Vertex AI with Google Cloud credentials: wrap an authenticated client, `ruddergenai.HTTPClient(google.DefaultClient(ctx, "https://www.googleapis.com/auth/cloud-platform"))`, or call `cfg.UseDefaultCredentials()` after setting `HTTPClient`. Provider is `gcp.gemini` (Gemini API) or `gcp.vertex_ai`, from the request URL |
| Bedrock (`Converse`, `ConverseStream`) | `bedrockruntime.NewFromConfig(cfg, rudderbedrock.WithTracking())` |
| Anything else | inside the interaction: `in.RecordCall(rudderstackai.LLMCall{Provider: "mistral_ai", Model: res.Model, InputTokens: ..., OutputTokens: ..., ResponseID: res.ID})`; tool calls with `in.RecordToolCalls(...)` / `in.RecordToolResult(...)` (example `manual`) |

Pass the interaction's `ctx` to every model call: a call made with a context that carries no interaction is reported as its own answer. Retries inside openai-go and anthropic-sdk-go count as one call with the final attempt's outcome (as in Node.js and Python); genai retries are recorded per attempt; a Bedrock operation is recorded once. The last call decides the status. `requested_model` is sent whenever another model served the call, by the openai-go, anthropic-sdk-go and genai integrations (not Bedrock) and on `RecordCall` with `RequestedModel`; a dated snapshot of the requested model (`gpt-4o-2024-08-06` for `gpt-4o`) counts as the same model.

## 4. Chat surface: one `RunInteraction` per user turn

Identity: wrap the chat routes with `rudderstackai.Middleware`, which reads the RudderStack JavaScript SDK cookies and sets `client_disconnected` when the request is cancelled before the handler returns. Then put the request's identity on the context once and open the interaction:

```go
http.Handle("/chat", rudderstackai.Middleware(http.HandlerFunc(chatHandler)))

func chatHandler(w http.ResponseWriter, r *http.Request) {
	ctx := rudderstackai.WithValues(r.Context(), rudderstackai.ContextValues{
		UserID:    currentUser(r).ID, // identity.user_id; no placeholder fallback
		AccountID: currentUser(r).WorkspaceID,
		Surface:   rudderstackai.SurfaceWeb, // the surface's channel from the plan
		Request:   r,                        // cookies; redundant under Middleware, needed without it
	})

	var answer, interactionID string
	err := rudderstackai.RunInteraction(ctx, rudderstackai.InteractionOptions{
		ConversationID: body.ConversationID,
		InteractionID:  validUUID(r.Header.Get("x-interaction-id")), // interaction_id_source: client or app; "" lets the SDK mint one
		Feature:        "support_bot",
		InputMethod:    "text",
		PromptText:     body.Message, // sent only with content capture on
	}, func(ctx context.Context, in *rudderstackai.Interaction) error {
		completion, err := llm.Chat.Completions.New(ctx, params)
		if err != nil {
			return err // fails the answer; returned unchanged
		}
		answer, interactionID = completion.Choices[0].Message.Content, in.ID()
		return nil
	})
	// ...existing error handling and response; always return interactionID to the client
}
```

- `StartInteraction(ctx, opts)` returns `(ctx, *Interaction)` for code that cannot use a callback; call `in.End(rudderstackai.EndOptions{})` when the answer is out.
- Streams: read them inside the `RunInteraction` function (`defer stream.Close()`); there is no `bind`, and a stream still open when the function returns is recorded as cancelled.
- `client_disconnected` is detected only under `Middleware`; `paused` never is. Otherwise pass `EndOptions{ClientDisconnected: true}` or `EndOptions{Status: rudderstackai.StatusPaused, PauseReason: ...}` from the app's own handling (`StartInteraction` + `End`).
- analytics-go gives every track call without an `anonymousId` a random one, also when `userId` is set, so with no cookie and no `AnonymousID` the `anonymousId` differs per event: join AI events to users on `userId`.
- Statuses from the integrations: an Anthropic `max_tokens` or OpenAI/Gemini/Bedrock length stop on the last call makes the answer `incomplete` with `error_type: length`; a content filter is an `error`.
- Attachments: `AttachmentCount` (`*int`, `rudderstackai.Ptr(n)`) and `AttachmentTypes`; never names or content. Extras: `EndOptions{ExtraProperties: ...}`.

## 5. Feedback (server copy)

```go
rudderstackai.TrackAction(ctx, rudderstackai.TrackActionOptions{
	ActionType:     rudderstackai.ActionFeedbackGiven, // ActionCopiedResponse, ActionRegenerated, ...
	InteractionID:  req.InteractionID,
	ConversationID: req.ConversationID,
	UserID:         currentUser(r).ID,
	Surface:        rudderstackai.SurfaceWeb,
	ActionDetails:  map[string]any{"feedback_type": "thumbs", "feedback_value": 1},
})
```

`InteractionID` and `ConversationID` are required; skip the call when they are missing or not UUIDs. With `client_events.opt_out: [server_feedback]`, keep the call and set `WithServerFeedback(false)` once.

## 6. Background surface: one `RunTask` per run

```go
ctx = rudderstackai.WithValues(ctx, rudderstackai.ContextValues{AccountID: job.WorkspaceID, OnBehalfOf: job.RequestedBy})
err := rudderstackai.RunTask(ctx, "nightly-digest", rudderstackai.TaskOptions{ // task_name
	TriggerSource:  "schedule",
	ConversationID: "nightly-digest:" + job.WorkspaceID,
	Feature:        "digest",
}, func(ctx context.Context, task *rudderstackai.Interaction) error {
	_, err := claude.Messages.New(ctx, params)
	return err
})
```

- No user: events go out as `anonymousId: ai_system`; tasks never read cookies or the context's user. Customer in `AccountID`, person in `OnBehalfOf`, a stable scoped `ConversationID`.
- A `RunTask` inside another interaction or task is a child: `parent_interaction_id`, `conversation_id` and `trigger_source: agent` default from it (example `background-agent`).
- A run started by an MCP Events update: `TriggerSource: "mcp_event"`, `TriggerEventID` set to the update's `event_id`.
- A top-level task waits for its own classification and score and calls `Flush()` on its client when the client implements `rudderstackai.Flusher`; analytics-go does not, so `client.Close()` before exit is still needed (section 7).

## 7. Flush

`analytics-go` has no flush method: it sends its queue on `Close()`. In the existing shutdown path (signal handler, `defer` in `main`), and before a script, worker or serverless handler exits:

```go
rudderstackai.Flush(0) // waits for pending classifications, scores and held provider retries (0: classifier timeout + 1 s); false if they did not finish
client.Close()         // sends queued events
```

`Flush` then calls `Flush()` on every client the SDK used (MCP wrappers' included) that implements `rudderstackai.Flusher`; analytics-go does not, so `Close()` is what sends its queue.

## 8. Optional config (only what the plan lists)

```go
err := rudderstackai.Configure(
	rudderstackai.WithEventRules(rudderstackai.EventRules{Tools: map[string]rudderstackai.ToolEventRule{
		"create_ticket": {Event: "ticket_created"},
	}}),
	rudderstackai.WithClassifier(&rudderstackai.ClassifierOptions{
		Client:  rudderanthropic.ClassifierClient(anthropic.NewClient(), "claude-haiku-4-5"), // the app's own client and key
		Intents: []string{"refund_request", "order_status", "product_question"},             // without other
	}),
	rudderstackai.WithEvaluator(judge), // func(ctx, EvaluationTurn) ([]Score, error), 5 s, after each successful answer
	rudderstackai.WithPrices(map[string]rudderstackai.ModelPrice{
		"gpt-4.1-mini": {TokenPrice: rudderstackai.TokenPrice{InputPerMtok: 0.4, OutputPerMtok: 1.6, CachedInputPerMtok: rudderstackai.Ptr(0.1)}},
		// "gemini-2.5-flash": {Provider: "gcp.gemini", ...} and a second entry via RegisterPrice with Provider: "gcp.vertex_ai"
	}),
)
```

- Scores from elsewhere: `rudderstackai.TrackScore(ctx, rudderstackai.TrackScoreOptions{Score: rudderstackai.Score{EvaluationName: "groundedness", ScoreValue: &v, Evaluator: rudderstackai.EvaluatorModel}, InteractionID: iid, ConversationID: cid})`.
- Prices: `TierMultipliers`, `LongContext`, `ServerToolPerCall` and `CacheWrite1hPerMtok` as the plan lists. Gemini API (`gcp.gemini`) and Vertex AI (`gcp.vertex_ai`, also Anthropic on Vertex AI) are priced separately: a price with `Provider` covers that one only, a price without covers both (`google` and `google.vertex` still work as aliases). Azure deployments: `WithAzureDeploymentModels`.

## 9. trace_id

Opt-in, as in Node.js and Python: interactions never read it without configuration (no `rudderotel` registration, no `trace_id`). Only with a `tracing.trace_id_source`: an OpenTelemetry app registers `rudderstackai.WithTraceIDFrom(rudderotel.TraceID)` (the active span's trace ID; no span is created or exported); another tool passes `InteractionOptions.TraceID` or `in.SetTraceID(...)`. A value set on the interaction wins. MCP servers are the exception: a request's `_meta` `traceparent` (else `com.rudderstack/trace_id`) always becomes `trace_id`, with no option to turn it off.

## 10. Legacy event behind a flag

```go
if os.Getenv("AI_EVENTS_LEGACY_EVENT") != "false" {
	_ = client.Enqueue(analytics.Track{UserId: userID, Event: "chatTurnCompleted", Properties: props}) // unchanged
}
```

## 11. MCP server on the official go-sdk: `WrapMCPServer`

Once, after the tools are added and before `server.Run` or the HTTP handler:

```go
import (
	"github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	rudderstackai "github.com/rudderlabs/ai-sdk-go"
)

err = rudderstackai.WrapMCPServer(server, rudderstackai.Options{
	Analytics: client,
	Identify: func(ctx context.Context, tok *auth.TokenInfo) (rudderstackai.Identity, error) {
		if tok == nil { // stdio or no auth: events go out as ai_system
			return rudderstackai.Identity{}, nil
		}
		workspace, _ := tok.Extra["workspace_id"].(string)
		return rudderstackai.Identity{UserID: tok.UserID, AccountID: workspace}, nil
	},
	RequestContext: rudderstackai.RequestContextOptions{Intents: []string{"debug_delivery", "build_audience"}}, // without other
	// EventRules: rudderstackai.EventRules{Tools: map[string]rudderstackai.ToolEventRule{"create_audience": {Event: "audience_created"}}},
	// CapabilityRequests: &rudderstackai.CapabilityRequestOptions{Capabilities: []string{"bulk_export"}},
	// ServerName: "workspace-mcp", // when several distinct servers share a name
	// Transport: rudderstackai.TransportStdio, // set for stdio and SSE; Streamable HTTP is detected
})
if err != nil {
	log.Fatal(err) // nil server, missing Analytics, or a rule named ai_* / mcp_*
}
```

- Serves protocol 2025-06-18, 2025-11-25 and 2026-07-28 (stateless) on v1.8. Examples: `mcp-server`, `mcp-auth` (bearer token and `Identify`), `mcp-stateless-http` (2026-07-28 with an `input_required` elicitation).
- `Identity` fields: `UserID`, `AnonymousID` (default `ai_system`), `AccountID`, `OAuthClientID` (from your verifier's `Extra`), `TokenScopes`, `AuthMethod`, `Country`. If `Identify` fails or panics, the request is anonymous.
- `RequestContext` is on by default: `intent` (from the list, plus `other`) and `user_sentiment`; `Disabled: true` turns it off. `CaptureContent: true` adds `call_reason` and `capability_detail`, masked and capped at 200 characters.
- Elicitation: `rudderstackai.Elicit(ctx, req.Session, params)` instead of `session.Elicit`, so clients without elicitation support are recorded too.
- State is per server name, per process: give each distinct server its own name; servers rebuilt per request under one name share it.
- A declared tool event is still sent when the call fails input validation, with `tool_status: error`. A 2026-07-28 retry that answers an `input_required` elicitation keeps the leg's `call_index` and `ms_since_previous_call` (the leg itself sends no `mcp_tool_called`).

## 12. MCP server on mcp-go: `ruddermcpgo.WrapServer`

```go
import "github.com/rudderlabs/ai-sdk-go/ruddermcpgo"

s := server.NewMCPServer("workspace-mcp", "1.4.0", server.WithToolCapabilities(true))
// s.AddTool ...
if err := ruddermcpgo.WrapServer(s, ruddermcpgo.Options{
	Analytics: client,
	Identify: func(ctx context.Context) (rudderstackai.Identity, error) {
		workspace, _ := ctx.Value(workspaceKey{}).(string) // set by the app's auth, e.g. server.WithHTTPContextFunc
		return rudderstackai.Identity{AccountID: workspace}, nil
	},
	RequestContext: rudderstackai.RequestContextOptions{Intents: []string{"debug_delivery", "build_audience"}},
	// Transport: rudderstackai.TransportStdio,
}); err != nil {
	log.Fatal(err)
}
```

- Same options and events as `WrapMCPServer`, except `Identify` gets only the context: mcp-go verifies no bearer tokens, so read what the app's own auth put there.
- Supported mcp-go v0.55.1 and later (CI runs v1.1.1 and v1.2.1); adding `ruddermcpgo` never upgrades the app's mcp-go. Protocol 2026-07-28 only on v1.x; on v0.x a newer client falls back to `initialize`. Example: `mcp-server-mcpgo`.
- Elicitation: `ruddermcpgo.RequestElicitation(ctx, s, request)` in place of `s.RequestElicitation`.

Both: MCP Events (`MCPEvents: true`, `TrackMCPEventSubscription`, `WrapMCPEventSender`, and the `ruddermcpgo` equivalents) only when the plan turns it on: experimental. A subscription change without `SubscriptionID` or `EventName`, or a delivery without `SubscriptionID`, `EventName` or `EventID`, is dropped with one warning per process (never sent with placeholders); the wrapped sender still runs and returns its result unchanged. Existing hand-built `mcp_<method>_success` / `mcp_<method>_error` events that carry raw requests or results are legacy events: keep them behind the flag until the plan's date. A Go agent that calls tracked MCP servers sends `in.ID()` as `com.rudderstack/interaction_id` in the request `_meta` itself; no Go integration adds it.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Warning `[rudderstack-ai] no RudderStack client configured` | `Configure(WithAnalytics(...))` did not run before the first call |
| Every model call is its own answer | the call used a context without the interaction (pass the `ctx` the function receives) |
| A streamed answer recorded as cancelled | the stream was read after `RunInteraction` returned |
| Events missing from a script | `rudderstackai.Flush(0)` and `client.Close()` before exit |
| `go get` fails with 404, `terminal prompts disabled` or a `sum.golang.org` error | `GOPRIVATE` or git credentials missing (section 1) |

`RUDDERSTACK_AI_DEBUG=1` logs everything tracking drops at debug level through the default `log/slog` handler, prefixed `[rudderstack-ai]` (or `slog.SetLogLoggerLevel(slog.LevelDebug)`).
