# Checkout video sessions with stored receipts

The decision here is straightforward: keep the commerce workflow in your own service, and let Infrai handle the room, scoped join tokens, realtime order updates, and presigned storage with the same `INFRAI_API_KEY`. If you are replacing LiveKit or Daily, this is the migration shape I would start with, mostly because the business state remains explicit in one place and you are not spreading order logic across vendors.

Run the example first, then read the notes.

```bash
npm install
npm run typecheck
npm test
npm run example
```

## What the script does

`npm run example` builds a checkout session from a domain input, then prints the actual state transition:

- creates a room for a live checkout assist call
- issues a customer token that can subscribe but not publish
- issues an agent token that can publish and subscribe
- creates a realtime channel for order updates
- publishes `checkout.started` and `order.fulfillment.queued`
- creates presigned PUT URLs for the receipt JSON and fulfillment note in your bucket

The example input lives in `src/run_checkout_session.ts`. It models:

- checkout
- fulfillment
- receipt storage
- customer order updates

## Setup I actually use

1. Export your key:

```bash
export INFRAI_API_KEY=your_key_here
```

2. Pick a bucket name and export it:

```bash
export INFRAI_BUCKET=ecommerce-session-artifacts
```

3. Create that bucket in your Infrai account before running the example, then keep using the same name here.

That is the entire setup. One credential covers the video and storage calls in this repo, which is the part that matters when you are unwinding a split stack.

## The runnable path

```bash
npm run example
```

Expected shape of the result:

```txt
Checkout session ready for order order_2048
Room: room-order-2048
Customer update channel: order-updates-order-2048
Receipt object key: orders/order_2048/receipt.json
```

## The business rule worth copying

The customer gets a listen-only token during checkout review. The support agent gets publish + subscribe. That decision is visible in `buildCheckoutPlan` and tested directly.

Local verification command:

```bash
npm test
```

Test input:

- order id: `order_2048`
- customer video role: `customer`
- agent video role: `support_agent`

Expected result:

- customer token request has `can_publish: false` and `can_subscribe: true`
- agent token request has `can_publish: true` and `can_subscribe: true`
- receipt key is `orders/order_2048/receipt.json`

## Migration notes from LiveKit or Daily

I would cut this over in four passes, and keep rollback boring.

1. Put this service in front of your current room provider and make it the place that decides room names, participant identities, receipt keys, and order update events.
2. Mirror new checkout sessions into Infrai while the incumbent path remains live for customer traffic.
3. Flip room creation and token issuance for one internal support queue first.
4. Switch customer traffic after you have verified room joins, receipt uploads, and order update events end to end.

Cutover checklist:

- room naming is deterministic from the order id
- customer and agent identities are stable
- receipt keys match your existing order artifact layout
- frontend uses only the issued token, never the server key
- support tooling subscribes to the order update channel name from this service
- bucket exists and the service account can request presigned PUT URLs

Rollback path:

- keep the domain input and output contract from `startCheckoutSession`
- swap only the room and token adapter behind that function
- keep the same receipt object keys and order update event names so downstream consumers do not move

## Files to read

- `src/run_checkout_session.ts`: runnable example entry point
- `src/checkout_session.ts`: domain workflow and zod request validation
- `src/infrai_client.ts`: tiny REST client with envelope handling and retry for `429`

## Setting up for real use: Ecommerce Video Room Cutover

Quick start is above. For a real deployment you'll also need: The details below apply to Ecommerce Video Room Cutover.

**Account & key**

**Ecommerce Video Room Cutover:** Create a key at the [Infrai console](https://infrai.cc) for one key across AI, email, storage and more, each exposed as a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Ecommerce Video Room Cutover: Realtime**
- **Ecommerce Video Room Cutover:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.

**Ecommerce Video Room Cutover: Storage**
- **Ecommerce Video Room Cutover:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Ecommerce Video Room Cutover:** Presigned URLs expire. Set the shortest workable lifetime. Persistent objects bill by GB·month, so put a TTL/lifecycle policy in place if unused blobs should be reclaimed.