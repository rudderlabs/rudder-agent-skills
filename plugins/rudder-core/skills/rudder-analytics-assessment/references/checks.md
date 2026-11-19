# Checks in the analytics assessment report

Each check is pass, warn, fail or info. Pass scores 1, warn 0.5, fail 0. Info does not count. The score is the average, out of 100: A from 90, B from 75, C from 60, D from 45, F below.

## How tools are found

`scripts/signatures.mjs` lists about 65 tools. Each tool has:

- `load`: patterns for the script that loads the tool.
- `collect`: patterns for the requests that send data. A match means the tool sent data.
- `globals`: `window` properties that only exist when the tool is on the page.
- `decode` (some tools): a decoder in `assess.mjs` that reads event names out of the request.

Event names are read for GA4, Segment, RudderStack, Amplitude, Mixpanel, the Meta Pixel and the TikTok Pixel. The scan also reads `window.dataLayer`.

Events sent in the Segment format (`anonymousId`, paths like `/v1/batch`) to the site's own domain are credited to RudderStack when `rudderanalytics` is on the page, else to Segment. `sendBeacon` bodies are often unreadable, so a beacon to such a path counts too.

To add a tool, add an entry to `signatures.mjs`. To find its requests, log the POST requests of a page that uses it and look for the vendor host.

## The checks

| Check | Fail or warn when | Notes |
|---|---|---|
| Analytics is collecting data | Fail: no web analytics, product analytics or CDP sent data | Tags waiting for consent also show up here |
| No retired Universal Analytics tags | Fail: `analytics.js`, `ga.js` or UA hits found | Google stopped processing UA data in July 2023 (July 2024 for 360 properties) |
| No duplicate tags | Warn: more than one GTM container, GA4 ID or Meta Pixel ID, or more `page_view` hits than pages times GA4 IDs | Two GA4 IDs can be intended (a rollup property) |
| One event pipeline feeds the tools | Fail: 6 or more tracking tools and no CDP. Warn: 3 or more and no CDP, or a CDP plus 6 or more tools with their own browser tags | An in-house pipeline does not show up by name |
| Consistent event names | Warn: the site's own events use more than one style (snake_case, camelCase, Title Case and others) | Ad pixel events are left out: their names are set by the vendor. Info when only automatic events fired |
| Marketing tags wait for consent | Warn: ad, session replay or marketing tags sent data before any consent choice | Fine in opt-out regions such as most of the US. GDPR needs a choice first. The scan does not set a location |
| Google Consent Mode v2 signals | Warn: Google tags sent hits without `gcd` | Only checked when Google tags fire |
| No personal data in tracking requests | Fail: an email address in a tracking URL or body | The scan never logs in, so any email comes from the page |
| Tracking requests succeed | Warn: a tracking request failed or returned 4xx or 5xx | DNS blocks, client blocks and dropped connections on the scanning machine are reported apart and do not count |
| Data survives ad blockers | Warn: every tool that sent data uses a vendor domain, or a first-party pipeline exists but 3 or more tools still use vendor domains | First party means the same site as the scanned URL |
| Tag weight | Warn: more than 300 KB of tracking scripts per page | Compressed transfer size |

## Limits

- No clicks or form submits, so conversion events usually do not fire.
- No server-side tracking, mobile apps or pages behind a login.
- One location. Consent banners and tags can behave differently for EU visitors.
- Tools that are not in `signatures.mjs` are not named.
