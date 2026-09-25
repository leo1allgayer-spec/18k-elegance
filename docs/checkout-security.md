# Checkout security — 2026-09-25

Existing customer records cannot be claimed by registration, including guest and admin records. A customer uses the existing login or the single-use recovery link sent to the phone already stored on the account. This does not add email verification. Checkout no longer changes an existing account's name or phone. Admin accounts are excluded from public WhatsApp recovery.

Authentication limits use atomic D1 counters: 40 requests per IP and 12 per identity per 15-minute bucket, shared by JSON and form login endpoints. Checkout allows 15 per IP and 6 per identity. Origin checks reject cross-site browser mutations. Request bodies for these flows are bounded. Counters contain hashes, not raw emails/phones/IPs. The scheduled maintenance deletes expired counters.

New checkouts reserve available inventory in the same D1 transaction as line items and payment creation, before calling Mercado Pago. A database trigger rejects insufficient inventory; repeated cart variants are aggregated. `product_variants.stock` remains the available-to-sell count, so reservations propagate through the existing Bling sync.

`finalized_orders` and its trigger atomically consume the reservation, mark the order paid and increment loyalty/coupon counters once. Existing fulfilled orders are seeded before the trigger is created. Historical pending orders acquire inventory on approval. If unavailable, or if an approval arrives after release, the order is `payment_review`: payment was received but fulfillment is blocked and staff must resolve availability/refund with the customer. No automatic refunds are issued.

Mercado Pago preferences expire after 30 minutes. The scheduler checks one expired checkout each minute, with a one-hour grace period and ten-minute retry spacing. It verifies the provider preference expiration and the complete payment search result before releasing stock. Pending/unknown provider statuses keep inventory reserved. A timeout during preference creation also keeps the reservation; operations must inspect these ambiguous cases, because releasing automatically could oversell a real payment. Merely marking an order cancelled in the admin does not release an active payment reservation.

The Bling sync is periodic, not a cross-system transaction. Simultaneous independent sales in Bling and the site still require conflict review; a single checkout reservation guarantees only site-side contention. Adjusted stock in either panel means available units, excluding existing reservations.

Tests: `npm run test:security`, `npm run test:stock`, `npm run typecheck`. Provider calls in regression tests are mocked; no real charge is made. D1 recovery bookmark before migration 0018: `00000367-00000c5a-000050f1-12df0b66d6b961e9e3028f789451a4ef`.
