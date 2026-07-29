# FINDINGS — Part 2

## 1. Where the money lives

### Before the change

- **Base pay per post:** The brand configuration says `$10` in
  `brand_campaigns.base_pay_per_video_cents = 1000`, but the creation trigger
  read `managed_creators.base_pay` instead. Maria's legacy value was `100`, so
  it froze a `$1` `managed_creator_posts.base_pay_cents` snapshot.
- **Bonus milestones:** The campaign uses canonical
  `{ min_views, amount_cents }`, while the managed-creator copy uses legacy
  `{ views, bonus_cents }`. The trigger only understood the canonical keys, so
  its lookup never matched and wrote `bonus_cents = 0`.
- **Amount owed:** The admin payment row stored a derived, mutable
  `total_owed_cents`; it was calculated from stale creator-level copies rather
  than campaign terms.
- **Amount actually paid:** `creator_transactions` is the ledger record. A
  separate mutable `managed_creator_posts.total_paid_cents` was another cache
  and could drift from it.

### After the change

- `brand_campaigns` owns the current campaign terms.
- Each `managed_creator_posts` row stores its explicit `brand_campaign_id` and
  immutable `pricing_snapshot` at post creation.
- `payment_summary` is the single reporting projection for base, bonus, owed,
  paid, outstanding, and status. `total_paid_cents` is refreshed only from
  completed `creator_transactions` rows linked to that post.

## 2. Root cause of each ticket

### TICKET-481 — "$1 payout"

`create_managed_creator_post()` selected Maria's legacy
`managed_creators.base_pay = 100` instead of campaign base pay `1000`, then
froze that value into the post payment row. The campaign was never consulted.

### TICKET-486 — "missing 500k bonus"

Both creators had crossed the threshold, but their copied milestones used
`views`/`bonus_cents`. The trigger queried `min_views`/`amount_cents`, obtained
NULL comparisons, and therefore calculated a zero bonus.

### TICKET-490 — "the numbers don't match" (admin panel vs wallet vs brand spend)

The admin panel read frozen post-payment caches (`$1` for Maria and `$5` for
Teo before the fix); the wallet read ledger movement (Maria `$0`, Teo `$5`);
and the campaign configuration promised `$10 + $50` at 500k views. These were
three independently maintained values with no canonical join or reconciliation.

## 3. How I'd fix it

- **Single source of truth going forward:** Campaign terms are authoritative;
  post-level pricing is a contract snapshot, and the ledger is authoritative
  for money paid.
- **What stops being written / read:** Do not price posts from
  `managed_creators.base_pay`, creator-level milestones, or direct updates to
  `total_paid_cents`. Do not derive reporting totals from different tables.
- **One-time data cleanup needed:**
  `db/migrations/001_campaign_payment_source_of_truth.sql` maps rows only when
  their job has exactly one campaign, normalizes both milestone formats, builds
  snapshots, and puts ambiguous records in `payment_migration_issues` for
  manual mapping.
- **What I'd snapshot vs read live:** Snapshot campaign ID and pricing terms at
  post creation. Read views and completed ledger rows live when recalculating.
  An explicit `reprice_unpaid_managed_creator_post` function may update an
  unpaid snapshot; paid or partially-paid posts are immutable.

## 4. Anything I actually changed

- Reworked the runnable `ASSIGNMENT/db/init.sql` trigger path to require an
  explicit campaign, build a canonical snapshot, normalize milestones, and
  refresh post payment state from the ledger.
- Added `payment_summary`, an auditable unpaid-only repricing function, a
  production backfill migration, and transaction-wrapped integration assertions
  in `ASSIGNMENT/tests/payment_integration.sql`.
