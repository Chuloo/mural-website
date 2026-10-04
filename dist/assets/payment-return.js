import { SESSION_KEY, ATTEMPT_KEY, RETURN_KEY, purchaseSession, purchaseAttempt, purchaseReturn } from './buy-minutes-core.js?v=20261005-simple-checkout';

// The return reference selects an owned status read. Stripe's query string
// never grants value; cancellation restores the editable purchase form.
try {
  const session=purchaseSession(JSON.parse(sessionStorage.getItem(SESSION_KEY)));
  const returned=session?purchaseReturn(JSON.parse(sessionStorage.getItem(RETURN_KEY)),session.email):null;
  const legacy=session?purchaseAttempt(JSON.parse(sessionStorage.getItem(ATTEMPT_KEY)),session.email):null;
  sessionStorage.removeItem(ATTEMPT_KEY); sessionStorage.removeItem(RETURN_KEY);
  if (session && (returned || legacy)) {
    const reference=returned ?? (legacy?.orderID?{email:session.email,orderID:legacy.orderID,expiresAt:session.expiresAt}:null);
    if (reference && new URLSearchParams(location.search).get('status')==='success')
      sessionStorage.setItem(RETURN_KEY,JSON.stringify({...reference,checkOnReturn:true}));
    location.replace('/buy-minutes/');
  }
} catch { /* The generic native return page remains available. */ }
