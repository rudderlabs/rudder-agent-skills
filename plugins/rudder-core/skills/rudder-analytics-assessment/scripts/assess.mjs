#!/usr/bin/env node
// Analytics assessment: load a site in headless Chrome like a first-time visitor,
// watch every network request, and write a Markdown report on its event tracking setup.
//
// Usage:
//   node assess.mjs <url> [--pages 3] [--out report.md] [--json raw.json] [--wait 4000]
//
// Needs Node 18+ and Google Chrome installed (uses playwright-core with channel "chrome"), or set CHROME_PATH.
// Run `npm install` next to this file first (playwright-core only).

let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { console.error('Missing dependency: run `npm install` in the folder that holds assess.mjs (installs playwright-core only, no browser download).'); process.exit(1); }
import { writeFileSync } from 'node:fs';
import { TOOLS, CATEGORY_LABEL, TRACKING_CATEGORIES } from './signatures.mjs';

// ---------- args ----------
const argv = process.argv.slice(2);
const opt = { pages: 3, wait: 4000, out: null, json: null };
const urls = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--pages') opt.pages = Math.max(1, parseInt(argv[++i], 10) || 1);
  else if (a === '--out') opt.out = argv[++i];
  else if (a === '--json') opt.json = argv[++i];
  else if (a === '--wait') opt.wait = parseInt(argv[++i], 10) || 4000;
  else if (a === '-h' || a === '--help') { console.log('node assess.mjs <url> [--pages 3] [--out report.md] [--json raw.json] [--wait 4000]'); process.exit(0); }
  else urls.push(a);
}
if (!urls.length) { console.error('Give a URL, e.g. node assess.mjs example.com'); process.exit(1); }
const startUrl = /^https?:\/\//.test(urls[0]) ? urls[0] : `https://${urls[0]}`;

// ---------- helpers ----------
function siteKey(host) {
  const parts = host.replace(/^www\./, '').split('.');
  if (parts.length <= 2) return parts.join('.');
  const last = parts[parts.length - 1], second = parts[parts.length - 2];
  if (last.length === 2 && second.length <= 3) return parts.slice(-3).join('.'); // co.uk, com.au
  return parts.slice(-2).join('.');
}
const SITE = siteKey(new URL(startUrl).hostname);
const isFirstParty = (host) => siteKey(host) === SITE;
const keyOf = (u) => { try { const x = new URL(u); return x.host + x.pathname + x.search; } catch { return u; } };
const EMAIL_RE = /[A-Z0-9._%+-]+(?:@|%40)[A-Z0-9.-]+\.[A-Z]{2,}/i;
const STANDARD_EVENTS = new Set([
  'page_view', 'user_engagement', 'scroll', 'session_start', 'first_visit', 'form_start', 'form_submit', 'click', 'file_download', 'video_start', 'video_progress', 'video_complete', 'view_search_results',
  'PageView', 'ViewContent', 'page', 'identify', 'screen', 'group', 'alias', 'Pageview', 'pageview', '[Amplitude] Page Viewed', 'mp_page_view', '$mp_web_page_view', '$pageview', '$pageleave', '$autocapture',
  'gtm.js', 'gtm.dom', 'gtm.load', 'gtm.click', 'gtm.linkClick', 'gtm.historyChange', 'gtm.scrollDepth', 'gtm.timer', 'gtm.init', 'gtm.init_consent', 'gtm.formSubmit', 'gtm.elementVisibility',
]);

function safeJSON(s) { try { return JSON.parse(s); } catch { return null; } }
function b64JSON(s) { try { return JSON.parse(Buffer.from(decodeURIComponent(s), 'base64').toString('utf8')); } catch { return null; } }

// Event decoders: return array of event names from a request
const DECODERS = {
  ga4(url, body) {
    const out = [];
    const u = new URL(url);
    if (u.searchParams.get('en')) out.push(u.searchParams.get('en'));
    if (body) for (const line of body.split('\n')) { const p = new URLSearchParams(line); if (p.get('en')) out.push(p.get('en')); }
    return out;
  },
  segmentLike(url, body) {
    const j = safeJSON(body || '');
    if (!j) return [];
    const items = Array.isArray(j.batch) ? j.batch : [j];
    return items.map((e) => e.type === 'track' ? e.event : e.type).filter(Boolean);
  },
  amplitude(url, body) {
    let j = safeJSON(body || '');
    if (!j && body) { const p = new URLSearchParams(body); j = safeJSON(p.get('e') || ''); if (Array.isArray(j)) j = { events: j }; }
    return (j?.events || []).map((e) => e.event_type).filter(Boolean);
  },
  mixpanel(url, body) {
    let data = null;
    if (body) { const p = new URLSearchParams(body); const d = p.get('data'); data = d ? (safeJSON(d) || b64JSON(d)) : safeJSON(body); }
    if (!data) { const d = new URL(url).searchParams.get('data'); if (d) data = b64JSON(d) || safeJSON(d); }
    const items = Array.isArray(data) ? data : data ? [data] : [];
    return items.map((e) => e.event).filter(Boolean);
  },
  meta(url) { const ev = new URL(url).searchParams.get('ev'); return ev ? [ev] : []; },
  tiktok(url, body) { const j = safeJSON(body || ''); return j?.event ? [j.event] : []; },
};

function extractIds(tool, url) {
  const u = new URL(url); const ids = [];
  const q = (k) => u.searchParams.get(k);
  if (tool.id === 'gtm' && q('id')) ids.push(q('id'));
  if (tool.id === 'ga4') { if (q('tid')) ids.push(q('tid')); if (q('id')?.startsWith('G-')) ids.push(q('id')); }
  if (tool.id === 'google_ads') { if (q('id')?.startsWith('AW-')) ids.push(q('id')); const m = u.pathname.match(/conversion\/(\d+)/); if (m) ids.push(`AW-${m[1]}`); }
  if (tool.id === 'meta' && q('id')) ids.push(q('id'));
  if (tool.id === 'linkedin' && q('pid')) ids.push(q('pid'));
  if (tool.id === 'tiktok' && q('sdkid')) ids.push(q('sdkid'));
  return ids;
}

function nameStyle(n) {
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(n)) return 'snake_case';
  if (/^[a-z]+([A-Z][a-z0-9]*)+$/.test(n)) return 'camelCase';
  if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(n)) return 'kebab-case';
  if (/^[A-Z][\w%]*( [A-Z0-9][\w%]*)+$/.test(n)) return 'Title Case';
  if (/^[A-Z][a-z0-9]+([A-Z][a-z0-9]*)+$/.test(n)) return 'PascalCase';
  if (/^[a-z0-9]+( [a-z0-9]+)+$/.test(n)) return 'lower case';
  if (/^[A-Z][a-z0-9]*( [a-z0-9]+)+$/.test(n)) return 'Sentence case';
  if (/^[a-z0-9]+$/.test(n)) return 'single word';
  return 'other';
}

// ---------- scan ----------
const state = {
  tools: new Map(), // id -> detection
  requests: [],
  pages: [],
  piiHits: [],
  failed: [],
  envBlocked: new Set(),
  firstPartyCollectors: [],
  consentSignals: { gcs: new Set(), gcd: false, tcf: false },
};

function det(tool) {
  if (!state.tools.has(tool.id)) state.tools.set(tool.id, { tool, loaded: false, fired: false, hits: 0, events: new Map(), ids: new Set(), hosts: new Set(), firstParty: false, scriptBytes: 0, pages: new Set(), firedPages: new Set(), viaGlobal: false });
  return state.tools.get(tool.id);
}

function classify(req, pageIdx) {
  const url = req.url();
  if (!/^https?:/.test(url)) return;
  const k = keyOf(url);
  let host; try { host = new URL(url).host; } catch { return; }
  let body = null; try { body = req.postData(); } catch {}
  const rec = { url, host, method: req.method(), type: req.resourceType(), page: pageIdx, tools: [] };
  for (const tool of TOOLS) {
    const isLoad = tool.load.some((r) => r.test(k));
    const isCollect = tool.collect.some((r) => r.test(k));
    if (!isLoad && !isCollect) continue;
    const d = det(tool);
    d.hosts.add(host); d.pages.add(pageIdx);
    for (const id of extractIds(tool, url)) d.ids.add(id);
    if (isLoad) d.loaded = true;
    if (isCollect) {
      d.fired = true; d.hits++; d.firedPages.add(pageIdx);
      if (isFirstParty(host)) d.firstParty = true;
      const names = tool.decode ? DECODERS[tool.decode](url, body) : [];
      for (const n of names) {
        const e = d.events.get(n) || { count: 0, pages: new Set() };
        e.count++; e.pages.add(pageIdx); d.events.set(n, e);
      }
      if (tool.id === 'ga4') {
        const u = new URL(url);
        const lines = [u.searchParams, ...(body ? body.split('\n').map((l) => new URLSearchParams(l)) : [])];
        for (const p of lines) { if (p.get('gcs')) state.consentSignals.gcs.add(p.get('gcs')); if (p.get('gcd')) state.consentSignals.gcd = true; }
        if (u.searchParams.get('gcs')) state.consentSignals.gcs.add(u.searchParams.get('gcs'));
        if (u.searchParams.get('gcd')) state.consentSignals.gcd = true;
      }
    }
    rec.tools.push(tool.id);
  }
  // Segment-spec events sent to a first-party or unknown endpoint (proxied CDP)
  // (sendBeacon bodies are often unreadable, so a beacon to a /v1/batch-style path counts too)
  const specPath = /\/v1\/(t|p|i|track|page|identify|batch)\/?(\?|$)/.test(k);
  if (!rec.tools.length && specPath && ((body && /anonymousId/.test(body)) || (!body && rec.method === 'POST' && ['ping', 'beacon', 'other'].includes(rec.type)))) {
    state.firstPartyCollectors.push({ host, path: new URL(url).pathname, page: pageIdx, events: body ? DECODERS.segmentLike(url, body) : [] });
    rec.tools.push('segment_spec_custom');
  }
  if (rec.tools.length) {
    const hay = url + ' ' + (body || '');
    const m = hay.match(EMAIL_RE);
    if (m && !/@(2x|3x)\b/.test(m[0]) && !/\.(png|jpg|svg|webp|gif)$/i.test(m[0])) state.piiHits.push({ tool: rec.tools[0], host, sample: m[0].replace(/^(.).*(@|%40)/, '$1***$2'), page: pageIdx });
  }
  state.requests.push(rec);
}

async function scanPage(context, url, pageIdx) {
  const page = await context.newPage();
  const scriptSizes = [];
  page.on('request', (r) => classify(r, pageIdx));
  page.on('requestfailed', (r) => {
    const k = keyOf(r.url());
    const t = TOOLS.find((tool) => tool.collect.some((re) => re.test(k)) || tool.load.some((re) => re.test(k)));
    const err = r.failure()?.errorText || '';
    if (!t || /ERR_ABORTED/.test(err)) return; // beacons cut off by navigation; not a setup problem
    // DNS or client blocking means the scanning machine's network blocked it, not the site
    if (/ERR_NAME_NOT_RESOLVED|ERR_BLOCKED_BY_CLIENT|ERR_BLOCKED_BY_ORB|ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_TIMED_OUT|ERR_INTERNET_DISCONNECTED|ERR_NETWORK_ACCESS_DENIED/.test(err)) state.envBlocked.add(t.name);
    else state.failed.push({ tool: t.name, url: r.url().slice(0, 140), error: err, page: pageIdx });
  });
  page.on('requestfinished', async (req) => {
    if (req.resourceType() !== 'script') return;
    const k = keyOf(req.url());
    const t = TOOLS.find((tool) => tool.load.some((re) => re.test(k)));
    if (!t) return;
    try { const s = await req.sizes(); scriptSizes.push({ id: t.id, size: s.responseBodySize }); } catch {}
  });
  page.on('response', async (res) => {
    const k = keyOf(res.url());
    const c = TOOLS.find((tool) => tool.collect.some((re) => re.test(k)));
    if (c && res.status() >= 400) state.failed.push({ tool: c.name, url: res.url().slice(0, 140), error: `HTTP ${res.status()}`, page: pageIdx });
  });

  const info = { url, idx: pageIdx, ok: true, error: null, title: '', links: [], globals: [], dataLayer: null, gtmContainers: [] };
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  } catch (e) {
    info.ok = false; info.error = e.message.split('\n')[0];
  }
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
  // Behave like a reader: scroll down the page, then wait for delayed tags
  try {
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); }
      window.scrollTo(0, 0);
    });
  } catch {}
  await page.waitForTimeout(opt.wait);

  try {
    const globalsToCheck = [...new Set(TOOLS.flatMap((t) => t.globals))];
    const res = await page.evaluate((globalsToCheck) => {
      const present = globalsToCheck.filter((g) => { try { return typeof window[g] !== 'undefined' && window[g] !== null; } catch { return false; } });
      let dl = null;
      if (Array.isArray(window.dataLayer)) {
        const events = []; const keys = new Set(); let ecommerce = false; const consent = [];
        for (const item of window.dataLayer) {
          if (!item || typeof item !== 'object') continue;
          if (typeof item.length === 'number' && item[0] !== undefined) { // gtag() arguments object
            if (item[0] === 'event' && typeof item[1] === 'string') events.push(item[1]);
            if (item[0] === 'consent') consent.push(`${item[1]}: ${Object.entries(item[2] || {}).map(([k, v]) => `${k}=${v}`).join(', ')}`);
            continue;
          }
          if (typeof item.event === 'string') events.push(item.event);
          if (item.ecommerce) ecommerce = true;
          for (const k of Object.keys(item)) if (!k.startsWith('gtm.')) keys.add(k);
        }
        dl = { length: window.dataLayer.length, events, keys: [...keys].slice(0, 40), ecommerce, consent };
      }
      const gtm = window.google_tag_manager ? Object.keys(window.google_tag_manager).filter((k) => /^(GTM|G|AW|DC)-/.test(k)) : [];
      const links = [...document.querySelectorAll('a[href]')].map((a) => ({ href: a.href, text: (a.textContent || '').trim().slice(0, 40) }));
      const tcf = typeof window.__tcfapi === 'function';
      return { present, dl, gtm, links, title: document.title, tcf };
    }, globalsToCheck);
    info.globals = res.present; info.dataLayer = res.dl; info.gtmContainers = res.gtm; info.links = res.links; info.title = res.title;
    if (res.tcf) state.consentSignals.tcf = true;
    for (const g of res.present) for (const t of TOOLS) if (t.globals.includes(g)) { const d = det(t); d.viaGlobal = true; d.pages.add(pageIdx); }
    for (const c of res.gtm) { if (c.startsWith('GTM-')) det(TOOLS.find((t) => t.id === 'gtm')).ids.add(c); }
  } catch (e) { if (info.ok) { info.ok = false; info.error = e.message.split('\n')[0]; } }

  for (const s of scriptSizes) det(TOOLS.find((t) => t.id === s.id)).scriptBytes += s.size;
  await page.close();
  return info;
}

function pickLinks(links, n) {
  const PRIORITY = [/pricing/, /sign-?up|register|get-started|start|trial/, /demo|contact|sales/, /product|features|platform|solutions/, /cart|checkout|shop|collections|products\//, /blog/];
  const seen = new Set([new URL(startUrl).pathname.replace(/\/$/, '')]);
  const cands = [];
  for (const l of links) {
    let u; try { u = new URL(l.href); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || siteKey(u.hostname) !== SITE) continue;
    if (/\.(pdf|png|jpg|zip|svg)$/i.test(u.pathname)) continue;
    const p = u.pathname.replace(/\/$/, '');
    if (seen.has(p)) continue; seen.add(p);
    const s = (p + ' ' + l.text).toLowerCase();
    const rank = PRIORITY.findIndex((r) => r.test(s));
    cands.push({ url: u.origin + u.pathname, rank: rank === -1 ? 99 : rank });
  }
  cands.sort((a, b) => a.rank - b.rank);
  const out = []; const usedRanks = new Set();
  for (const c of cands) { if (out.length >= n) break; if (c.rank !== 99 && usedRanks.has(c.rank)) continue; usedRanks.add(c.rank); out.push(c.url); }
  for (const c of cands) { if (out.length >= n) break; if (!out.includes(c.url)) out.push(c.url); }
  return out;
}

async function run() {
  const launchOpts = { headless: true };
  if (process.env.CHROME_PATH) launchOpts.executablePath = process.env.CHROME_PATH; else launchOpts.channel = 'chrome';
  const browser = await chromium.launch(launchOpts);
  const ua = (await browser.newPage().then(async (p) => { const u = await p.evaluate(() => navigator.userAgent); await p.close(); return u; })).replace('HeadlessChrome', 'Chrome');
  const context = await browser.newContext({ userAgent: ua, viewport: { width: 1366, height: 900 }, locale: 'en-US' });

  const targets = [startUrl, ...urls.slice(1).map((u) => (/^https?:\/\//.test(u) ? u : `https://${u}`))];
  const first = await scanPage(context, targets[0], 0);
  state.pages.push(first);
  if (targets.length < opt.pages) targets.push(...pickLinks(first.links, opt.pages - targets.length));
  for (let i = 1; i < targets.length && i < Math.max(opt.pages, urls.length); i++) state.pages.push(await scanPage(context, targets[i], i));
  await browser.close();
}

// ---------- analysis ----------
function analyze() {
  // Credit first-party Segment-spec traffic to the SDK on the page (RudderStack, else Segment)
  if (state.firstPartyCollectors.length) {
    const rs = state.tools.get('rudderstack'), sg = state.tools.get('segment');
    const owner = (rs && (rs.viaGlobal || rs.loaded)) ? rs : (sg && (sg.viaGlobal || sg.loaded)) ? sg : null;
    if (owner) {
      for (const c of state.firstPartyCollectors) {
        owner.fired = true; owner.firstParty = true; owner.hits++; owner.hosts.add(c.host + c.path); owner.firedPages.add(c.page);
        for (const n of c.events) { const e = owner.events.get(n) || { count: 0, pages: new Set() }; e.count++; e.pages.add(c.page); owner.events.set(n, e); }
      }
      state.attributedCollectors = state.firstPartyCollectors; state.firstPartyCollectors = [];
    }
  }
  const tools = [...state.tools.values()].filter((d) => d.loaded || d.fired || d.viaGlobal);
  const by = (cat) => tools.filter((d) => d.tool.category === cat);
  const trackers = tools.filter((d) => TRACKING_CATEGORIES.has(d.tool.category));
  const firing = trackers.filter((d) => d.fired);
  const has = (id) => tools.some((d) => d.tool.id === id);
  const checks = [];
  const add = (id, title, status, detail, fix) => checks.push({ id, title, status, detail, fix });

  // 1. Analytics present
  const measuring = tools.filter((d) => ['analytics', 'product', 'cdp'].includes(d.tool.category) && d.tool.id !== 'ua' && (d.fired || d.loaded));
  if (measuring.length || state.firstPartyCollectors.length) add('analytics', 'Analytics is collecting data', 'pass', `${[...measuring.map((d) => d.tool.name), ...(state.firstPartyCollectors.length ? ['Segment-spec events to a first-party endpoint'] : [])].join(', ')}.`);
  else add('analytics', 'Analytics is collecting data', 'fail', 'No web or product analytics tool sent data during the visit.', 'Add an analytics SDK, or check that tags are not waiting on a consent choice that the scan never made.');

  // 2. Retired UA
  if (has('ua')) add('ua', 'No retired Universal Analytics tags', 'fail', 'Universal Analytics code is still on the page. Google stopped processing UA data in July 2023 (July 2024 for 360 properties), so this tag adds weight and collects nothing.', 'Remove analytics.js / ga.js and any UA tags in GTM.');
  else add('ua', 'No retired Universal Analytics tags', 'pass', 'None found.');

  // 3. Duplicate tags
  const dupNotes = [];
  const ga4 = state.tools.get('ga4');
  if (ga4) {
    const pv = ga4.events.get('page_view');
    if (pv && pv.count > state.pages.filter((p) => p.ok).length * Math.max(1, ga4.ids.size)) dupNotes.push(`GA4 sent ${pv.count} page_view hits across ${state.pages.length} page loads and ${ga4.ids.size} measurement ID(s); expect one per page per ID.`);
  }
  const gtmIds = [...(state.tools.get('gtm')?.ids || [])].filter((i) => i.startsWith('GTM-'));
  if (gtmIds.length > 1) dupNotes.push(`${gtmIds.length} GTM containers (${gtmIds.join(', ')}). Two containers often fire the same tags twice.`);
  const metaIds = [...(state.tools.get('meta')?.ids || [])];
  if (metaIds.length > 1) dupNotes.push(`${metaIds.length} Meta Pixel IDs (${metaIds.join(', ')}).`);
  const ga4Ids = [...(ga4?.ids || [])].filter((i) => i.startsWith('G-'));
  if (ga4Ids.length > 1) dupNotes.push(`${ga4Ids.length} GA4 measurement IDs (${ga4Ids.join(', ')}). Fine if intended (e.g. a rollup property); otherwise double counting.`);
  if (dupNotes.length) add('dupes', 'No duplicate tags', 'warn', dupNotes.join(' '), 'Confirm each ID is intended. Remove hard-coded tags that GTM also fires.');
  else add('dupes', 'No duplicate tags', 'pass', 'No duplicate containers, pixels or page_view hits seen.');

  // 4. Tool sprawl / single pipeline
  const cdp = by('cdp');
  const vendorCount = trackers.length;
  if (vendorCount >= 6 && !cdp.length) add('pipeline', 'One event pipeline feeds the tools', 'fail', `${vendorCount} tracking tools, each tagged separately in the browser, and no CDP or event pipeline detected (an in-house one would not show up by name). Every tool gets its own copy of the data, with its own event names and its own gaps.`, 'Track each event once through one SDK and route it to tools server-side.');
  else if (vendorCount >= 3 && !cdp.length) add('pipeline', 'One event pipeline feeds the tools', 'warn', `${vendorCount} tracking tools tagged separately, no CDP or event pipeline detected.`, 'Track each event once and fan it out to tools from one pipeline.');
  else if (cdp.length) add('pipeline', 'One event pipeline feeds the tools', vendorCount - cdp.length >= 6 ? 'warn' : 'pass', `${cdp.map((d) => d.tool.name).join(', ')} present${vendorCount - cdp.length >= 6 ? `, but ${vendorCount - cdp.length} other tools still load their own browser tags` : ''}.`, vendorCount - cdp.length >= 6 ? 'Move browser pixels to server-side destinations of the pipeline you already have.' : undefined);
  else add('pipeline', 'One event pipeline feeds the tools', 'pass', `${vendorCount} tracking tool(s); small setup.`);

  // 5. Event naming
  const custom = new Map();
  // Ad pixels use vendor-defined names (TikTok's EnrichAM, Meta's ViewContent), so only judge the site's own events
  for (const d of trackers.filter((x) => ['analytics', 'product', 'cdp'].includes(x.tool.category))) for (const [n] of d.events) if (!STANDARD_EVENTS.has(n) && !n.startsWith('gtm.')) custom.set(n, d.tool.name);
  const VENDOR_DL = /^(ketch|onetrust|optanon|cookiebot|cookie_consent|uc_|usercentrics|hs[A-Z_]|hubspot|vwo|optimizely|osano|didomi|iubenda|consent|trustarc|truste|cheq)/i;
  for (const p of state.pages) for (const n of p.dataLayer?.events || []) if (!STANDARD_EVENTS.has(n) && !n.startsWith('gtm.') && !VENDOR_DL.test(n)) custom.set(n, 'dataLayer');
  for (const c of state.firstPartyCollectors) for (const n of c.events) if (!STANDARD_EVENTS.has(n)) custom.set(n, 'first-party endpoint');
  const styles = new Map();
  for (const n of custom.keys()) { const s = nameStyle(n); if (s === 'single word') continue; if (!styles.has(s)) styles.set(s, []); styles.get(s).push(n); }
  if (custom.size === 0) add('naming', 'Consistent event names', 'info', 'Only automatic events (page views, GTM lifecycle) fired during the visit, so there is nothing to compare. Custom events usually fire on clicks, sign-ups and checkouts, which a page scan does not perform.');
  else if (styles.size > 1) add('naming', 'Consistent event names', 'warn', `${styles.size} naming styles in ${custom.size} custom events: ${[...styles].map(([s, ns]) => `${s} (${ns.slice(0, 3).map((n) => `\`${n}\``).join(', ')})`).join('; ')}. Mixed names split the same action into several events in reports.`, 'Pick one convention and enforce it with a tracking plan.');
  else add('naming', 'Consistent event names', 'pass', `${custom.size} custom events, one style${styles.size ? ` (${[...styles.keys()][0]})` : ''}.`);

  // 6. Consent
  const cmp = by('consent');
  const firedOnLoad = firing.filter((d) => ['ads', 'session_replay', 'marketing'].includes(d.tool.category));
  if (cmp.length && firedOnLoad.length) add('consent', 'Marketing tags wait for consent', 'warn', `${cmp.map((d) => d.tool.name).join(', ')} is on the page, but ${firedOnLoad.map((d) => d.tool.name).join(', ')} sent data before any consent choice. Fine for opt-out regions (most of the US); under GDPR (EU/UK visitors) these need a choice first. The scan ran without a location override, so the banner may behave differently in the EU.`, 'Check the CMP blocks these tags for EU/UK visitors, ideally in GTM consent settings.');
  else if (!cmp.length && firedOnLoad.length) add('consent', 'Marketing tags wait for consent', 'warn', `No consent manager found, and ${firedOnLoad.map((d) => d.tool.name).join(', ')} sent data on page load.`, 'If you have EU/UK visitors, add a consent manager and gate ad and replay tags behind it.');
  else if (cmp.length) add('consent', 'Marketing tags wait for consent', 'pass', `${cmp.map((d) => d.tool.name).join(', ')} present; no ad, replay or marketing tag fired before a choice.`);
  else add('consent', 'Marketing tags wait for consent', 'info', 'No consent manager and no ad or replay tags firing.');

  // 7. Google Consent Mode
  const googleTags = tools.some((d) => ['ga4', 'google_ads', 'dv360'].includes(d.tool.id) && d.fired);
  if (googleTags) {
    if (state.consentSignals.gcd) add('gcm', 'Google Consent Mode v2 signals', 'pass', `Consent Mode signals present on Google hits${state.consentSignals.gcs.size ? ` (gcs=${[...state.consentSignals.gcs].join(', ')})` : ''}.`);
    else add('gcm', 'Google Consent Mode v2 signals', 'warn', 'Google tags fire without Consent Mode v2 signals. Google requires them for ads measurement and remarketing of EEA users.', 'Set consent defaults in GTM or gtag before tags load, and wire the CMP updates.');
  }

  // 8. PII
  if (state.piiHits.length) add('pii', 'No personal data in tracking requests', 'fail', `Email-like values sent to ${[...new Set(state.piiHits.map((p) => p.host))].join(', ')} (e.g. ${state.piiHits[0].sample}). The scan never logged in or filled a form, so these come from the page itself.`, 'Strip emails from URLs and event properties; hash them only where a destination needs it.');
  else add('pii', 'No personal data in tracking requests', 'pass', 'No email addresses found in tracking requests.');

  // 9. Failed requests
  const envNote = state.envBlocked.size ? ` The scanning machine's network blocked or dropped requests to ${[...state.envBlocked].join(', ')}, so their results may be incomplete; that is not a site problem.` : '';
  if (state.failed.length) add('failed', 'Tracking requests succeed', 'warn', `${state.failed.length} tracking request(s) failed: ${[...new Set(state.failed.map((f) => `${f.tool} (${f.error})`))].slice(0, 5).join(', ')}.${envNote}`, 'Check the tag configuration, IDs and endpoints for these tools.');
  else add('failed', 'Tracking requests succeed', 'pass', `No failed tracking requests.${envNote}`);

  // 10. Ad blocker exposure
  const thirdPartyFiring = firing.filter((d) => !d.firstParty);
  const fp = firing.filter((d) => d.firstParty).length + (state.firstPartyCollectors.length ? 1 : 0);
  if (fp && thirdPartyFiring.length >= 3) add('blockers', 'Data survives ad blockers', 'warn', `${fp} tool(s) send data through a first-party domain, but ${thirdPartyFiring.length} still use vendor domains that ad blockers and privacy browsers block by default.`, 'Route the remaining tools through your first-party pipeline as server-side destinations.');
  else if (firing.length && !fp) add('blockers', 'Data survives ad blockers', 'warn', `All ${thirdPartyFiring.length} tools that sent data use vendor domains. Ad blockers and privacy browsers block most of these by default, so a share of visits never reaches them.`, 'Send events to a first-party domain (your own subdomain) and forward them server-side.');
  else if (fp) add('blockers', 'Data survives ad blockers', 'pass', `${fp} tool(s) send data through a first-party domain${thirdPartyFiring.length ? `; ${thirdPartyFiring.length} still use vendor domains` : ''}.`);

  // 11. Tag weight
  const kb = Math.round(tools.reduce((s, d) => s + d.scriptBytes, 0) / 1024);
  const perPage = Math.round(kb / Math.max(1, state.pages.filter((p) => p.ok).length));
  if (perPage > 300) add('weight', 'Tag weight', 'warn', `About ${perPage} KB of tracking scripts downloaded per page (compressed transfer size).`, 'Each browser tag you move server-side removes its script from the page.');
  else add('weight', 'Tag weight', 'pass', `About ${perPage} KB of tracking scripts per page (compressed).`);

  const pts = { pass: 1, warn: 0.5, fail: 0 };
  const scored = checks.filter((c) => c.status !== 'info');
  const score = scored.length ? Math.round((100 * scored.reduce((s, c) => s + pts[c.status], 0)) / scored.length) : 0;
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 45 ? 'D' : 'F';
  return { tools, checks, score, grade, custom, kb };
}

// ---------- report ----------
function recommendations(a) {
  const ids = new Set(a.tools.map((d) => d.tool.id));
  const st = Object.fromEntries(a.checks.map((c) => [c.id, c.status]));
  const recs = [];
  if (ids.has('rudderstack')) {
    recs.push('**You already run RudderStack.** Connect the RudderStack MCP server to your AI assistant and ask about the parts a page scan cannot see: live event schemas, tracking plan violations and destination errors for this source.');
  } else if (ids.has('segment')) {
    recs.push('**Segment is your pipeline.** RudderStack\'s SDKs follow the same event spec (`track`, `page`, `identify`), so existing calls keep working when you swap the snippet and write key. See [Migrating to RudderStack from Segment](https://www.rudderstack.com/knowledge-base/migrate-segment-rs/).');
  }
  if (st.pipeline === 'fail' || st.pipeline === 'warn') recs.push('**Track once, send everywhere.** Instrument events one time with the RudderStack SDK and turn the browser pixels into server-side destinations. Fewer tags on the page, one set of event names in every tool.');
  if (st.naming === 'warn') recs.push('**Make event names a contract.** Define the events in a tracking plan as YAML in your repo with `rudder-cli`, review changes in PRs, and have RudderStack flag events that break the plan.');
  if (st.blockers === 'warn') recs.push('**Collect on your own domain.** Point the SDK at a data plane on your own subdomain so blockers that target vendor domains do not drop the events.');
  if (st.consent === 'warn' || st.gcm === 'warn') recs.push('**Consent in one place.** RudderStack\'s JavaScript SDK reads OneTrust, Ketch, iubenda and custom CMPs and only forwards events to the destinations a visitor allowed ([consent management](https://www.rudderstack.com/docs/data-governance/consent-management/overview/)).');
  return recs;
}

function render(a) {
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const icon = { pass: 'PASS', warn: 'WARN', fail: 'FAIL', info: 'INFO' };
  const L = [];
  L.push(`# Analytics assessment: ${SITE}`, '');
  L.push(`Scanned ${state.pages.length} page(s) on ${now} as a first-time visitor in headless Chrome (no clicks, no consent choice, no login).`, '');
  L.push('## Summary', '');
  L.push(`**Score: ${a.score}/100 (${a.grade})**. ${a.checks.filter((c) => c.status === 'fail').length} fail, ${a.checks.filter((c) => c.status === 'warn').length} warn, ${a.checks.filter((c) => c.status === 'pass').length} pass.`, '');
  const cats = {};
  for (const d of a.tools) (cats[d.tool.category] ||= []).push(d.tool.name);
  for (const [c, names] of Object.entries(cats)) L.push(`- **${CATEGORY_LABEL[c]}:** ${names.join(', ')}`);
  if (state.firstPartyCollectors.length) L.push(`- **First-party event endpoint:** Segment-spec events to ${[...new Set(state.firstPartyCollectors.map((c) => c.host + c.path))].join(', ')}`);
  if (!a.tools.length) L.push('- No known analytics, tag manager, pixel or consent tool detected.');
  L.push('');

  L.push('## Checks', '', '| | Check | Finding | Fix |', '| --- | --- | --- | --- |');
  const order = { fail: 0, warn: 1, info: 2, pass: 3 };
  for (const c of [...a.checks].sort((x, y) => order[x.status] - order[y.status])) L.push(`| ${icon[c.status]} | ${c.title} | ${c.detail.replace(/\|/g, '\\|')} | ${c.fix || ''} |`);
  L.push('');

  L.push('## Tools detected', '', '| Tool | Category | Sent data | IDs | Data goes to | Events seen |', '| --- | --- | --- | --- | --- | --- |');
  for (const d of [...a.tools].sort((x, y) => x.tool.category.localeCompare(y.tool.category))) {
    const evs = [...d.events].sort((x, y) => y[1].count - x[1].count).slice(0, 8).map(([n, e]) => `\`${n}\`${e.count > 1 ? ` x${e.count}` : ''}`).join(', ');
    const sent = d.fired ? `yes (${d.hits})` : d.tool.collect.length ? 'no' : 'n/a';
    L.push(`| ${d.tool.name} | ${CATEGORY_LABEL[d.tool.category]} | ${sent} | ${[...d.ids].join(', ')} | ${[...d.hosts].slice(0, 2).join(', ')}${d.firstParty ? ' (first-party)' : ''} | ${evs} |`);
  }
  L.push('');

  L.push('## Pages scanned', '');
  for (const p of state.pages) {
    const tools = a.tools.filter((d) => d.firedPages.has(p.idx)).map((d) => d.tool.name);
    L.push(`- ${p.url}${p.ok ? '' : ` (error: ${p.error})`}: ${tools.length} tool(s) sent data${tools.length ? ` (${tools.join(', ')})` : ''}`);
  }
  L.push('');

  const dl = state.pages.map((p) => p.dataLayer).filter(Boolean);
  if (dl.length) {
    const evs = [...new Set(dl.flatMap((d) => d.events))].filter((e) => !e.startsWith('gtm.'));
    const keys = [...new Set(dl.flatMap((d) => d.keys))];
    const consent = [...new Set(dl.flatMap((d) => d.consent))];
    L.push('## Data layer', '');
    L.push(`- \`window.dataLayer\` present on ${dl.length} of ${state.pages.length} page(s).`);
    L.push(`- Events pushed: ${evs.length ? evs.slice(0, 15).map((e) => `\`${e}\``).join(', ') : 'none besides GTM lifecycle events'}`);
    if (keys.length) L.push(`- Keys used: ${keys.slice(0, 20).map((k) => `\`${k}\``).join(', ')}`);
    L.push(`- Ecommerce object: ${dl.some((d) => d.ecommerce) ? 'yes' : 'no'}`);
    if (consent.length) L.push(`- Consent commands: ${consent.slice(0, 4).map((c) => `\`${c}\``).join('; ')}`);
    L.push('');
  }

  const recs = recommendations(a);
  L.push('## Next steps with RudderStack', '');
  if (recs.length) { for (const r of recs) L.push(`- ${r}`); L.push(''); }
  L.push('**Go deeper: ask your AI assistant about the live data.** This scan only sees what a browser sees on a few pages. The [RudderStack MCP server](https://www.rudderstack.com/docs/ai-features/rudderstack-mcp/) lets Claude, ChatGPT, Cursor and other MCP clients read your workspace: sources, event schemas, tracking plan violations, destination errors. Nothing to install:', '');
  L.push('```bash', 'claude mcp add --transport http --scope user rudderstack https://mcp.rudderstack.com/mcp', '```', '');
  L.push('Then ask: "Which events on my web source broke the tracking plan this week?" or "Which destinations are failing and why?"', '');
  L.push('**Fix it: put tracking in code.** [`rudder-cli`](https://github.com/rudderlabs/rudder-iac/releases) manages tracking plans, events and properties as YAML in git. Add the agent skills so your coding agent can plan and instrument events with it:', '');
  L.push('```bash', 'npx skills add rudderlabs/rudder-agent-skills', '```', '');

  L.push('## What this scan cannot see', '');
  L.push('- Events that fire on clicks, form submits, sign-ups or checkout. The scan loads and scrolls pages; it does not interact.');
  L.push('- Server-side tracking, mobile apps and logged-in product areas.');
  L.push('- Geo-specific behavior: consent banners and tags can differ for EU visitors.');
  L.push('- Tools not in the signature list (about 60 common analytics, CDP, pixel, replay and consent tools).');
  L.push('');
  L.push('Re-run with more pages: `node assess.mjs <url> --pages 6`, or pass specific URLs after the first one.');
  return L.join('\n');
}

function rawJSON(a) {
  return {
    site: SITE, scannedAt: new Date().toISOString(), score: a.score, grade: a.grade,
    pages: state.pages.map((p) => ({ url: p.url, ok: p.ok, error: p.error, title: p.title, globals: p.globals, dataLayer: p.dataLayer, gtmContainers: p.gtmContainers })),
    tools: a.tools.map((d) => ({ id: d.tool.id, name: d.tool.name, category: d.tool.category, loaded: d.loaded, fired: d.fired, hits: d.hits, ids: [...d.ids], hosts: [...d.hosts], firstParty: d.firstParty, scriptKB: Math.round(d.scriptBytes / 1024), events: Object.fromEntries([...d.events].map(([n, e]) => [n, e.count])) })),
    firstPartyCollectors: state.firstPartyCollectors, checks: a.checks, failed: state.failed, piiHits: state.piiHits,
  };
}

run().then(() => {
  const a = analyze();
  const md = render(a);
  if (opt.out) writeFileSync(opt.out, md); else process.stdout.write(md + '\n');
  if (opt.json) writeFileSync(opt.json, JSON.stringify(rawJSON(a), null, 2));
  if (opt.out) console.error(`Report: ${opt.out} (score ${a.score}/100, ${a.tools.length} tools)`);
}).catch((e) => { console.error('Scan failed:', e.message); process.exit(1); });
