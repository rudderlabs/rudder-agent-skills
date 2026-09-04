import type { RudderAnalytics } from '@rudderstack/analytics-js';

import { RudderTyper } from './generated';

const noop = () => undefined;

/**
 * The snippet in index.html leaves `window.rudderanalytics` undefined when no write
 * key is configured, and the generated client calls `analytics.track(...)` without
 * guarding. Substituting a stub that swallows every call keeps a missing SDK from
 * throwing out of a `track` call and being mistaken for a failed user action.
 *
 * Absence is not the same problem as late binding — the generated client solves the
 * latter, not this.
 */
const absentAnalytics = new Proxy({} as RudderAnalytics, { get: () => noop });

/**
 * Late binding is handled by the generated client: it re-invokes this resolver on
 * every call, so the preloader-to-real-SDK swap the snippet performs is picked up
 * automatically.
 *
 * Constructing with an instance instead — `new RudderTyper(window.rudderanalytics)`
 * — would pin whatever sat on `window` at import time and silently drop every event
 * fired after the SDK loads. Since rudder-cli 0.22.0 that form does not compile.
 */
export const storefront = new RudderTyper(
  () => (window.rudderanalytics ?? absentAnalytics) as RudderAnalytics,
);
