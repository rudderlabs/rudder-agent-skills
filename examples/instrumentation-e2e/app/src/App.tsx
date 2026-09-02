import { useState } from 'react';

import { storefront, type storefrontTypes } from './analytics';

const CART: storefrontTypes.CheckoutStarted = {
  cartId: 'cart_9f21',
  itemCount: 3,
  cartTotal: 8940,
  currency: 'usd',
};

export function App() {
  const [stage, setStage] = useState<'browsing' | 'checkout' | 'done'>('browsing');

  const openCheckout = () => {
    // Required props are non-optional parameters; `couponCode` is genuinely absent
    // here and is modelled optional in the catalog, so nothing has to be invented.
    storefront.trackCheckoutStarted(CART);
    setStage('checkout');
  };

  const pay = (paymentMethod: storefrontTypes.CheckoutCompleted['paymentMethod']) => {
    // Analytics must never change behaviour: a blocked or missing SDK throwing here
    // would report a successful payment as a failure.
    try {
      storefront.trackCheckoutCompleted({
        cartId: CART.cartId,
        cartTotal: CART.cartTotal,
        currency: CART.currency,
        paymentMethod,
      });
    } catch {
      /* analytics is best-effort */
    }
    setStage('done');
  };

  const abandon = () => {
    storefront.trackCheckoutAbandoned({
      cartId: CART.cartId,
      abandonmentReason: 'closed_tab',
    });
    setStage('browsing');
  };

  const signIn = () => {
    storefront.identify('user_314', { email: 'ada@example.com', planTier: 'pro' });
  };

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '4rem auto' }}>
      <h1>Storefront</h1>
      <p>
        Every call below goes through the generated client. Open the console: with no
        write key configured the events are swallowed by the absent-SDK stub, and the
        payload shapes are still enforced at compile time.
      </p>

      <button onClick={signIn}>Sign in</button>

      {stage === 'browsing' && <button onClick={openCheckout}>Checkout ({CART.itemCount} items)</button>}

      {stage === 'checkout' && (
        <>
          <button onClick={() => pay('card')}>Pay by card</button>
          <button onClick={() => pay('apple_pay')}>Apple Pay</button>
          <button onClick={abandon}>Leave</button>
        </>
      )}

      {stage === 'done' && <p>Order placed.</p>}
    </main>
  );
}
