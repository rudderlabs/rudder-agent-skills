/**
 * `storefront` is the typed client instance used to fire events
 * (storefront.trackCheckoutStarted({...})); `storefrontTypes` exposes the generated
 * payload types (storefrontTypes.CheckoutStarted). They cannot share a name — a
 * value and a type namespace collide in the same export.
 */
export { storefront } from './client';
export type * as storefrontTypes from './generated';
