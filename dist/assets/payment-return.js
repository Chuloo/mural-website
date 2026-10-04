import { SESSION_KEY, ATTEMPT_KEY, purchaseSession, purchaseAttempt } from './buy-minutes-core.js';

// Native checkout keeps the existing return page. Only this tab's verified web
// purchase resumes its account-scoped status check; query strings prove nothing.
try {
  const session=purchaseSession(JSON.parse(sessionStorage.getItem(SESSION_KEY)));
  if (session && purchaseAttempt(JSON.parse(sessionStorage.getItem(ATTEMPT_KEY)),session.email))
    location.replace('/buy-minutes/');
} catch { /* The generic native return page remains available. */ }
