import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCheckoutPlan } from './checkout_session';

test('buildCheckoutPlan gives customer listen-only access and stable artifact keys', () => {
  const plan = buildCheckoutPlan({
    order_id: 'order_2048',
    customer_id: 'cust_77',
    customer_name: 'Ari Buyer',
    support_agent_id: 'agent_12',
    support_agent_name: 'Mina Support',
    bucket: 'ecommerce-session-artifacts',
    region: 'us-east',
    items: [
      { sku: 'sku-camera-1', title: 'Mirrorless Camera', quantity: 1, unit_price_cents: 89900 }
    ]
  });

  assert.equal(plan.roomName, 'room-order-2048');
  assert.equal(plan.updatesChannel, 'order-updates-order-2048');
  assert.equal(plan.customerTokenRequest.can_publish, false);
  assert.equal(plan.customerTokenRequest.can_subscribe, true);
  assert.equal(plan.agentTokenRequest.can_publish, true);
  assert.equal(plan.agentTokenRequest.can_subscribe, true);
  assert.equal(plan.receiptKey, 'orders/order_2048/receipt.json');
});
