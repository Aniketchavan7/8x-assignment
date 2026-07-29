# FINDINGS — Creator Payment Calculation Bugs

## 1. Where the Money Lives

| Value | Source of truth (new) | Legacy / redundant columns (go stale) |
|---|---|---|
| Base pay per video | `brand_campaigns.base_pay_per_video_cents` → frozen into `managed_creator_posts.pricing_snapshot->>'base_pay_per_video_cents'` at post creation | `managed_creators.base_pay` — a NUMERIC that stores cents at the creator level. Never updated when the campaign rate changes; the old trigger read it directly, so any creator whose row drifted from the campaign value got the wrong base pay. |
| Bonus milestones | `brand_campaigns.bonus_milestones` → frozen into `managed_creator_posts.pricing_snapshot->'bonus_milestones'` at post creation (normalised to `{min_views, amount_cents}` shape) | `managed_creators.bonus_milestones` — stored in the legacy `{views, bonus_cents}` key shape. The old trigger read these keys but the bonus query filtered on `amount_cents` / `min_views`, so nothing ever matched. |
| Max pay cap | `brand_campaigns.max_pay_cents` → frozen into `managed_creator_posts.pricing_snapshot->>'max_pay_cents'` at post creation | `managed_creators.max_pay_cents` — same staleness problem as base pay; read from the wrong table. |
| Total paid | Derived at query time by `refresh_managed_creator_post_payment`: `SUM(amount_cents)` from `creator_transactions` where `type = 'earning'` AND `status = 'completed'` | `managed_creator_posts.total_paid_cents` is still the stored column, but it is now **written only by the ledger trigger**, never by ad-hoc application code. Any route that was writing this column directly is a source of drift and needs to be migrated to insert a `creator_transactions` row instead. |

### Why "frozen at post creation" matters

A campaign edit (e.g. raising `base_pay_per_video_cents` from 1000 to 2000) must not retroactively change what a creator is owed for a video that was already posted. The `pricing_snapshot` JSONB column on `managed_creator_posts` captures the campaign terms at the moment the post is created. Subsequent recalculations (engagement metrics arriving) re-derive pay from the snapshot, not from the live campaign row. An explicit `reprice_unpaid_managed_creator_post()` function exists for the case where an admin intentionally wants to update an unpaid post's terms.

---

## 2. Root Cause per Ticket

### TICKET-481 — Base pay 10× too low

**What happened:** The old `create_managed_creator_post` trigger read `managed_creators.base_pay` to set `base_pay_cents`. For Maria, that value is `100`. The campaign's actual rate (`brand_campaigns.base_pay_per_video_cents`) is `1000`.

| | Old value | Correct value |
|---|---|---|
| Maria `base_pay_cents` | 100 | 1000 |
| Teo `base_pay_cents` | 500 | 1000 |

The creator-level `base_pay` was a per-creator override that predates campaigns. Once campaigns became the pricing authority, this column was never kept in sync — Maria's row has `100` while the campaign says `1000`. The trigger was reading the wrong table.

**Fix:** The new trigger reads `base_pay_per_video_cents` from the `brand_campaigns` row that the post is explicitly linked to, and snapshots it into `pricing_snapshot`. `managed_creators.base_pay` is no longer consulted for payment calculation.

### TICKET-486 — Bonus always zero

**What happened:** The old trigger read `managed_creators.bonus_milestones`, which uses the legacy JSON shape:

```json
[{"views": 500000, "bonus_cents": 5000}]
```

But the bonus query filtered on the canonical key names:

```sql
WHERE (elem->>'min_views')::INTEGER <= v_views
-- and selected (elem->>'amount_cents')::INTEGER
```

`min_views` and `amount_cents` don't exist in the legacy shape, so the cast returned NULL, the WHERE clause never matched, and `COALESCE(MAX(...), 0)` always returned 0.

| | Old value | Correct value |
|---|---|---|
| Maria `bonus_cents` | 0 | 5000 |
| Teo `bonus_cents` | 0 | 5000 |

**Fix:** Two things changed. First, the source of truth moved to `brand_campaigns.bonus_milestones`, which already uses the canonical `{min_views, amount_cents}` shape. Second, a `normalize_bonus_milestones()` function handles both shapes — it reads `min_views` falling back to `views`, and `amount_cents` falling back to `bonus_cents` — so legacy data in either shape is handled correctly during the migration backfill.

### TICKET-490 — Teo shows "paid" when $55 is still outstanding

**This is a downstream symptom of TICKET-481 + TICKET-486, not an independent bug.** The payment status is derived from `total_paid_cents >= total_owed_cents`.

| | Old | Correct |
|---|---|---|
| Teo `total_owed_cents` | 500 (wrong base + zero bonus) | 6000 (1000 base + 5000 bonus) |
| Teo `total_paid_cents` | 500 | 500 |
| Teo `outstanding_cents` | 0 | 5500 |
| Teo `payment_status` | `paid` | `partially_paid` |

With the old broken calculation, `total_owed_cents` was only 500 (the wrong base pay, no bonus). Teo's single $5.00 transaction covered that, so the status showed `paid`. With the correct calculation, Teo is owed $60.00 total, has been paid $5.00, and has $55.00 outstanding.

---

## 3. Fix Direction

### What is implemented and passing

- **New schema (`db/init.sql`):** `managed_creator_posts` now carries `brand_campaign_id` and `pricing_snapshot` (JSONB). The `payment_summary` view exposes computed `outstanding_cents` and `payment_status`. Posts require an explicit `brand_campaign_id` on insertion.

- **Campaign-owned pricing snapshot:** The `create_managed_creator_post` trigger reads from `brand_campaigns`, not `managed_creators`. It freezes `base_pay_per_video_cents`, `max_pay_cents`, and normalised `bonus_milestones` into `pricing_snapshot` at post creation. All subsequent recalculations (`refresh_managed_creator_post_payment`) read from the snapshot.

- **`normalize_bonus_milestones()`:** An immutable function that accepts both `{views, bonus_cents}` and `{min_views, amount_cents}` key shapes and outputs the canonical form. Used at snapshot creation and during migration backfill.

- **Ledger-derived `total_paid_cents`:** `refresh_managed_creator_post_payment` derives `total_paid_cents` from `SUM(amount_cents)` over `creator_transactions` where `status = 'completed'`. A trigger on `creator_transactions` (insert/update/delete) calls this function so the value stays current. Pending transactions are excluded.

- **Repricing guard:** `reprice_unpaid_managed_creator_post()` allows an admin to update an unpaid post's snapshot to a different campaign's terms. Posts with any payments (`total_paid_cents > 0`) are rejected.

- **Migration (`db/migrations/001_campaign_payment_source_of_truth.sql`):** Adds the new columns, backfills `brand_campaign_id` for jobs that have exactly one campaign, populates `pricing_snapshot` from the matched campaign, and logs rows that couldn't be auto-mapped into `payment_migration_issues` for manual review.

- **Integration test (`tests/payment_integration.sql`):** Runs inside a `BEGIN`/`ROLLBACK` transaction against the live Docker Postgres instance. Asserts Maria's and Teo's correct payment values, verifies campaign edits don't leak into existing snapshots, verifies ledger-driven status transitions (partially_paid → paid), confirms pending transactions are excluded, and tests the repricing guard.

### What is still a plan — not yet done

- **Production app route updates:** Any application code that writes `total_paid_cents` directly on `managed_creator_posts` (instead of inserting into `creator_transactions`) needs to be migrated. The ledger trigger only works if payments flow through the transactions table.

- **Full backfill of all existing rows:** The migration auto-maps rows only for single-campaign jobs. Multi-campaign jobs land in `payment_migration_issues` and require manual resolution (or a follow-up script with business-rule input on which campaign each post belongs to). After that, `NOT NULL` constraints on `brand_campaign_id` and `pricing_snapshot` should be enforced.

- **Admin repricing UI:** The `reprice_unpaid_managed_creator_post()` function exists in the database but there is no admin interface or API endpoint exposing it yet. Until that's built, repricing requires direct SQL access.

- **Legacy column cleanup:** `managed_creators.base_pay`, `managed_creators.bonus_milestones`, and `managed_creators.max_pay_cents` are no longer used for payment calculation but are still present in the schema. They should be dropped (or marked deprecated) once all application reads are confirmed to use the campaign/snapshot path.
