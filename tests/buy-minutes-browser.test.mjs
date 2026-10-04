import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile,mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

const files={
  '/':new URL('../dist/index.html',import.meta.url),
  ...Object.fromEntries(['download','support','privacy','terms','buy-minutes','payment-return'].map(name=>[`/${name}/`,new URL(`../dist/${name}/index.html`,import.meta.url)])),
  '/payment-return':new URL('../dist/payment-return/index.html',import.meta.url),
  ...Object.fromEntries(['site.css','site.js','buy-minutes.css','buy-minutes.js','buy-minutes-core.js','payment-return.js'].map(name=>[`/assets/${name}`,new URL(`../dist/assets/${name}`,import.meta.url)])),
};
const contents=new Map(await Promise.all(Object.entries(files).map(async([path,url])=>[path,await readFile(url)])));
let browser,server,origin;
before(async()=>{
  server=createServer((request,response)=>{
    const path=new URL(request.url,'http://localhost').pathname,body=contents.get(path);
    if(!body){response.writeHead(404);response.end();return;}
    response.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');
    response.setHeader('Referrer-Policy','no-referrer');
    response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src https://api.mural.chat; frame-ancestors 'none'; form-action 'none'; base-uri 'none'");
    response.end(body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL??'chrome',headless:true});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});
const SESSION='mural.web-purchase.v1',ATTEMPT='mural.web-purchase-attempt.v1',RETURN='mural.web-purchase-return.v1';
const token='a'.repeat(43),email='buyer@private.icloud.com';
const product={sku:'small',environment:'live',currency:'usd',totalMinor:500,entitlementKind:'ai_value',billingBasis:'actual-ai-usage',estimate:true,
  aiValueNanoUSD:'3690000000',estimatedMilliseconds:1920000,quote:{currency:'usd',currencyExponent:2,totalMinor:500}};
async function fixture(seed={}){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
  let state=seed.state??'pending',failOrder=false,held=false,releaseHeld,markHeld;const requests=[],orders=[],byKey=new Map();
  const heldReady=new Promise(resolve=>{markHeld=resolve;});
  if(seed.session||seed.legacy)await context.addInitScript(({seed,token,email,SESSION,ATTEMPT})=>{
    if(sessionStorage.getItem('__fixture-seeded'))return;
    sessionStorage.setItem('__fixture-seeded','1');
    sessionStorage.setItem(SESSION,JSON.stringify({token,email,expiresAt:Date.now()+1800000}));
    if(seed.legacy)sessionStorage.setItem(ATTEMPT,JSON.stringify(seed.legacy));
  },{seed,token,email,SESSION,ATTEMPT});
  await page.route('https://api.mural.chat/v1/web-purchases/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname.slice('/v1/web-purchases'.length);requests.push(req.url());
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':origin,
      'access-control-allow-methods':'GET,POST,DELETE','access-control-allow-headers':'content-type,authorization,idempotency-key'}});
    const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':origin},body:JSON.stringify(body)});
    if(path==='/challenges')return reply({challengeID:randomUUID(),expiresInSeconds:600,resendAfterSeconds:60},202);
    if(path==='/verify')return req.postDataJSON().code==='123456'?reply({token,email,expiresInSeconds:1800}):reply({error:{code:'invalid_purchase_code'}},401);
    if(path==='/session')return reply(req.method()==='DELETE'?{signedOut:true}:{email});
    if(path==='/products')return reply({available:true,maximumQuantity:10,billingBasis:'actual-ai-usage',products:[{...product,
      ...(seed.changedCatalog?{totalMinor:600,quote:{...product.quote,totalMinor:600}}:{})},
      {...product,sku:'medium',totalMinor:1000,aiValueNanoUSD:'7660000000',estimatedMilliseconds:3960000,quote:{...product.quote,totalMinor:1000}},
      {...product,sku:'large',totalMinor:1500,aiValueNanoUSD:'11610000000',estimatedMilliseconds:6000000,quote:{...product.quote,totalMinor:1500}}]});
    if(path==='/orders'){
      const key=req.headers()['idempotency-key'],body=req.postDataJSON();
      if(!byKey.has(key))byKey.set(key,{id:randomUUID(),...body});
      const order=byKey.get(key);orders.push({key,body,id:order.id});
      if(failOrder){failOrder=false;return route.abort('failed');}
      if(held){held=false;markHeld();await new Promise(resolve=>{releaseHeld=resolve;});}
      const amount=seed.changedCatalog?600:500,quantity=body.quantity;
      return reply({orderID:order.id,sku:body.sku,quantity,environment:'live',currency:'usd',totalMinor:amount*quantity,aiValueNanoUSD:(3690000000n*BigInt(quantity)).toString(),entitlementKind:'ai_value',
        payment:{orderID:order.id,checkoutURL:'https://checkout.stripe.com/c/pay/synthetic#fidkdWxOYHwnPyd1synthetic'}});
    }
    if(path.startsWith('/orders/')){
      const id=path.split('/').at(-1),order=[...byKey.values()].find(value=>value.id===id),quantity=order?.quantity??2;
      return reply({orderID:id,entitlementKind:'ai_value',state,grantedNanoUSD:state==='purchased'?(3690000000n*BigInt(quantity)).toString():'0',
        reversedNanoUSD:'0',reversalOutstandingNanoUSD:'0',fulfillmentRecorded:state==='purchased',order:{sku:'small',quantity,currency:'usd',totalMinor:500*quantity,aiValueNanoUSD:(3690000000n*BigInt(quantity)).toString()}});
    }
    return reply({error:{code:'not_found'}},404);
  });
  await page.route('https://checkout.stripe.com/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic checkout</title><p>No real payment</p>'}));
  return {page,context,requests,orders,heldReady,releaseHeld:()=>releaseHeld?.(),set state(value){state=value;},set failOrder(value){failOrder=value;},set holdOrder(value){held=value;},
    async login(){await page.goto(`${origin}/buy-minutes/`);await page.locator('#account-email').fill(email);await page.locator('#send-code').click();
      await page.locator('#email-code').fill('123456');await page.locator('#verify-code').click();await page.locator('#packs-step').waitFor({state:'visible'});await page.waitForFunction(()=>!document.getElementById('quantity').disabled);},
    async editable(){await page.locator('#packs-step').waitFor({state:'visible'});await page.waitForFunction(()=>!document.getElementById('checkout').disabled);},
    async close(){await context.close();}};
}
test('mobile verified checkout returns a nonlocking owned status and only confirmed payment adds minutes',async()=>{
  const f=await fixture();try{
    await f.login();await f.page.locator('#quantity').selectOption('2');assert.equal(await f.page.locator('#checkout-total').textContent(),'$10.00');
    await f.page.locator('#checkout').click();await f.page.waitForURL('https://checkout.stripe.com/**');assert.deepEqual(f.orders[0].body,{sku:'small',quantity:2});
    await f.page.goto(`${origin}/payment-return?status=success`);await f.page.waitForURL(`${origin}/buy-minutes/`);await f.editable();
    await f.page.locator('#result-title').filter({hasText:'Payment not confirmed yet'}).waitFor();
    assert.equal(await f.page.locator('#quantity').isEnabled(),true);assert.equal(await f.page.locator('#checkout-total').textContent(),'$5.00');
    f.state='purchased';await f.page.locator('#check-payment').click();await f.page.locator('#result-title').filter({hasText:'Minutes added'}).waitFor();
    assert.ok(f.requests.every(url=>!url.includes(token)&&!url.includes(email)));
    assert.deepEqual(await f.page.evaluate(({ATTEMPT,RETURN})=>[sessionStorage.getItem(ATTEMPT),sessionStorage.getItem(RETURN)],{ATTEMPT,RETURN}),[null,null]);
    assert.equal(f.orders.length,1);await f.page.reload();await f.editable();assert.equal(await f.page.locator('#result-step').isVisible(),false);
  }finally{await f.close();}
});
test('incorrect code remains actionable and creates no checkout',async()=>{
  const f=await fixture();try{
    await f.page.goto(`${origin}/buy-minutes/`);await f.page.locator('#account-email').fill(email);await f.page.locator('#send-code').click();
    await f.page.locator('#email-code').fill('000000');await f.page.locator('#verify-code').click();
    await f.page.locator('#purchase-status').filter({hasText:'incorrect'}).waitFor();assert.equal(f.orders.length,0);assert.equal(await f.page.locator('#verify-code').isEnabled(),true);
  }finally{await f.close();}
});
test('cancel immediately restores editable quantity and deliberate selection creates a new intent',async()=>{
  const f=await fixture();try{
    await f.login();await f.page.locator('#quantity').selectOption('2');await f.page.locator('#checkout').click();await f.page.waitForURL('https://checkout.stripe.com/**');
    await f.page.goto(`${origin}/payment-return?status=cancelled`);await f.page.waitForURL(`${origin}/buy-minutes/`);await f.editable();
    assert.equal(await f.page.locator('#result-step').isVisible(),false);await f.page.locator('#quantity').selectOption('3');
    assert.equal(await f.page.locator('#checkout-total').textContent(),'$15.00');await f.page.locator('#checkout').click();await f.page.waitForURL('https://checkout.stripe.com/**');
    assert.equal(f.orders.length,2);assert.notEqual(f.orders[0].key,f.orders[1].key);assert.notEqual(f.orders[0].id,f.orders[1].id);
    assert.deepEqual(f.orders[1].body,{sku:'small',quantity:3});assert.equal(f.requests.some(url=>/\/orders\//.test(url)),false);
  }finally{await f.close();}
});
test('uncertain response retries the in-memory key without persisting a draft; reload stays editable',async()=>{
  const f=await fixture();try{
    await f.login();await f.page.locator('#quantity').selectOption('2');f.failOrder=true;await f.page.locator('#checkout').click();
    await f.page.locator('#purchase-status').filter({hasText:'try again'}).waitFor();assert.equal(await f.page.evaluate(key=>sessionStorage.getItem(key),ATTEMPT),null);
    await f.page.locator('#checkout').click();await f.page.waitForURL('https://checkout.stripe.com/**');
    assert.equal(f.orders.length,2);assert.equal(f.orders[0].key,f.orders[1].key);assert.equal(f.orders[0].id,f.orders[1].id);
    await f.page.goto(`${origin}/buy-minutes/`);await f.editable();assert.equal(await f.page.locator('#quantity').inputValue(),'1');
    assert.equal(await f.page.locator('#result-step').isVisible(),false);assert.equal(await f.page.evaluate(key=>sessionStorage.getItem(key),RETURN),null);
  }finally{await f.close();}
});
test('legacy pending browser records cannot restore a locked form or an old price',async()=>{
  const legacy={email,key:randomUUID(),sku:'small',quantity:2,unitTotalMinor:500,unitAIValueNanoUSD:'3690000000',orderID:randomUUID()};
  const f=await fixture({legacy,changedCatalog:true});try{
    await f.page.goto(`${origin}/buy-minutes/`);await f.editable();assert.equal(await f.page.locator('#checkout-total').textContent(),'$6.00');
    assert.equal(await f.page.evaluate(key=>sessionStorage.getItem(key),ATTEMPT),null);assert.equal(f.orders.length,0);
    await f.page.evaluate(({legacy,ATTEMPT})=>sessionStorage.setItem(ATTEMPT,JSON.stringify(legacy)),{legacy,ATTEMPT});
    await f.page.goto(`${origin}/payment-return?status=cancelled`);await f.page.waitForURL(`${origin}/buy-minutes/`);await f.editable();
    assert.equal(await f.page.locator('#result-step').isVisible(),false);assert.equal(f.orders.length,0);
    await f.page.evaluate(({legacy,ATTEMPT})=>sessionStorage.setItem(ATTEMPT,JSON.stringify(legacy)),{legacy,ATTEMPT});
    await f.page.goto(`${origin}/payment-return?status=success`);await f.page.waitForURL(`${origin}/buy-minutes/`);await f.editable();
    await f.page.locator('#result-title').filter({hasText:'Payment not confirmed yet'}).waitFor();
    assert.equal(await f.page.locator('#checkout-total').textContent(),'$6.00');assert.equal(f.orders.length,0);
  }finally{await f.close();}
});
test('restored page resets busy controls and ignores an abandoned checkout response',async()=>{
  const f=await fixture();try{
    await f.login();f.holdOrder=true;await f.page.locator('#checkout').click();await f.heldReady;
    assert.equal(await f.page.locator('#checkout').isDisabled(),true);
    await f.page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await f.editable();
    const response=f.page.waitForResponse(response=>response.url().endsWith('/orders'));f.releaseHeld();await response;
    await f.page.waitForFunction(()=>document.getElementById('purchase-status').textContent==='');
    assert.equal(f.page.url(),`${origin}/buy-minutes/`);assert.equal(await f.page.locator('#quantity').isEnabled(),true);
    assert.equal(await f.page.evaluate(key=>sessionStorage.getItem(key),RETURN),null);assert.equal(f.orders.length,1);
  }finally{f.releaseHeld();await f.close();}
});
test('native quantity keyboard input updates totals with a branded mobile touch target',async()=>{
  const f=await fixture();try{
    await f.login();await f.page.locator('#quantity').focus();await f.page.keyboard.press('2');await f.page.keyboard.press('Tab');
    assert.equal(await f.page.locator('#quantity').inputValue(),'2');assert.equal(await f.page.locator('#checkout-total').textContent(),'$10.00');
    await f.page.locator('#quantity').selectOption('10');assert.equal(await f.page.locator('#quantity').inputValue(),'10');assert.equal(await f.page.locator('#checkout-total').textContent(),'$50.00');
    const bounds=await f.page.locator('#quantity').boundingBox();assert.ok(bounds.height>=48&&bounds.width>=100);
    assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    if(process.env.KEEP_SCREENSHOT==='true'){
      await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
      await f.page.screenshot({path:fileURLToPath(new URL('../test-results/mobile-pack-selection.png',import.meta.url)),fullPage:true});
    }
  }finally{await f.close();}
});
test('generic native return stays available without web checkout context',async()=>{
  const f=await fixture();try{
    await f.page.goto(`${origin}/payment-return?status=success`);assert.equal(new URL(f.page.url()).pathname,'/payment-return');
    assert.equal(f.orders.length,0);assert.equal(f.requests.some(url=>/\/orders\//.test(url)),false);
  }finally{await f.close();}
});
