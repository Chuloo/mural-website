import { PURCHASE_API, SESSION_KEY, ATTEMPT_KEY, RETURN_KEY, purchaseSession, purchaseReturn, purchaseCatalog, checkoutRedirect, purchaseResult } from './buy-minutes-core.js?v=20261005-simple-checkout';

const byID = id => document.getElementById(id);
const read = key => { try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; } };
const store = (key,value) => {
  try { sessionStorage.setItem(key,JSON.stringify(value)); }
  catch { const error=new Error(); error.code='storage_unavailable'; throw error; }
};
const remove = key => { try { sessionStorage.removeItem(key); } catch { /* Storage is checked before requests. */ } };
let session = purchaseSession(read(SESSION_KEY));
let attempt = null, payment = null;
const returned = session ? purchaseReturn(read(RETURN_KEY),session.email) : null;
remove(ATTEMPT_KEY); remove(RETURN_KEY);
let challenge, enteredEmail = '', catalog, busy = false, resendAt = 0;
const steps = ['email','code','packs'];
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
  byID('quantity').disabled = value || !catalog;
  for (const radio of document.querySelectorAll('input[name=pack]')) radio.disabled = value;
}
function clearSession() {
  session = null; attempt = null; payment = null; catalog = undefined; challenge = undefined;
  remove(SESSION_KEY); remove(ATTEMPT_KEY); remove(RETURN_KEY);
  byID('email-code').value = ''; byID('result-step').hidden = true;
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
    if (error.code==='purchase_verification_required') { clearSession(); show('email'); }
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
  attempt = null;
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
  if (!payment) return;
  byID('result-step').hidden=false;
  byID('result-title').textContent='Checking your payment'; byID('result-message').textContent='Your account updates after Stripe confirms the payment.';
  const status=await request(`/orders/${encodeURIComponent(payment.orderID)}`);
  const state=purchaseResult(status,payment.orderID);
  byID('result-title').textContent=state.title; byID('result-message').textContent=state.message;
  byID('check-payment').hidden=state.complete;
}
async function checkout() {
  if (!catalog) throw new Error('invalid_purchase');
  const product=selectedProduct(),quantity=Number(byID('quantity').value);
  if (!product || !Number.isInteger(quantity) || quantity<1 || quantity>catalog.maximumQuantity) throw new Error('invalid_purchase');
  if (!attempt || attempt.sku!==product.sku || attempt.quantity!==quantity)
    attempt={email:session.email,key:crypto.randomUUID(),sku:product.sku,quantity,unitTotalMinor:product.totalMinor,unitAIValueNanoUSD:product.aiValueNanoUSD};
  const draft=attempt;
  message('Opening secure checkout…');
  const reply=await request('/orders',{method:'POST',body:{sku:draft.sku,quantity:draft.quantity},key:draft.key});
  if (attempt!==draft) return;
  const redirect=checkoutRedirect(reply,draft); draft.orderID=redirect.orderID;
  store(RETURN_KEY,{email:session.email,orderID:redirect.orderID,expiresAt:session.expiresAt});
  location.assign(redirect.url);
}
byID('email-form').addEventListener('submit',event=>{ event.preventDefault(); run(async()=>{ enteredEmail=byID('account-email').value.trim().toLowerCase(); await sendCode(); }); });
byID('code-form').addEventListener('submit',event=>{ event.preventDefault(); run(async()=>{
  const value=await request('/verify',{method:'POST',body:{challengeID:challenge,code:byID('email-code').value},authenticated:false});
  if (value.expiresInSeconds!==1800) throw new Error('invalid_response');
  session=purchaseSession({...value,expiresAt:Date.now()+1_800_000}); if (!session) throw new Error('invalid_response');
  store(SESSION_KEY,session); byID('email-code').value='';
  await loadProducts();
}); });
byID('resend-code').addEventListener('click',()=>run(sendCode));
byID('change-email').addEventListener('click',()=>{ challenge=undefined; show('email'); });
byID('sign-out').addEventListener('click',()=>run(async()=>{ try { await request('/session',{method:'DELETE'}); } finally { clearSession(); show('email'); } }));
byID('purchase-form').addEventListener('submit',event=>{ event.preventDefault(); run(()=>checkout()); });
byID('pack-list').addEventListener('change',()=>{ attempt=null; total(); }); byID('quantity').addEventListener('change',()=>{ attempt=null; total(); });
byID('check-payment').addEventListener('click',()=>run(checkPayment));
setInterval(()=>{ byID('resend-code').disabled=busy || Date.now()<resendAt; },1000);
try { sessionStorage.setItem('mural-storage-check','1'); sessionStorage.removeItem('mural-storage-check'); }
catch { const error=new Error(); error.code='storage_unavailable'; setBusy(true); message(errorCopy(error)); }
if (!busy) run(async()=>{
  if (!session) { show('email',{focus:false}); return; }
  const identity=await request('/session'); if (identity.email!==session.email) throw new Error('invalid_response');
  await loadProducts();
  if (returned?.checkOnReturn) { payment={orderID:returned.orderID}; await checkPayment(); }
});
window.addEventListener('pageshow',event=>{
  if (!event.persisted) return;
  remove(RETURN_KEY); remove(ATTEMPT_KEY);
  attempt=null; payment=null; byID('result-step').hidden=true;
  setBusy(false);
  run(async()=>{ if (!session || session.expiresAt<=Date.now()) { clearSession(); show('email',{focus:false}); return; } await loadProducts(); });
});
