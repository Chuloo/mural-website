import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { purchaseSession,purchaseAttempt,purchaseReturn,purchaseCatalog,originalOrderQuote,checkoutRedirect,purchaseResult } from '../dist/assets/buy-minutes-core.js';

const email='buyer@private.icloud.com',token='a'.repeat(43),id=randomUUID();
const product={sku:'small',environment:'live',currency:'usd',totalMinor:500,entitlementKind:'ai_value',billingBasis:'actual-ai-usage',estimate:true,
  aiValueNanoUSD:'3690000000',estimatedMilliseconds:1920000,quote:{currency:'usd',currencyExponent:2,totalMinor:500}};
const catalog={available:true,maximumQuantity:10,billingBasis:'actual-ai-usage',products:[product]};
const attempt={email,key:randomUUID(),sku:'small',quantity:2,unitTotalMinor:500,unitAIValueNanoUSD:'3690000000',orderID:id};
const order={orderID:id,environment:'live',sku:'small',quantity:2,currency:'usd',totalMinor:1000,aiValueNanoUSD:'7380000000',entitlementKind:'ai_value',
  payment:{orderID:id,checkoutURL:'https://checkout.stripe.com/c/pay/synthetic'}};
const status={orderID:id,entitlementKind:'ai_value',state:'created',grantedNanoUSD:'0',reversedNanoUSD:'0',reversalOutstandingNanoUSD:'0',fulfillmentRecorded:false,
  order:{sku:'small',quantity:2,currency:'usd',totalMinor:1000,aiValueNanoUSD:'7380000000'}};

test('purchase session and attempt parse only bounded, current and email-matched access',()=>{
  assert.deepEqual(purchaseSession({token,email,expiresAt:1900},1000),{token,email,expiresAt:1900});
  for(const value of [{token,email,expiresAt:999},{token,email,expiresAt:1801001},{token:'bad',email,expiresAt:1900},null])assert.equal(purchaseSession(value,1000),null);
  assert.deepEqual(purchaseAttempt(attempt,email),attempt);
  for(const value of [{...attempt,quantity:11},{...attempt,quantity:'2'},{...attempt,key:'bad'},{...attempt,unitTotalMinor:0},{...attempt,unitAIValueNanoUSD:'0'}])assert.equal(purchaseAttempt(value,email),null);
  assert.equal(purchaseAttempt(attempt,'different@example.test'),null);
});
test('catalog rejects synthetic, malformed, oversized and duplicate offers',()=>{
  assert.equal(purchaseCatalog(catalog).products[0].totalMinor,500);
  for(const value of [{...catalog,available:false},{...catalog,maximumQuantity:11},{...catalog,products:[product,product]},
    {...catalog,products:[{...product,environment:'test'}]},{...catalog,products:[{...product,totalMinor:0}]},
    {...catalog,products:[{...product,quote:{...product.quote,currencyExponent:0}}]}])assert.throws(()=>purchaseCatalog(value));
});
test('checkout redirects bind original amount, allocation, quantity, order and exact Stripe host',()=>{
  assert.equal(checkoutRedirect(order,attempt).orderID,id);
  const fragmentURL='https://checkout.stripe.com/c/pay/synthetic#fidkdWxOYHwnPyd1synthetic';
  assert.equal(checkoutRedirect({...order,payment:{...order.payment,checkoutURL:fragmentURL}},attempt).url,fragmentURL);
  const otherID=randomUUID();
  for(const value of [{...order,orderID:otherID,payment:{...order.payment,orderID:otherID}},
    {...order,totalMinor:1001},{...order,aiValueNanoUSD:'7380000001'},{...order,quantity:undefined},{...order,environment:'test'},
    {...order,payment:{...order.payment,orderID:randomUUID()}},...['http://checkout.stripe.com/x','https://checkout.stripe.com.evil.test/x',
      'https://name@checkout.stripe.com/x','https://checkout.stripe.com:8443/x','javascript:alert(1)'].map(checkoutURL=>({...order,payment:{...order.payment,checkoutURL}}))])
    assert.throws(()=>checkoutRedirect(value,attempt));
  // A later catalog revision does not change the original resumable order.
  const newCatalog=purchaseCatalog({...catalog,products:[{...product,totalMinor:600,quote:{...product.quote,totalMinor:600}}]});
  assert.equal(newCatalog.products[0].totalMinor,600);assert.equal(checkoutRedirect(order,attempt).url,order.payment.checkoutURL);
  assert.deepEqual(originalOrderQuote(status,attempt),{unitTotalMinor:500,unitAIValueNanoUSD:'3690000000'});
  assert.throws(()=>originalOrderQuote({...status,order:{...status.order,totalMinor:1001}},attempt));
});
test('redirect success claims do not prove fulfillment and unpaid closed checkout is distinct from a refund',()=>{
  assert.equal(purchaseResult(status,id).complete,false);
  assert.equal(purchaseResult(status,id).resumable,true);
  assert.equal(purchaseResult({...status,state:'pending'},id).resumable,true);
  for(const value of [{...status,state:'purchased'},{...status,state:'pending',fulfillmentRecorded:true},
    {...status,state:'pending',grantedNanoUSD:'1'},{...status,state:'pending',reversedNanoUSD:'1'},
    {...status,state:'pending',reversalOutstandingNanoUSD:'1'}])assert.notEqual(purchaseResult(value,id).resumable,true);
  assert.equal(purchaseResult({...status,state:'purchased'},id).complete,false);
  const paid={...status,state:'purchased',grantedNanoUSD:'7380000000',fulfillmentRecorded:true};
  assert.equal(purchaseResult(paid,id).title,'Minutes added');
  assert.equal(purchaseResult({...status,state:'voided'},id).title,'Checkout closed');
  assert.equal(purchaseResult({...paid,reversedNanoUSD:'7380000000'},id).title,'Purchase refunded');
  assert.ok(purchaseResult({...paid,reversedNanoUSD:'3690000000'},id).message.includes('partial refund'));
  assert.throws(()=>purchaseResult(status,randomUUID()));
});

test('return correlation is minimal, current and tied to the verified email',()=>{
  const reference={email,orderID:id,expiresAt:1900};
  assert.deepEqual(purchaseReturn(reference,email,1000),{...reference,checkOnReturn:false});
  assert.deepEqual(purchaseReturn({...reference,checkOnReturn:true},email,1000),{...reference,checkOnReturn:true});
  for(const value of [null,[],{...reference,email:'other@example.test'},{...reference,orderID:'bad'},
    {...reference,expiresAt:999},{...reference,expiresAt:1801001},{...reference,key:randomUUID()},
    {...reference,unitTotalMinor:500},{...reference,checkOnReturn:'true'}])assert.equal(purchaseReturn(value,email,1000),null);
});
