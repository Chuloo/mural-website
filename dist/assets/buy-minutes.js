import { PURCHASE_API, SESSION_KEY, ATTEMPT_KEY, purchaseSession, purchaseAttempt, purchaseCatalog, originalOrderQuote, checkoutRedirect, purchaseResult } from './buy-minutes-core.js?v=20261005-recovery';

const byID = id => document.getElementById(id);
const read = key => { try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; } };
const store = (key,value) => { sessionStorage.setItem(key,JSON.stringify(value)); };
let session = purchaseSession(read(SESSION_KEY));
let attempt = session ? purchaseAttempt(read(ATTEMPT_KEY),session.email) : null;
let challenge, enteredEmail = '', catalog, busy = false, resendAt = 0;
const steps = ['email','code','packs','result'];
const message = text => { byID('purchase-status').textContent = text; };
function show(step,{focus=true}={}) {
  for (const name of steps) byID(`${name}-step`).hidden = name !== step;
  message('');
  const target = byID(step === 'email'?'account-email':step === 'code'?'email-code':step === 'packs'?'packs-title':'result-title');
  if (target && target.tagName !== 'INPUT') target.setAttribute('tabindex','-1');
  if (focus) target?.focus();
}
function setBusy(value) {
  busy = value;
  for (const button of document.querySelectorAll('.purchase button')) {
    button.disabled = value; button.setAttribute('aria-busy',String(value));
  }
  byID('resend-code').disabled = value || Date.now()<resendAt;
  byID('checkout').disabled = value || !catalog;
}
function clearSession(preserveAttempt=false) {
  session = null; attempt = null; catalog = undefined; challenge = undefined;
  sessionStorage.removeItem(SESSION_KEY); if (!preserveAttempt) sessionStorage.removeItem(ATTEMPT_KEY); byID('email-code').value = '';
}
function errorCopy(error) {
  if (error.code === 'purchase_verification_required') return 'Your checkout access has expired. Verify your Mural email again to continue.';
  if (error.code === 'invalid_purchase_code') return 'That code is incorrect, expired or already used. Try again or send another code.';
  if (error.code === 'purchase_email_rate_limit' || error.code === 'rate_limit') return 'Please wait before trying again. You can request up to three codes per hour.';
  if (error.code === 'cash_balance_reconciliation_required') return 'Your account needs a balance check before a new purchase. Please contact support.';
  if (error.code === 'checkout_reconciliation_required') return 'This checkout needs a payment check. Please contact support before starting another purchase.';
  if (error.code === 'storage_unavailable') return 'Allow this site to use session storage, then reload to continue securely.';
  return 'We couldn’t complete that step. Please try again. If it continues, contact support.';
}
async function request(path,{method='GET',body,key,authenticated=true}={}) {
  const headers = { ...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{}) };
  if (authenticated) {
    if (!session || session.expiresAt<=Date.now()) { const error=new Error(); error.code='purchase_verification_required'; throw error; }
    headers.Authorization = `Bearer ${session.token}`;
  }
  const response = await fetch(`${PURCHASE_API}${path}`, { method,headers,...(body?{body:JSON.stringify(body)}:{}),
    credentials:'omit',mode:'cors',cache:'no-store',referrerPolicy:'no-referrer',redirect:'error',signal:AbortSignal.timeout(20_000) });
  if (Number(response.headers.get('Content-Length'))>131_072) throw new Error('invalid_response');
  const text = await response.text(); if (text.length>131_072) throw new Error('invalid_response');
  const value = JSON.parse(text);
  if (!response.ok) { const error=new Error(); error.code=value?.error?.code; throw error; }
  return value;
}
async function run(action) {
  if (busy) return;
  setBusy(true); message('');
  try { await action(); }
  catch (error) {
    if (error.code==='purchase_verification_required') { clearSession(true); show('email'); }
    message(errorCopy(error));
  } finally { setBusy(false); }
}
function selectedProduct() { return catalog?.products.find(product => product.sku===document.querySelector('input[name=pack]:checked')?.value); }
const dollars = minor => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(minor/100);
function total() {
  const product=selectedProduct(),quantity=Number(byID('quantity').value);
  byID('checkout-total').textContent=product?dollars(product.totalMinor*quantity):'—';
}
async function loadProducts() {
  catalog = purchaseCatalog(await request('/products'));
  byID('verified-email').textContent=session.email;
  const list=byID('pack-list'); list.replaceChildren();
  catalog.products.forEach((product,index) => {
    const label=document.createElement('label'); label.className='pack-option';
    const radio=document.createElement('input'); radio.type='radio'; radio.name='pack'; radio.value=product.sku; radio.checked=index===0;
    const details=document.createElement('span'),name=document.createElement('span'),minutes=document.createElement('span'),price=document.createElement('span');
    name.className='pack-name'; name.textContent=catalog.products.length===3?['Small pack','Medium pack','Large pack'][index]:'Minute pack';
    minutes.className='pack-minutes'; minutes.textContent=`About ${Math.floor(product.estimatedMilliseconds/60_000)} minutes`;
    price.className='pack-price'; price.textContent=dollars(product.totalMinor);
    details.append(name,minutes); label.append(radio,details,price); list.append(label);
  });
  for (const option of byID('quantity').options) option.disabled=Number(option.value)>catalog.maximumQuantity;
  byID('quantity').value='1'; total(); show('packs');
}
async function sendCode() {
  const reply=await request('/challenges',{method:'POST',body:{email:enteredEmail},authenticated:false});
  if (!reply || typeof reply.challengeID!=='string' || !/^[a-f0-9-]{36}$/i.test(reply.challengeID) ||
      reply.expiresInSeconds!==600 || reply.resendAfterSeconds!==60) throw new Error('invalid_response');
  challenge=reply.challengeID; resendAt=Date.now()+60_000; byID('email-code').value=''; show('code');
}
async function checkPayment() {
  if (!attempt) { await loadProducts(); return; }
  show('result'); byID('resume-checkout').hidden=true; byID('buy-again').hidden=true;
  byID('result-title').textContent='Checking your payment'; byID('result-message').textContent='Your account updates after Stripe confirms the payment.';
  if (!attempt.orderID) {
    try {
      const value=await request(`/orders/by-key/${encodeURIComponent(attempt.key)}`);
      if (!/^[a-f0-9-]{36}$/i.test(value.orderID)) throw new Error('invalid_response');
      attempt.orderID=value.orderID; store(ATTEMPT_KEY,attempt);
    } catch (error) {
      if (error.code!=='purchase_not_found') throw error;
      byID('result-title').textContent='Checkout interrupted';
      byID('result-message').textContent='No payment is confirmed. Continue with the same purchase to avoid a duplicate checkout.';
      byID('resume-checkout').hidden=false; return;
    }
  }
  const status=await request(`/orders/${encodeURIComponent(attempt.orderID)}`);
  const state=purchaseResult(status,attempt.orderID);
  Object.assign(attempt,originalOrderQuote(status,attempt)); store(ATTEMPT_KEY,attempt);
  byID('result-title').textContent=state.title; byID('result-message').textContent=state.message;
  if (state.resumable) byID('result-message').textContent+=` This purchase’s subtotal is ${dollars(attempt.unitTotalMinor*attempt.quantity)}. Review it before continuing to payment.`;
  byID('check-payment').hidden=state.complete; byID('buy-again').hidden=!state.complete;
  byID('resume-checkout').hidden=!state.resumable;
}
async function checkout(resume=false) {
  let product;
  if (!resume) {
    if (!catalog) throw new Error('invalid_purchase');
    product=selectedProduct(); const quantity=Number(byID('quantity').value);
    if (!product || !Number.isInteger(quantity) || quantity<1 || quantity>catalog.maximumQuantity) throw new Error('invalid_purchase');
    attempt={email:session.email,key:crypto.randomUUID(),sku:product.sku,quantity,unitTotalMinor:product.totalMinor,unitAIValueNanoUSD:product.aiValueNanoUSD}; store(ATTEMPT_KEY,attempt);
  }
  if (!attempt) throw new Error('invalid_purchase');
  show('result'); byID('result-title').textContent='Opening secure checkout';
  byID('result-message').textContent='If this step is interrupted, check the same purchase before trying again.';
  byID('resume-checkout').hidden=false; byID('check-payment').hidden=false; byID('buy-again').hidden=true;
  const reply=await request('/orders',{method:'POST',body:{sku:attempt.sku,quantity:attempt.quantity},key:attempt.key});
  if (!attempt.orderID && typeof reply.orderID==='string' && /^[a-f0-9-]{36}$/i.test(reply.orderID)) {
    attempt.orderID=reply.orderID; store(ATTEMPT_KEY,attempt);
  }
  const redirect=checkoutRedirect(reply,attempt); attempt.orderID=redirect.orderID; store(ATTEMPT_KEY,attempt);
  location.assign(redirect.url);
}
byID('email-form').addEventListener('submit',event=>{ event.preventDefault(); run(async()=>{ enteredEmail=byID('account-email').value.trim().toLowerCase(); await sendCode(); }); });
byID('code-form').addEventListener('submit',event=>{ event.preventDefault(); run(async()=>{
  const value=await request('/verify',{method:'POST',body:{challengeID:challenge,code:byID('email-code').value},authenticated:false});
  if (value.expiresInSeconds!==1800) throw new Error('invalid_response');
  session=purchaseSession({...value,expiresAt:Date.now()+1_800_000}); if (!session) throw new Error('invalid_response');
  store(SESSION_KEY,session); byID('email-code').value='';
  attempt=purchaseAttempt(read(ATTEMPT_KEY),session.email);
  if (attempt) await checkPayment(); else await loadProducts();
}); });
byID('resend-code').addEventListener('click',()=>run(sendCode));
byID('change-email').addEventListener('click',()=>{ challenge=undefined; show('email'); });
byID('sign-out').addEventListener('click',()=>run(async()=>{ try { await request('/session',{method:'DELETE'}); } finally { clearSession(); show('email'); } }));
byID('purchase-form').addEventListener('submit',event=>{ event.preventDefault(); run(()=>checkout()); });
byID('pack-list').addEventListener('change',total); byID('quantity').addEventListener('change',total);
byID('check-payment').addEventListener('click',()=>run(checkPayment));
byID('resume-checkout').addEventListener('click',()=>run(()=>checkout(true)));
byID('buy-again').addEventListener('click',()=>run(async()=>{ attempt=null; sessionStorage.removeItem(ATTEMPT_KEY); await loadProducts(); }));
setInterval(()=>{ byID('resend-code').disabled=busy || Date.now()<resendAt; },1000);
try { sessionStorage.setItem('mural-storage-check','1'); sessionStorage.removeItem('mural-storage-check'); }
catch { const error=new Error(); error.code='storage_unavailable'; setBusy(true); message(errorCopy(error)); }
if (!busy) run(async()=>{
  if (!session) { show('email',{focus:false}); return; }
  const identity=await request('/session'); if (identity.email!==session.email) throw new Error('invalid_response');
  if (attempt) await checkPayment(); else await loadProducts();
});
