-- =====================================================================
-- Seed data. Inserting into posts / post_engagement_metrics drives the real
-- triggers, which populate managed_creator_posts. Nothing here writes the
-- payment columns by hand -- the triggers do, exactly as production would.
-- =====================================================================

-- The brand's campaign config: $10.00 per video, $50.00 bonus at 500k views.
-- (Milestones here use the CORRECT {min_views, amount_cents} shape.)
INSERT INTO jobs (id, job_title, cpm_platforms_allowed)
VALUES ('11111111-1111-1111-1111-111111111111', 'Summer Launch', '{tiktok,instagram}');

INSERT INTO brand_campaigns (id, job_id, base_pay_per_video_cents, platforms, bonus_milestones)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  1000,
  '{tiktok,instagram}',
  '[{"min_views": 500000, "amount_cents": 5000}]'
);

-- Managed creators. base_pay is a NUMERIC that stores cents.
-- Their bonus_milestones use the LEGACY {views, bonus_cents} shape.
INSERT INTO managed_creators
  (id, display_name, linked_user_id, job_id, is_active, base_pay, bonus_milestones, tiktok_account_id)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Maria G.', 'user_maria',
   '11111111-1111-1111-1111-111111111111', true, 100,
   '[{"views": 500000, "bonus_cents": 5000}]', 'tt_maria'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Teo R.', 'user_teo',
   '11111111-1111-1111-1111-111111111111', true, 500,
   '[{"views": 500000, "bonus_cents": 5000}]', 'tt_teo');

-- A post lands for each creator -> trigger_create_managed_creator_post fires.
INSERT INTO posts (id, tiktok_account_id, latest_views) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'tt_maria', 600000),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'tt_teo', 700000);

-- A metrics sync arrives -> trigger_recalculate_post_payment fires.
INSERT INTO post_engagement_metrics (post_id, views) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 600000),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 700000);

-- Teo gets paid out: record the ledger entry, mark the post paid, re-sync.
UPDATE managed_creator_posts
SET total_paid_cents = 500
WHERE post_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

INSERT INTO creator_transactions (user_id, managed_creator_post_id, amount_cents, type)
SELECT 'user_teo', id, 500, 'earning'
FROM managed_creator_posts
WHERE post_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

INSERT INTO post_engagement_metrics (post_id, views)
VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', 700000);
