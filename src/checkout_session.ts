import { z } from 'zod';
import { InfraiClient } from './infrai_client';

const lineItemSchema = z.object({
  sku: z.string().min(1),
  title: z.string().min(1),
  quantity: z.number().int().positive(),
  unit_price_cents: z.number().int().nonnegative()
});

const checkoutRequestSchema = z.object({
  order_id: z.string().min(1),
  customer_id: z.string().min(1),
  customer_name: z.string().min(1),
  support_agent_id: z.string().min(1),
  support_agent_name: z.string().min(1),
  bucket: z.string().min(1),
  region: z.string().min(1).optional(),
  items: z.array(lineItemSchema).min(1)
});

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

export type CheckoutPlan = {
  roomName: string;
  updatesChannel: string;
  receiptKey: string;
  fulfillmentKey: string;
  customerTokenRequest: {
    room: string;
    identity: string;
    display_name: string;
    ttl_s: number;
    can_publish: boolean;
    can_subscribe: boolean;
  };
  agentTokenRequest: {
    room: string;
    identity: string;
    display_name: string;
    ttl_s: number;
    can_publish: boolean;
    can_subscribe: boolean;
  };
};

export function buildCheckoutPlan(input: CheckoutRequest): CheckoutPlan {
  const roomName = `room-${input.order_id.replace(/_/g, '-')}`;
  const updatesChannel = `order-updates-${input.order_id.replace(/_/g, '-')}`;
  const receiptKey = `orders/${input.order_id}/receipt.json`;
  const fulfillmentKey = `orders/${input.order_id}/fulfillment.txt`;

  return {
    roomName,
    updatesChannel,
    receiptKey,
    fulfillmentKey,
    customerTokenRequest: {
      room: roomName,
      identity: `customer-${input.customer_id}`,
      display_name: input.customer_name,
      ttl_s: 1800,
      can_publish: false,
      can_subscribe: true
    },
    agentTokenRequest: {
      room: roomName,
      identity: `agent-${input.support_agent_id}`,
      display_name: input.support_agent_name,
      ttl_s: 1800,
      can_publish: true,
      can_subscribe: true
    }
  };
}

export type CheckoutSessionResult = {
  orderId: string;
  roomName: string;
  updatesChannel: string;
  customerRtcToken: string;
  agentRtcToken: string;
  receiptUploadUrl: string;
  fulfillmentUploadUrl: string;
  receiptKey: string;
  fulfillmentKey: string;
};

export async function startCheckoutSession(infrai: InfraiClient, rawInput: unknown): Promise<CheckoutSessionResult> {
  const input = checkoutRequestSchema.parse(rawInput);
  const plan = buildCheckoutPlan(input);

  await infrai.rtc.room.create({
    name: plan.roomName,
    max_participants: 4,
    empty_timeout_s: 600,
    region: input.region
  });

  await infrai.realtime.channel.create({
    channel: plan.updatesChannel,
    type: 'private'
  });

  const customerToken = await infrai.rtc.token.issue(plan.customerTokenRequest);
  const agentToken = await infrai.rtc.token.issue(plan.agentTokenRequest);

  const receiptUpload = await infrai.storage.object.presign(input.bucket, plan.receiptKey, {
    op: 'put',
    expires_seconds: 900,
    content_type: 'application/json',
    max_bytes: 200000,
    idempotency_key: `receipt-${input.order_id}`
  });

  const fulfillmentUpload = await infrai.storage.object.presign(input.bucket, plan.fulfillmentKey, {
    op: 'put',
    expires_seconds: 900,
    content_type: 'text/plain',
    max_bytes: 10000,
    idempotency_key: `fulfillment-${input.order_id}`
  });

  const orderTotalCents = input.items.reduce((sum, item) => sum + item.quantity * item.unit_price_cents, 0);

  await infrai.realtime.publish({
    channel: plan.updatesChannel,
    event: 'checkout.started',
    data: {
      order_id: input.order_id,
      room: plan.roomName,
      total_cents: orderTotalCents
    }
  });

  await infrai.realtime.publish({
    channel: plan.updatesChannel,
    event: 'order.fulfillment.queued',
    data: {
      order_id: input.order_id,
      receipt_key: plan.receiptKey,
      fulfillment_key: plan.fulfillmentKey
    }
  });

  return {
    orderId: input.order_id,
    roomName: plan.roomName,
    updatesChannel: plan.updatesChannel,
    customerRtcToken: customerToken.token ?? '',
    agentRtcToken: agentToken.token ?? '',
    receiptUploadUrl: receiptUpload.url ?? '',
    fulfillmentUploadUrl: fulfillmentUpload.url ?? '',
    receiptKey: plan.receiptKey,
    fulfillmentKey: plan.fulfillmentKey
  };
}
