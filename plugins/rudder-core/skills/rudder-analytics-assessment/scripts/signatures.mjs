// Tool signatures: how to spot each analytics, CDP, tag manager, pixel and consent tool
// from network requests (host + path) and window globals.
//
// category: cdp | analytics | product | tag_manager | ads | session_replay | consent | marketing
// load:     regexes matched against "host/path" of script/resource requests (the tag loaded)
// collect:  regexes matched against "host/path" of requests that send data (the tag fired)
// globals:  window properties that only exist when the tool is on the page
// decode:   name of an event decoder in assess.mjs (pulls event names out of payloads)

export const TOOLS = [
  // CDPs and event pipelines
  { id: 'rudderstack', name: 'RudderStack', category: 'cdp',
    load: [/cdn\.rudderlabs\.com\//, /cdn\.rudderstack\.com\//],
    collect: [/\.dataplane\.rudderstack\.com\/v1\//, /\.rudderstack\.com\/v1\/(track|page|identify|batch|screen|group|alias)/],
    globals: ['rudderanalytics'], decode: 'segmentLike' },
  { id: 'segment', name: 'Segment', category: 'cdp',
    load: [/cdn\.segment\.(com|io)\/analytics\.js/, /cdn\.segment\.(com|io)\/v1\/projects\//],
    collect: [/api\.segment\.io\/v1\//, /events\.eu1\.segmentapis\.com\/v1\//],
    globals: [], decode: 'segmentLike' },
  { id: 'mparticle', name: 'mParticle', category: 'cdp',
    load: [/jssdkcdns\.mparticle\.com\//], collect: [/jssdks\.mparticle\.com\//], globals: ['mParticle'] },
  { id: 'snowplow', name: 'Snowplow', category: 'cdp',
    load: [/\/sp\.js$/, /snowplow.*\.js/], collect: [/\/com\.snowplowanalytics\.snowplow\/tp2/, /\/i\?.*e=(pv|se|ue)/],
    globals: ['snowplow', 'GlobalSnowplowNamespace'] },
  { id: 'freshpaint', name: 'Freshpaint', category: 'cdp', load: [/perfalytics\.com\//], collect: [/api\.perfalytics\.com\//], globals: [] },
  { id: 'hightouch_events', name: 'Hightouch Events', category: 'cdp', load: [/cdn\.hightouch-events\.com\//], collect: [/\.hightouch-events\.com\/v1\//], globals: ['htevents'] },

  // Tag managers
  { id: 'gtm', name: 'Google Tag Manager', category: 'tag_manager',
    load: [/googletagmanager\.com\/gtm\.js/, /\/gtm\.js\?id=GTM-/], collect: [], globals: ['google_tag_manager'] },
  { id: 'tealium', name: 'Tealium iQ', category: 'tag_manager', load: [/tags\.tiqcdn\.com\//], collect: [/collect\.tealiumiq\.com\//], globals: ['utag'] },
  { id: 'adobe_launch', name: 'Adobe Experience Platform Tags (Launch)', category: 'tag_manager', load: [/assets\.adobedtm\.com\//], collect: [], globals: ['_satellite'] },
  { id: 'ensighten', name: 'Ensighten', category: 'tag_manager', load: [/nexus\.ensighten\.com\//], collect: [], globals: ['Bootstrapper'] },

  // Web and product analytics
  { id: 'ga4', name: 'Google Analytics 4', category: 'analytics',
    load: [/googletagmanager\.com\/gtag\/js\?id=G-/], collect: [/\/g\/collect\?/], globals: ['gtag'], decode: 'ga4' },
  { id: 'ua', name: 'Universal Analytics (retired)', category: 'analytics',
    load: [/google-analytics\.com\/analytics\.js/, /google-analytics\.com\/ga\.js/], collect: [/google-analytics\.com\/(r\/)?collect\?.*v=1/, /google-analytics\.com\/j\/collect/], globals: ['ga'] },
  { id: 'adobe_analytics', name: 'Adobe Analytics', category: 'analytics', load: [/\/AppMeasurement.*\.js/], collect: [/\.(omtrdc|2o7)\.net\/b\/ss\//, /\/b\/ss\/[^/]+\/\d+\//], globals: ['s_c_il'] },
  { id: 'amplitude', name: 'Amplitude', category: 'product',
    load: [/cdn\.amplitude\.com\//], collect: [/api2?\.amplitude\.com\//, /api\.eu\.amplitude\.com\//, /api2\.amplitude\.com\/2\/httpapi/], globals: ['amplitude'], decode: 'amplitude' },
  { id: 'mixpanel', name: 'Mixpanel', category: 'product',
    load: [/cdn\.mxpnl\.com\//, /cdn4\.mxpnl\.com\//], collect: [/api(-js)?(-eu)?\.mixpanel\.com\/(track|engage|record)/], globals: ['mixpanel'], decode: 'mixpanel' },
  { id: 'heap', name: 'Heap', category: 'product', load: [/cdn\.(us\.)?heapanalytics\.com\//], collect: [/heapanalytics\.com\/(h|api)/, /c\.us\.heap-api\.com\//], globals: ['heap'] },
  { id: 'posthog', name: 'PostHog', category: 'product',
    load: [/(us|eu)-assets\.i\.posthog\.com\//, /app\.posthog\.com\/static\//], collect: [/(us|eu)\.i\.posthog\.com\/(e|i|batch|capture)\//, /app\.posthog\.com\/(e|batch|capture)\//], globals: ['posthog'] },
  { id: 'pendo', name: 'Pendo', category: 'product', load: [/cdn\.pendo\.io\//], collect: [/app\.pendo\.io\/data\//], globals: ['pendo'] },
  { id: 'kissmetrics', name: 'Kissmetrics', category: 'product', load: [/i\.kissmetrics\.(io|com)\//], collect: [/trk\.kissmetrics\.(io|com)\//], globals: ['_kmq'] },
  { id: 'matomo', name: 'Matomo', category: 'analytics', load: [/\/matomo\.js/, /\/piwik\.js/, /cdn\.matomo\.cloud\//], collect: [/\/matomo\.php\?/, /\/piwik\.php\?/], globals: ['_paq', 'Matomo'] },
  { id: 'plausible', name: 'Plausible', category: 'analytics', load: [/plausible\.io\/js\//], collect: [/plausible\.io\/api\/event/], globals: ['plausible'] },
  { id: 'fathom', name: 'Fathom', category: 'analytics', load: [/cdn\.usefathom\.com\//], collect: [/cdn\.usefathom\.com\/\?/], globals: ['fathom'] },
  { id: 'vercel', name: 'Vercel Web Analytics', category: 'analytics', load: [/\/_vercel\/insights\/script\.js/, /va\.vercel-scripts\.com\//], collect: [/\/_vercel\/insights\/(view|event)/], globals: ['va'] },
  { id: 'cf_analytics', name: 'Cloudflare Web Analytics', category: 'analytics', load: [/static\.cloudflareinsights\.com\/beacon/], collect: [/cloudflareinsights\.com\/cdn-cgi\/rum/], globals: [] },
  { id: 'hubspot', name: 'HubSpot tracking', category: 'marketing', load: [/js\.hs-scripts\.com\//, /js\.hs-analytics\.net\//, /js\.hsadspixel\.net\//], collect: [/track\.hubspot\.com\/__pt?\.gif/], globals: ['_hsq'] },
  { id: 'marketo', name: 'Marketo Munchkin', category: 'marketing', load: [/munchkin\.marketo\.net\//], collect: [/\.mktoresp\.com\/webevents\//], globals: ['Munchkin'] },
  { id: 'clearbit', name: 'Clearbit Reveal', category: 'marketing', load: [/tag\.clearbitscripts\.com\//, /reveal\.clearbit\.com\//], collect: [], globals: [] },
  { id: 'sixsense', name: '6sense', category: 'marketing', load: [/j\.6sc\.co\//], collect: [/b\.6sc\.co\//, /epsilon\.6sense\.com\//], globals: ['_6si'] },
  { id: 'qualified', name: 'Qualified', category: 'marketing', load: [/js\.qualified\.com\//], collect: [/\.qualified\.com\/(api|w)\//], globals: ['qualified'] },
  { id: 'default', name: 'Default', category: 'marketing', load: [/pixel\.default\.com\//], collect: [/api\.default\.com\/api\/pixel\//], globals: [] },
  { id: 'clay', name: 'Clay (Claydar)', category: 'marketing', load: [/claydar\.com\/.*\.js/], collect: [/api\.claydar\.com\/tracker\//], globals: [] },
  { id: 'warmly', name: 'Warmly', category: 'marketing', load: [/opps-widget\.getwarmly\.com\//], collect: [/\.getwarmly\.com\/api\//], globals: [] },
  { id: 'rb2b', name: 'RB2B', category: 'marketing', load: [/b2bjsstore\/b\//], collect: [], globals: ['reb2b'] },
  { id: 'drift', name: 'Drift', category: 'marketing', load: [/js\.driftt\.com\//], collect: [], globals: ['drift'] },
  { id: 'intercom', name: 'Intercom', category: 'marketing', load: [/widget\.intercom\.io\//, /js\.intercomcdn\.com\//], collect: [/api-iam\.intercom\.io\//], globals: ['Intercom'] },

  // Session replay
  { id: 'hotjar', name: 'Hotjar', category: 'session_replay', load: [/static\.hotjar\.com\//, /script\.hotjar\.com\//], collect: [/\.hotjar\.(com|io)\//], globals: ['hj'] },
  { id: 'clarity', name: 'Microsoft Clarity', category: 'session_replay', load: [/clarity\.ms\/tag\//, /scripts\.clarity\.ms\//], collect: [/\.clarity\.ms\/collect/], globals: ['clarity'] },
  { id: 'fullstory', name: 'FullStory', category: 'session_replay', load: [/edge\.fullstory\.com\//, /fullstory\.com\/s\/fs\.js/], collect: [/rs\.fullstory\.com\//], globals: ['FS'] },
  { id: 'logrocket', name: 'LogRocket', category: 'session_replay', load: [/cdn\.(lr-ingest|logrocket)\.(io|com)\//], collect: [/r\.lr-ingest\.(io|com)\//], globals: ['LogRocket'] },
  { id: 'mouseflow', name: 'Mouseflow', category: 'session_replay', load: [/cdn\.mouseflow\.com\//], collect: [/\.mouseflow\.com\//], globals: ['mouseflow'] },

  // Ad pixels
  { id: 'meta', name: 'Meta Pixel', category: 'ads', load: [/connect\.facebook\.net\/.*fbevents\.js/], collect: [/facebook\.com\/tr\/?\?/, /facebook\.com\/tr$/], globals: ['fbq'], decode: 'meta' },
  { id: 'google_ads', name: 'Google Ads', category: 'ads', load: [/googletagmanager\.com\/gtag\/js\?id=AW-/, /googleadservices\.com\/pagead\/conversion\.js/],
    collect: [/googleads\.g\.doubleclick\.net\/pagead\/viewthroughconversion\//, /googleadservices\.com\/pagead\/conversion\//, /google\.com\/pagead\/1p-conversion\//, /google\.com\/ccm\/collect/], globals: [] },
  { id: 'dv360', name: 'Google Floodlight / DV360', category: 'ads', load: [], collect: [/fls\.doubleclick\.net\/activityi?/, /ad\.doubleclick\.net\/activity/], globals: [] },
  { id: 'linkedin', name: 'LinkedIn Insight Tag', category: 'ads', load: [/snap\.licdn\.com\/li\.lms-analytics\/insight/], collect: [/px\.ads\.linkedin\.com\//], globals: ['_linkedin_partner_id', 'lintrk'] },
  { id: 'tiktok', name: 'TikTok Pixel', category: 'ads', load: [/analytics\.tiktok\.com\/i18n\/pixel/], collect: [/analytics\.tiktok\.com\/api\/v2\/pixel/], globals: ['ttq'], decode: 'tiktok' },
  { id: 'x_pixel', name: 'X (Twitter) Pixel', category: 'ads', load: [/static\.ads-twitter\.com\/uwt\.js/], collect: [/analytics\.twitter\.com\/i\/adsct/, /t\.co\/i\/adsct/], globals: ['twq'] },
  { id: 'reddit', name: 'Reddit Pixel', category: 'ads', load: [/redditstatic\.com\/ads\/pixel\.js/], collect: [/alb\.reddit\.com\/rp\.gif/, /pixel-config\.reddit\.com\//], globals: ['rdt'] },
  { id: 'bing', name: 'Microsoft Ads (UET)', category: 'ads', load: [/bat\.bing\.com\/bat\.js/], collect: [/bat\.bing\.com\/action\//], globals: ['uetq'] },
  { id: 'pinterest', name: 'Pinterest Tag', category: 'ads', load: [/s\.pinimg\.com\/ct\/core\.js/], collect: [/ct\.pinterest\.com\/v3\//], globals: ['pintrk'] },
  { id: 'snap', name: 'Snap Pixel', category: 'ads', load: [/sc-static\.net\/scevent\.min\.js/], collect: [/tr\.snapchat\.com\//], globals: ['snaptr'] },
  { id: 'quora', name: 'Quora Pixel', category: 'ads', load: [/a\.quora\.com\/qevents\.js/], collect: [/q\.quora\.com\/_\/ad\//], globals: ['qp'] },
  { id: 'criteo', name: 'Criteo', category: 'ads', load: [/static\.criteo\.net\/js\//], collect: [/\.criteo\.com\/(event|delivery)/], globals: ['criteo_q'] },

  // Consent
  { id: 'onetrust', name: 'OneTrust', category: 'consent', load: [/cdn\.cookielaw\.org\//, /optanon\.blob\.core\.windows\.net\//, /cookie-cdn\.cookiepro\.com\//], collect: [], globals: ['OneTrust', 'OptanonActiveGroups'] },
  { id: 'cookiebot', name: 'Cookiebot', category: 'consent', load: [/consent\.cookiebot\.(com|eu)\//], collect: [], globals: ['Cookiebot'] },
  { id: 'usercentrics', name: 'Usercentrics', category: 'consent', load: [/app\.usercentrics\.eu\//, /web\.cmp\.usercentrics\.eu\//], collect: [], globals: ['UC_UI', '__ucCmp'] },
  { id: 'termly', name: 'Termly', category: 'consent', load: [/app\.termly\.io\//], collect: [], globals: [] },
  { id: 'osano', name: 'Osano', category: 'consent', load: [/cmp\.osano\.com\//], collect: [], globals: ['Osano'] },
  { id: 'didomi', name: 'Didomi', category: 'consent', load: [/sdk\.privacy-center\.org\//], collect: [], globals: ['Didomi'] },
  { id: 'trustarc', name: 'TrustArc', category: 'consent', load: [/consent\.trustarc\.com\//, /consent\.truste\.com\//], collect: [], globals: ['truste'] },
  { id: 'ketch', name: 'Ketch', category: 'consent', load: [/global\.ketchcdn\.com\//], collect: [], globals: ['ketch'] },
  { id: 'iubenda', name: 'iubenda', category: 'consent', load: [/cdn\.iubenda\.com\//], collect: [], globals: ['_iub'] },
  { id: 'cookieyes', name: 'CookieYes', category: 'consent', load: [/cdn-cookieyes\.com\//], collect: [], globals: [] },
];

export const CATEGORY_LABEL = {
  cdp: 'CDP / event pipeline',
  analytics: 'Web analytics',
  product: 'Product analytics',
  tag_manager: 'Tag manager',
  ads: 'Ad pixel',
  session_replay: 'Session replay / heatmaps',
  marketing: 'Marketing automation / B2B intent',
  consent: 'Consent manager (CMP)',
};

// Categories that send behavioral data to a vendor. Used for "before consent" and sprawl checks.
export const TRACKING_CATEGORIES = new Set(['cdp', 'analytics', 'product', 'ads', 'session_replay', 'marketing']);
