-- Production migration companion for the assignment slice.
-- Deploy the new trigger functions from db/init.sql before running this backfill.

ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS brand_campaign_id UUID REFERENCES brand_campaigns(id);

ALTER TABLE brand_campaigns
    ADD COLUMN IF NOT EXISTS max_pay_cents INTEGER;

ALTER TABLE managed_creator_posts
    ADD COLUMN IF NOT EXISTS brand_campaign_id UUID REFERENCES brand_campaigns(id),
    ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB;

ALTER TABLE creator_transactions
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('pending', 'completed', 'voided'));

CREATE TABLE IF NOT EXISTS payment_migration_issues (
    managed_creator_post_id UUID PRIMARY KEY REFERENCES managed_creator_posts(id),
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A job can map automatically only when it has exactly one campaign. Rows for
-- jobs with zero or multiple campaigns are explicitly held for manual review.
WITH campaign_counts AS (
    SELECT job_id, COUNT(*) AS campaign_count, MIN(id) AS campaign_id
    FROM brand_campaigns
    GROUP BY job_id
), candidates AS (
    SELECT mcp.id, cc.campaign_id
    FROM managed_creator_posts mcp
    JOIN managed_creators mc ON mc.id = mcp.managed_creator_id
    JOIN campaign_counts cc ON cc.job_id = mc.job_id
    WHERE cc.campaign_count = 1
)
UPDATE managed_creator_posts mcp
SET brand_campaign_id = candidates.campaign_id
FROM candidates
WHERE mcp.id = candidates.id
  AND mcp.brand_campaign_id IS NULL;

INSERT INTO payment_migration_issues (managed_creator_post_id, reason)
SELECT mcp.id,
       'No unique campaign could be inferred from the managed creator job'
FROM managed_creator_posts mcp
WHERE mcp.brand_campaign_id IS NULL
ON CONFLICT (managed_creator_post_id) DO NOTHING;

-- Populate canonical snapshots for rows that can be mapped. normalize_bonus_milestones
-- accepts both legacy {views, bonus_cents} and canonical {min_views, amount_cents}.
UPDATE managed_creator_posts mcp
SET pricing_snapshot = jsonb_build_object(
    'base_pay_per_video_cents', bc.base_pay_per_video_cents,
    'max_pay_cents', bc.max_pay_cents,
    'bonus_milestones', normalize_bonus_milestones(bc.bonus_milestones)
)
FROM brand_campaigns bc
WHERE bc.id = mcp.brand_campaign_id
  AND mcp.pricing_snapshot IS NULL;

-- After manual resolution of payment_migration_issues, enforce NOT NULL on
-- managed_creator_posts.brand_campaign_id and pricing_snapshot.
