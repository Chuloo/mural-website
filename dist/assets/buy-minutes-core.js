export const PURCHASE_API = 'https://api.mural.chat/v1/web-purchases';
export const SESSION_KEY = 'mural.web-purchase.v1';
export const ATTEMPT_KEY = 'mural.web-purchase-attempt.v1';
export const RETURN_KEY = 'mural.web-purchase-return.v1';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const money = value => Number.isSafeInteger(value) && value > 0 && value <= 100_000_000;
const nano = value => typeof value === 'string' && /^(0|[1-9][0-9]{0,18})$/.test(value);

export function purchaseSession(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || !/^[A-Za-z0-9_-]{43}$/.test(value.token) ||
      typeof value.email !== 'string' || value.email.length > 254 || value.email.split('@').length !== 2 || !/^[\x21-\x7e]+@[^@]+$/.test(value.email) ||
      !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= now || value.expiresAt > now + 1_800_000) return null;
  return { token:value.token,email:value.email,expiresAt:value.expiresAt };
}
export function purchaseAttempt(value, email) {
  if (!value || typeof value !== 'object' || value.email !== email || !uuid.test(value.key) ||
      typeof value.sku !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.sku) ||
      !Number.isInteger(value.quantity) || value.quantity < 1 || value.quantity > 10 ||
      !money(value.unitTotalMinor) || !nano(value.unitAIValueNanoUSD) || value.unitAIValueNanoUSD === '0' ||
      (value.orderID !== undefined && (typeof value.orderID !== 'string' || !uuid.test(value.orderID)))) return null;
  return { email:value.email,key:value.key,sku:value.sku,quantity:value.quantity,unitTotalMinor:value.unitTotalMinor,
    unitAIValueNanoUSD:value.unitAIValueNanoUSD,...(value.orderID?{orderID:value.orderID}:{}) };
}
export function purchaseReturn(value, email, now = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.email !== email || !uuid.test(value.orderID) ||
      !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= now || value.expiresAt > now + 1_800_000 ||
      (value.checkOnReturn !== undefined && typeof value.checkOnReturn !== 'boolean') ||
      Object.keys(value).some(key => !['email','orderID','expiresAt','checkOnReturn'].includes(key))) return null;
  return {email:value.email,orderID:value.orderID,expiresAt:value.expiresAt,checkOnReturn:value.checkOnReturn === true};
}
export function originalOrderQuote(value,attempt) {
  const order=value?.order;
  if (value?.orderID!==attempt.orderID || !order || order.sku!==attempt.sku || order.quantity!==attempt.quantity || order.currency!=='usd' ||
      !money(order.totalMinor) || order.totalMinor % attempt.quantity !== 0 || !nano(order.aiValueNanoUSD) || order.aiValueNanoUSD==='0' ||
      BigInt(order.aiValueNanoUSD) % BigInt(attempt.quantity) !== 0n) throw new Error('invalid_purchase_status');
  return {unitTotalMinor:order.totalMinor/attempt.quantity,unitAIValueNanoUSD:(BigInt(order.aiValueNanoUSD)/BigInt(attempt.quantity)).toString()};
}
export function purchaseCatalog(value) {
  if (!value || value.available !== true || value.billingBasis !== 'actual-ai-usage' ||
      !Number.isInteger(value.maximumQuantity) || value.maximumQuantity < 1 || value.maximumQuantity > 10 ||
      !Array.isArray(value.products) || value.products.length < 1 || value.products.length > 3) throw new Error('invalid_catalog');
  const seen = new Set();
  const products = value.products.map(product => {
    if (!product || typeof product.sku !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(product.sku) || seen.has(product.sku) ||
        product.environment !== 'live' || product.currency !== 'usd' || product.entitlementKind !== 'ai_value' ||
        product.billingBasis !== 'actual-ai-usage' || product.estimate !== true || !money(product.totalMinor) ||
        !Number.isSafeInteger(product.estimatedMilliseconds) || product.estimatedMilliseconds <= 0 ||
        product.estimatedMilliseconds > 31_536_000_000 || !nano(product.aiValueNanoUSD) || product.aiValueNanoUSD === '0' ||
        product.quote?.currency !== 'usd' || product.quote?.currencyExponent !== 2 || product.quote?.totalMinor !== product.totalMinor)
      throw new Error('invalid_catalog');
    seen.add(product.sku);
    return { sku:product.sku,totalMinor:product.totalMinor,estimatedMilliseconds:product.estimatedMilliseconds,aiValueNanoUSD:product.aiValueNanoUSD };
  });
  return { products:products.sort((a,b) => a.totalMinor-b.totalMinor),maximumQuantity:value.maximumQuantity };
}
export function checkoutRedirect(value, attempt) {
  if (!value || !uuid.test(value.orderID) || (attempt.orderID !== undefined && value.orderID !== attempt.orderID) || value.environment !== 'live' || value.currency !== 'usd' ||
      value.sku !== attempt.sku || (value.quantity ?? 1) !== attempt.quantity ||
      value.totalMinor !== attempt.unitTotalMinor * attempt.quantity || value.entitlementKind !== 'ai_value' ||
      value.aiValueNanoUSD !== (BigInt(attempt.unitAIValueNanoUSD)*BigInt(attempt.quantity)).toString() ||
      value.payment?.orderID !== value.orderID || typeof value.payment.checkoutURL !== 'string') throw new Error('invalid_checkout');
  const url = new URL(value.payment.checkoutURL);
  if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com' || url.port || url.username || url.password)
    throw new Error('invalid_checkout');
  return { orderID:value.orderID,url:url.href };
}
export function purchaseResult(value, expectedID) {
  if (!value || value.orderID !== expectedID || value.entitlementKind !== 'ai_value' ||
      !['created','pending','purchased','voided'].includes(value.state) ||
      !nano(value.grantedNanoUSD) || !nano(value.reversedNanoUSD) || !nano(value.reversalOutstandingNanoUSD) ||
      typeof value.fulfillmentRecorded !== 'boolean') throw new Error('invalid_purchase_status');
  if (BigInt(value.grantedNanoUSD) > 0n && BigInt(value.reversedNanoUSD) >= BigInt(value.grantedNanoUSD))
    return { title:'Purchase refunded',message:'Your Mural balance reflects the refund. Open Account in Mural to check it.',complete:true };
  if (value.state === 'voided')
    return { title:'Checkout closed',message:'No minutes were added from this checkout. You can choose a new pack when you’re ready.',complete:true };
  if (value.state === 'purchased' && value.fulfillmentRecorded && BigInt(value.grantedNanoUSD) > 0n)
    return { title:'Minutes added',message:BigInt(value.reversedNanoUSD)>0n?
      'Your purchase and partial refund are recorded. Open Account in Mural to check your balance.':
      'Your purchase is confirmed. Open Account in Mural on any device to see your updated balance.',complete:true };
  return { title:'Payment not confirmed yet',message:'We haven’t received a confirmed payment. Check again in a moment before paying again.',complete:false,
    resumable:['created','pending'].includes(value.state) && !value.fulfillmentRecorded && value.grantedNanoUSD === '0' &&
      value.reversedNanoUSD === '0' && value.reversalOutstandingNanoUSD === '0' };
}
