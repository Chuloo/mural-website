(() => {
  const triggers = [...document.querySelectorAll('[data-request-access]')];
  if (!triggers.length || typeof HTMLDialogElement === 'undefined') return;

  const dialog = document.createElement('dialog');
  dialog.className = 'access-dialog';
  dialog.setAttribute('aria-labelledby', 'access-title');
  dialog.setAttribute('aria-describedby', 'access-description');
  dialog.innerHTML = `
    <button class="access-close" type="button" aria-label="Close request access">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
    </button>
    <div class="access-orb" aria-hidden="true"></div>
    <h2 id="access-title">Your next hello.</h2>
    <p id="access-description">Mural is getting ready for your iPhone. Leave your email for an invitation when access opens.</p>
    <form class="access-form">
      <label for="access-email">Email address</label>
      <input id="access-email" name="email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" maxlength="254" required aria-describedby="access-consent access-error">
      <div class="access-trap" aria-hidden="true"><label for="access-website">Website</label><input id="access-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
      <p id="access-error" class="access-error" role="alert" hidden></p>
      <button class="button primary access-submit" type="submit">Request access <span aria-hidden="true">↗</span></button>
      <p id="access-consent" class="access-consent">By submitting, you ask us to email you about Mural access. You can withdraw at any time. <a href="/privacy/">Privacy policy</a></p>
    </form>
    <div class="access-success" role="status" tabindex="-1" hidden>
      <p>You’re on the list.</p>
      <span>We’ll email you when your invitation is ready.</span>
      <button class="button secondary" type="button" data-access-done>Lovely</button>
    </div>`;
  document.body.append(dialog);

  const form = dialog.querySelector('form');
  const email = dialog.querySelector('[name="email"]');
  const error = dialog.querySelector('#access-error');
  const submit = dialog.querySelector('[type="submit"]');
  const success = dialog.querySelector('.access-success');
  let opener, pending = false, accepted = false;

  function close() { dialog.close(); }
  for (const trigger of triggers) trigger.addEventListener('click', event => {
    event.preventDefault();
    opener = trigger;
    dialog.showModal();
    document.body.classList.add('access-open');
    (accepted ? success : email).focus({ preventScroll: true });
  });
  dialog.querySelector('.access-close').addEventListener('click', close);
  dialog.querySelector('[data-access-done]').addEventListener('click', close);
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('access-open');
    opener?.focus({ preventScroll: true });
  });
  email.addEventListener('input', () => { error.hidden = true; email.removeAttribute('aria-invalid'); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || !form.reportValidity()) return;
    pending = true; error.hidden = true; submit.disabled = true;
    submit.textContent = 'Requesting…'; form.setAttribute('aria-busy', 'true');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('https://api.mural.chat/v1/access-requests', {
        method: 'POST', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ email: email.value.trim(), consentVersion: 'waitlist-v1', source: 'website', website: form.elements.website.value })
      });
      const result = await response.json().catch(() => null);
      if (response.status === 400) {
        email.setAttribute('aria-invalid', 'true');
        throw new Error('Check your email address and try again.');
      }
      if (response.status === 429) throw new Error('A few too many requests. Please try again in an hour.');
      if (response.status === 503 && result?.error?.code === 'access_requests_full')
        throw new Error('Access requests are temporarily at capacity. Please try again later, or email hi@hackmamba.io.');
      if (response.status !== 202 || result?.accepted !== true)
        throw new Error('Your request wasn’t saved. Please try again, or email hi@hackmamba.io for access.');
      accepted = true; form.hidden = true; success.hidden = false;
      dialog.querySelector('#access-description').hidden = true;
      // Email lives only in this request and the database, never browser storage.
      email.value = '';
      if (dialog.open) success.focus({ preventScroll: true });
    } catch (failure) {
      error.textContent = failure instanceof TypeError || failure.name === 'AbortError'
        ? 'We couldn’t connect. Check your connection and try again.'
        : failure.message;
      error.hidden = false;
    } finally {
      clearTimeout(timeout); pending = false; submit.disabled = false;
      submit.innerHTML = 'Request access <span aria-hidden="true">↗</span>';
      form.removeAttribute('aria-busy');
    }
  });
})();
