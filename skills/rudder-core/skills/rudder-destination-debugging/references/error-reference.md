# Destination Error Reference

Detailed status codes, error categories, and destination-specific patterns for delivery debugging.

## HTTP Status Code Taxonomy

RudderStack uses HTTP status codes from the destination API response to decide how to handle each event batch.

### Success codes

| Code | Name | Behavior |
|------|------|----------|
| 200 | OK | Delivered — no further action |
| 201 | Created | Delivered — no further action |
| 202 | Accepted | Delivered (async processing) — no further action |
| 204 | No Content | Delivered — no further action |

### Special RudderStack codes

These are not standard HTTP status codes — RudderStack uses them internally to signal non-delivery outcomes that are not errors.

| Code | Name | Behavior | Typical cause |
|------|------|----------|--------------|
| 298 | Filtered | Event dropped without delivery | Transformation returned `false`, `null`, or `[]` |
| 299 | Suppressed | Event blocked without delivery | Tracking-plan governance (`block` mode) |

### Retried codes (temporary failures — events are safe)

| Code | Name | Retry behavior |
|------|------|---------------|
| 429 | Too Many Requests | Retried with exponential backoff |
| 500 | Internal Server Error | Retried |
| 502 | Bad Gateway | Retried |
| 503 | Service Unavailable | Retried |
| 504 | Gateway Timeout | Retried |

### Aborted codes (permanent failures — require manual fix)

| Code | Name | What it usually means |
|------|------|-----------------------|
| 400 | Bad Request | Payload rejected by destination API — wrong field, type mismatch, missing required field |
| 401 | Unauthorized | API key invalid, expired, or missing |
| 402 | Payment Required | Destination account on free tier; feature not available |
| 403 | Forbidden | Credentials valid but insufficient permissions; IP not allowlisted |
| 404 | Not Found | Endpoint URL wrong; resource (e.g. list, audience, custom field) deleted |
| 405 | Method Not Allowed | Integration sending to wrong HTTP method — likely a transformer bug |
| 410 | Gone | API endpoint permanently removed — integration needs upgrade |
| 422 | Unprocessable Entity | Payload structure valid but business logic rejected it |
| 424 | Failed Dependency | A prerequisite resource doesn't exist (e.g. custom field not created yet) |

## Error Category Details

### `dataValidation`

The destination API accepted the request but rejected the payload content. The event schema doesn't match what the destination expects.

**Common triggers:**
- Sending a string where the destination expects a number (e.g. `"revenue": "49.99"` instead of `"revenue": 49.99`)
- Missing a required field (e.g. destination requires `email` but the event has none)
- Sending an unknown/unexpected field that the destination rejects in strict mode
- Event name contains characters the destination doesn't allow

**How to diagnose:**
1. Get the exact error message from the destination error log
2. Inspect the raw event payload via live events
3. Cross-reference against the destination's field requirements in its RudderStack docs

### `network`

An HTTP error occurred during delivery. May be on the destination side or an intermediate network failure.

**Sub-types:**
- `retryable` — 5xx or network timeout; destination API temporarily unavailable
- `throttled` — 429; destination enforcing request rate limits

**How to diagnose:**
1. Check the destination's public status page for incidents
2. Review delivery latency — a spike indicates destination-side slowness
3. Check if a traffic spike on your side triggered rate limiting

### `transformation`

A user-defined transformation attached to the destination threw a JavaScript error or returned an invalid result.

**Common triggers:**
- Runtime error in transformation code (accessing a property on `undefined`, etc.)
- Transformation returns an object with a missing required field
- Transformation function signature mismatch

**How to diagnose:**
1. Check the transformation error log for the stack trace
2. Ask Claude: "test transformation \<id\> against this event payload \<paste payload\>"
3. Fix the transformation and save via MCP or the dashboard

### `platform`

An internal RudderStack error — not caused by your events or destination config. Usually transient.

**Actions:**
- Check RudderStack status page
- If persistent (> 30 min), contact support

## Auth Failure Patterns by Auth Type

### API Key

| Symptom | Fix |
|---------|-----|
| 401 with "invalid API key" | Rotate key in destination settings |
| 403 with "key does not have permission" | Check key scopes in destination provider settings |
| 401 after key was recently rotated | Update the key in RudderStack destination config |

### OAuth

| Symptom | Fix |
|---------|-----|
| 401 with "token expired" | Re-authorize OAuth connection in destination settings |
| 401 with "invalid grant" | OAuth app was revoked; re-authorize |
| 403 with "insufficient scope" | Re-authorize with broader OAuth scopes |

### Basic Auth (username + password)

| Symptom | Fix |
|---------|-----|
| 401 with "wrong credentials" | Update username/password in destination config |

## Common Destination-Specific Patterns

### Amplitude

- **400 "Invalid API key"** → verify the Amplitude API key (not the secret key); key must be from the correct Amplitude project
- **400 "Invalid user ID"** → userId and anonymousId cannot both be empty; at least one must be present in the event
- **429** → Amplitude enforces per-project rate limits; reduce throughput or contact Amplitude to raise the limit

### Braze

- **400 "external_id is required"** → Braze requires `userId`; anonymousId-only events are not accepted
- **400 "Invalid attribute name"** → attribute names must start with a letter and contain only alphanumeric chars and underscores
- **429** → Braze enforces per-endpoint rate limits; check Braze dashboard for current usage

### Segment (forward/mirror)

- **400 "writeKey is invalid"** → the write key in destination config must match the Segment source write key exactly
- **403** → Segment source may be paused or the write key revoked

### Salesforce

- **401 "Session expired or invalid"** → OAuth token expired; re-authorize the Salesforce connection
- **400 "FIELD_INTEGRITY_EXCEPTION"** → required Salesforce field not populated; check field mapping in destination config
- **403 "INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY"** → Salesforce user lacks permission on a related object

### Warehouse (Snowflake, BigQuery, Redshift)

| Error pattern | Cause | Fix |
|---------------|-------|-----|
| `permission denied on table` | Warehouse user lacks WRITE on target | Grant INSERT, UPDATE, DELETE to the RudderStack user |
| `table or view not found` | Sync model references a dropped table | Recreate the table or update the model SQL |
| `invalid identifier` | Column name contains unsupported chars | Quote identifiers or rename the column |
| `quota exceeded` | Warehouse compute or storage limit reached | Increase warehouse tier; clean up old data |
| `network timeout` | Warehouse cluster paused or overloaded | Resume cluster; increase query timeout setting |

### Facebook Custom Audiences

- **400 "Invalid access token"** → re-authorize the Facebook connection; tokens expire periodically
- **400 "User not in audience"** on remove → user was never in the audience; this is safe to ignore
- **400 "hashed_data_included_without_hashing_type"** → a transformation is sending pre-hashed data without setting the hashing metadata

### Google Ads (Customer Match)

- **403 "The caller does not have permission"** → Google Ads account needs Manager Account linked; re-check account hierarchy
- **400 "audienceNotFound"** → the customer list ID in the destination config was deleted from Google Ads

## Filtered vs Suppressed — Telling Them Apart

Both result in events not reaching the destination, but the cause and fix differ:

| | Filtered (298) | Suppressed (299) |
|-|---------------|-----------------|
| **Cause** | Transformation returned falsy/empty | Tracking-plan governance blocked event |
| **Where to look** | Transformation code | Tracking plan violation log |
| **Fix** | Correct transformation logic | Add event to tracking plan or loosen governance |
| **Data loss?** | Yes — event is dropped | Yes — event is dropped |

Both are intentional outcomes, not errors. If they're unexpected, the fix is in the transformation or tracking plan.

## Retry Window and Dead Letters

RudderStack retries `retryable` and `throttled` events for a configurable window (default: 3 days). After the window expires, undelivered events go to dead-letter storage.

If you see a sudden drop in retried events accompanied by a rise in dead-letter count, the retry window likely expired during a destination outage. Contact support to replay from dead-letter storage if the destination is now healthy.
