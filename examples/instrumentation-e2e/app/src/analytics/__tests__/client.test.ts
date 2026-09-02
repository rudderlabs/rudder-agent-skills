import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RudderAnalytics } from '@rudderstack/analytics-js';

import { RudderTyper } from '../generated';

const fakeSDK = () => ({ track: vi.fn(), identify: vi.fn() }) as unknown as RudderAnalytics;

describe('the generated client resolves the SDK late', () => {
  beforeEach(() => {
    delete (globalThis as { rudderanalytics?: unknown }).rudderanalytics;
  });

  /**
   * The regression this pins is the one the rudder-webapp dogfooding surfaced: the
   * snippet swaps `window.rudderanalytics` from a buffering preloader to the real
   * SDK *after* module import, so a client that captured the instance in its
   * constructor sends every subsequent event into an abandoned queue. Silently —
   * no error, no type error, no failed build.
   */
  it('sends through whatever is on window at call time, not at construction time', () => {
    const preloader = fakeSDK();
    const realSDK = fakeSDK();

    (globalThis as { rudderanalytics?: RudderAnalytics }).rudderanalytics = preloader;

    // Constructed while the preloader is installed — exactly when a real app's
    // module graph is evaluated.
    const client = new RudderTyper(
      () => (globalThis as { rudderanalytics?: RudderAnalytics }).rudderanalytics!,
    );

    // The snippet's swap.
    (globalThis as { rudderanalytics?: RudderAnalytics }).rudderanalytics = realSDK;

    client.trackCheckoutStarted({
      cartId: 'cart_1',
      itemCount: 1,
      cartTotal: 100,
      currency: 'usd',
    });

    expect(realSDK.track).toHaveBeenCalledTimes(1);
    expect(preloader.track).not.toHaveBeenCalled();
  });

  it('re-invokes the resolver on every call', () => {
    const resolve = vi.fn(fakeSDK);
    const client = new RudderTyper(resolve);

    client.trackCheckoutStarted({ cartId: 'c', itemCount: 1, cartTotal: 1, currency: 'usd' });
    client.trackCheckoutAbandoned({ cartId: 'c', abandonmentReason: 'closed_tab' });

    expect(resolve).toHaveBeenCalledTimes(2);
  });
});
