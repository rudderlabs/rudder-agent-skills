/**
 * Compile-time assertions that the catalog really is the contract.
 *
 * Nothing here runs — the function is never called. It is `tsc --noEmit` that
 * checks it, and `@ts-expect-error` inverts the assertion: if any line below
 * stops being a type error (a property becomes optional, an enum gains a member,
 * an event is renamed), the directive is reported as unused and `npm run
 * typecheck` fails. That makes this a test of the *generator*, not of
 * hand-written types.
 */
import type { RudderAnalytics } from '@rudderstack/analytics-js';

import { RudderTyper } from './generated';

export function contractAssertions(client: RudderTyper) {
  // The shape the catalog does allow.
  client.trackCheckoutStarted({ cartId: 'c', itemCount: 1, cartTotal: 1, currency: 'usd' });
  // `couponCode` is optional in the plan, so omitting it is fine and supplying it is too.
  client.trackCheckoutStarted({
    cartId: 'c',
    itemCount: 1,
    cartTotal: 1,
    currency: 'usd',
    couponCode: 'SPRING',
  });

  // @ts-expect-error -- `itemCount` is required by the checkout_started rule
  client.trackCheckoutStarted({ cartId: 'c', cartTotal: 1, currency: 'usd' });

  // @ts-expect-error -- "btc" is not in the currency_type enum
  client.trackCheckoutStarted({ cartId: 'c', itemCount: 1, cartTotal: 1, currency: 'btc' });

  // @ts-expect-error -- cartTotal is a number in the catalog, not a string
  client.trackCheckoutStarted({ cartId: 'c', itemCount: 1, cartTotal: '1', currency: 'usd' });

  // @ts-expect-error -- typo: the property is `cartId`
  client.trackCheckoutAbandoned({ cartID: 'c', abandonmentReason: 'closed_tab' });

  // @ts-expect-error -- no such event in the tracking plan
  client.trackCheckoutRefunded({ cartId: 'c' });
}

/**
 * The event-drop footgun is a compile error, not a convention. Before rudder-cli
 * 0.22.0 the constructor also accepted an instance, which captured the snippet's
 * buffering preloader and silently dropped everything fired after the real SDK
 * loaded. Resolver-only means that form no longer type-checks.
 */
export function constructorAssertions(sdk: RudderAnalytics) {
  new RudderTyper(() => sdk);

  // @ts-expect-error -- passing an instance captures it once; pass a resolver
  new RudderTyper(sdk);
}
