import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RudderAnalytics } from '@rudderstack/analytics-js';

import { RudderTyper } from '../generated';

const fakeSDK = () => ({ track: vi.fn(), identify: vi.fn() }) as unknown as RudderAnalytics;

describe('the generated client resolves the SDK late', () => {
  beforeEach(() => {
    delete (globalThis as { rudderanalytics?: unknown }).rudderanalytics;
  });

  /**
   * The regression this pins: the
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

describe('the absent-SDK stub', () => {
  /**
   * The reason client.ts exists at all. The generated client calls
   * `this.analytics.track(...)` unguarded, so with no write key configured — and
   * therefore no `window.rudderanalytics` — a plain resolver throws a TypeError out
   * of a track call. Inside a `try` whose `catch` shows the user an error, that
   * turns a successful action into a reported failure.
   *
   * Without this test, removing the stub (say, once the generator guards internally)
   * leaves the suite green and the regression invisible.
   */
  it('swallows calls instead of throwing when no SDK is present', async () => {
    delete (globalThis as { rudderanalytics?: unknown }).rudderanalytics;
    (globalThis as { window?: unknown }).window = globalThis;

    const { storefront } = await import('../client');

    expect(() =>
      storefront.trackCheckoutStarted({
        cartId: 'c',
        itemCount: 1,
        cartTotal: 1,
        currency: 'usd',
      }),
    ).not.toThrow();
  });

  it('throws without the stub — the behaviour the stub exists to prevent', () => {
    const bare = new RudderTyper(
      () => (globalThis as { rudderanalytics?: RudderAnalytics }).rudderanalytics!,
    );
    delete (globalThis as { rudderanalytics?: unknown }).rudderanalytics;

    expect(() =>
      bare.trackCheckoutStarted({ cartId: 'c', itemCount: 1, cartTotal: 1, currency: 'usd' }),
    ).toThrow(TypeError);
  });
});
