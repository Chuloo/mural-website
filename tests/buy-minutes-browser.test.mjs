import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile,mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

const files={
  '/buy-minutes/':new URL('../dist/buy-minutes/index.html',import.meta.url),
  '/payment-return':new URL('../dist/payment-return/index.html',import.meta.url),
  '/payment-return/':new URL('../dist/payment-return/index.html',import.meta.url),
  '/assets/site.css':new URL('../dist/assets/site.css',import.meta.url),
  '/assets/buy-minutes.css':new URL('../dist/assets/buy-minutes.css',import.meta.url),
  '/assets/buy-minutes.js':new URL('../dist/assets/buy-minutes.js',import.meta.url),
  '/assets/buy-minutes-core.js':new URL('../dist/assets/buy-minutes-core.js',import.meta.url),
  '/assets/payment-return.js':new URL('../dist/assets/payment-return.js',import.meta.url),
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
const token='a'.repeat(43),email='buyer@private.icloud.com';
const product={sku:'small',environment:'live',currency:'usd',totalMinor:500,entitlementKind:'ai_value',billingBasis:'actual-ai-usage',estimate:true,
  aiValueNanoUSD:'3690000000',estimatedMilliseconds:1920000,quote:{currency:'usd',currencyExponent:2,totalMinor:500}};
async function fixture(seed){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
  const id=randomUUID(),key=seed?.key??randomUUID();let state='created',catalogCalls=0,failOrder=false;const requests=[],orders=[];
  if(seed)await context.addInitScript(({seed,token,email})=>{
    if(!sessionStorage.getItem('mural.web-purchase.v1'))sessionStorage.setItem('mural.web-purchase.v1',JSON.stringify({token,email,expiresAt:Date.now()+1800000}));
    if(!sessionStorage.getItem('mural.web-purchase-attempt.v1'))sessionStorage.setItem('mural.web-purchase-attempt.v1',JSON.stringify(seed));
  },{seed:{email,key,sku:'small',quantity:2,unitTotalMinor:500,unitAIValueNanoUSD:'3690000000',...seed},token,email});
  await page.route('https://api.mural.chat/v1/web-purchases/**',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname.slice('/v1/web-purchases'.length);requests.push(req.url());
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':origin,
      'access-control-allow-methods':'GET,POST,DELETE','access-control-allow-headers':'content-type,authorization,idempotency-key'}});
    const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':origin},body:JSON.stringify(body)});
    if(path==='/challenges')return reply({challengeID:randomUUID(),expiresInSeconds:600,resendAfterSeconds:60},202);
    if(path==='/verify')return req.postDataJSON().code==='123456'?reply({token,email,expiresInSeconds:1800}):reply({error:{code:'invalid_purchase_code'}},401);
    if(path==='/session')return reply(req.method()==='DELETE'?{signedOut:true}:{email});
    if(path==='/products'){catalogCalls++;return reply({available:true,maximumQuantity:10,billingBasis:'actual-ai-usage',products:[{...product,
      ...(seed?.changedCatalog?{totalMinor:600,quote:{...product.quote,totalMinor:600}}:{})},
      {...product,sku:'medium',totalMinor:1000,aiValueNanoUSD:'7660000000',estimatedMilliseconds:3960000,quote:{...product.quote,totalMinor:1000}},
      {...product,sku:'large',totalMinor:1500,aiValueNanoUSD:'11610000000',estimatedMilliseconds:6000000,quote:{...product.quote,totalMinor:1500}}]});}
    if(path==='/orders'){
      orders.push({key:req.headers()['idempotency-key'],body:req.postDataJSON()});
      if(failOrder){failOrder=false;return route.abort('failed');}
      const quantity=req.postDataJSON().quantity;
      return reply({orderID:id,sku:'small',quantity,environment:'live',currency:'usd',totalMinor:500*quantity,aiValueNanoUSD:(3690000000n*BigInt(quantity)).toString(),entitlementKind:'ai_value',
        payment:{orderID:id,checkoutURL:'https://checkout.stripe.com/c/pay/synthetic'}});
    }
    if(path.startsWith('/orders/by-key/'))return reply({orderID:id});
    if(path.startsWith('/orders/'))return reply({orderID:id,entitlementKind:'ai_value',state,grantedNanoUSD:state==='purchased'?'7380000000':'0',
      reversedNanoUSD:'0',reversalOutstandingNanoUSD:'0',fulfillmentRecorded:state==='purchased',order:{sku:'small',quantity:2,currency:'usd',totalMinor:1000,aiValueNanoUSD:'7380000000'}});
    return reply({error:{code:'not_found'}},404);
  });
  await page.route('https://checkout.stripe.com/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic checkout</title><p>No real payment</p>'}));
  return {page,context,id,key,requests,orders,get catalogCalls(){return catalogCalls;},set state(value){state=value;},set failOrder(value){failOrder=value;},
    async login(){await page.goto(`${origin}/buy-minutes/`);await page.locator('#account-email').fill(email);await page.locator('#send-code').click();
      await page.locator('#email-code').fill('123456');await page.locator('#verify-code').click();await page.locator('#packs-step').waitFor({state:'visible'});},
    async close(){await context.close();}};
}
test('mobile verification, quantity checkout, reload and return show only provider-confirmed success',async()=>{
  const f=await fixture();try{
    await f.login();assert.equal(await f.page.locator('#checkout-total').textContent(),'$5.00');
    if(process.env.KEEP_SCREENSHOT==='true'){
      await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
      await f.page.screenshot({path:fileURLToPath(new URL('../test-results/mobile-pack-selection.png',import.meta.url)),fullPage:true});
    }
    await f.page.locator('#quantity').selectOption('2');assert.equal(await f.page.locator('#checkout-total').textContent(),'$10.00');
    await f.page.locator('#checkout').click();await f.page.waitForURL('https://checkout.stripe.com/**');assert.deepEqual(f.orders[0].body,{sku:'small',quantity:2});
    await f.page.goto(`${origin}/payment-return?status=success`);await f.page.waitForURL(`${origin}/buy-minutes/`);
    await f.page.locator('#resume-checkout').waitFor({state:'visible'});assert.equal(await f.page.locator('#result-title').textContent(),'Payment not confirmed yet');
    f.state='purchased';await f.page.locator('#check-payment').click();await f.page.locator('#buy-again').waitFor({state:'visible'});
    assert.equal(await f.page.locator('#result-title').textContent(),'Minutes added');
    assert.ok(f.requests.every(url=>!url.includes(token)&&!url.includes(email)));
    assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }finally{await f.close();}
});
test('incorrect code stays actionable and does not open checkout',async()=>{
  const f=await fixture();try{
    await f.page.goto(`${origin}/buy-minutes/`);await f.page.locator('#account-email').fill(email);await f.page.locator('#send-code').click();
    await f.page.locator('#email-code').fill('000000');await f.page.locator('#verify-code').click();
    await f.page.locator('#purchase-status').filter({hasText:'incorrect'}).waitFor();assert.equal(f.orders.length,0);
    assert.equal(await f.page.locator('#verify-code').isDisabled(),false);
  }finally{await f.close();}
});
test('resume uses original quote and same idempotency key after current catalog changes',async()=>{
  const f=await fixture({changedCatalog:true});try{
    await f.page.goto(`${origin}/buy-minutes/`);await f.page.locator('#resume-checkout').waitFor({state:'visible'});
    assert.ok((await f.page.locator('#result-message').textContent()).includes('$10.00'));
    await f.page.locator('#resume-checkout').click();await f.page.waitForURL('https://checkout.stripe.com/**');
    assert.equal(f.orders[0].key,f.key);assert.equal(f.catalogCalls,0);assert.deepEqual(f.orders[0].body,{sku:'small',quantity:2});
  }finally{await f.close();}
});
test('interrupted create recovers the existing order after reload without another new attempt',async()=>{
  const f=await fixture();try{
    await f.login();await f.page.locator('#quantity').selectOption('2');f.failOrder=true;await f.page.locator('#checkout').click();
    await f.page.locator('#purchase-status').filter({hasText:'try again'}).waitFor();const key=f.orders[0].key;
    await f.page.reload();await f.page.locator('#resume-checkout').waitFor({state:'visible'});
    await f.page.locator('#resume-checkout').click();await f.page.waitForURL('https://checkout.stripe.com/**');
    assert.equal(f.orders.length,2);assert.equal(f.orders[1].key,key);
  }finally{await f.close();}
});
test('unpaid expired checkout is not called refunded and generic native return never redirects',async()=>{
  const f=await fixture({});try{
    f.state='voided';await f.page.goto(`${origin}/buy-minutes/`);await f.page.locator('#buy-again').waitFor({state:'visible'});
    assert.equal(await f.page.locator('#result-title').textContent(),'Checkout closed');assert.ok(!(await f.page.locator('#result-message').textContent()).includes('refund'));
  }finally{await f.close();}
  const native=await browser.newPage();try{
    await native.goto(`${origin}/payment-return?status=success`);await native.waitForLoadState('networkidle');
    assert.ok(native.url().includes('/payment-return'));assert.ok((await native.locator('main').textContent()).includes('does not confirm a payment'));
  }finally{await native.close();}
});
