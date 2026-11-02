import { startCheckoutSession } from './checkout_session';
import { createInfraiFromEnv } from './infrai_client';

async function main(): Promise<void> {
  const bucket = process.env.INFRAI_BUCKET;
  if (!bucket) {
    throw new Error('INFRAI_BUCKET is required');
  }

  const infrai = createInfraiFromEnv();
  const result = await startCheckoutSession(infrai, {
    order_id: 'order_2048',
    customer_id: 'cust_77',
    customer_name: 'Ari Buyer',
    support_agent_id: 'agent_12',
    support_agent_name: 'Mina Support',
    bucket,
    region: 'us-east',
    items: [
      { sku: 'sku-camera-1', title: 'Mirrorless Camera', quantity: 1, unit_price_cents: 89900 },
      { sku: 'sku-sdcard-2', title: '128GB SD Card', quantity: 2, unit_price_cents: 2400 }
    ]
  });

  console.log(`Checkout session ready for order ${result.orderId}`);
  console.log(`Room: ${result.roomName}`);
  console.log(`Customer update channel: ${result.updatesChannel}`);
  console.log(`Receipt object key: ${result.receiptKey}`);
  console.log(`Fulfillment object key: ${result.fulfillmentKey}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
