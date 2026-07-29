BEGIN;

DO $$
DECLARE
    maria RECORD;
    teo RECORD;
BEGIN
    SELECT * INTO maria
    FROM payment_summary ps
    JOIN managed_creator_posts mcp ON mcp.id = ps.managed_creator_post_id
    JOIN managed_creators mc ON mc.id = mcp.managed_creator_id
    WHERE mc.display_name = 'Maria G.';

    IF maria.base_pay_cents <> 1000 OR maria.bonus_cents <> 5000
       OR maria.total_owed_cents <> 6000 OR maria.total_paid_cents <> 0
       OR maria.payment_status <> 'unpaid' THEN
        RAISE EXCEPTION 'Maria payment mismatch: %', row_to_json(maria);
    END IF;

    SELECT * INTO teo
    FROM payment_summary ps
    JOIN managed_creator_posts mcp ON mcp.id = ps.managed_creator_post_id
    JOIN managed_creators mc ON mc.id = mcp.managed_creator_id
    WHERE mc.display_name = 'Teo R.';

    IF teo.base_pay_cents <> 1000 OR teo.bonus_cents <> 5000
       OR teo.total_owed_cents <> 6000 OR teo.total_paid_cents <> 500
       OR teo.outstanding_cents <> 5500 OR teo.payment_status <> 'partially_paid' THEN
        RAISE EXCEPTION 'Teo payment mismatch: %', row_to_json(teo);
    END IF;
END;
$$;

-- A campaign edit does not alter an already-created post's captured terms.
UPDATE brand_campaigns SET base_pay_per_video_cents = 2000
WHERE id = '22222222-2222-2222-2222-222222222222';
INSERT INTO post_engagement_metrics (post_id, views)
VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 600000);

DO $$
DECLARE v_base INTEGER;
BEGIN
    SELECT base_pay_cents INTO v_base
    FROM managed_creator_posts
    WHERE post_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    IF v_base <> 1000 THEN
        RAISE EXCEPTION 'Campaign edit leaked into payment snapshot: %', v_base;
    END IF;
END;
$$;

-- Ledger entries drive payment state; duplicate metrics do not affect it.
INSERT INTO creator_transactions (user_id, managed_creator_post_id, amount_cents, type)
SELECT 'user_teo', id, 5500, 'earning'
FROM managed_creator_posts
WHERE post_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

INSERT INTO post_engagement_metrics (post_id, views)
VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', 700000);

DO $$
DECLARE v_paid INTEGER; v_status TEXT;
BEGIN
    SELECT total_paid_cents, payment_status INTO v_paid, v_status
    FROM managed_creator_posts
    WHERE post_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    IF v_paid <> 6000 OR v_status <> 'paid' THEN
        RAISE EXCEPTION 'Ledger-derived payment state mismatch: %, %', v_paid, v_status;
    END IF;
END;
$$;

-- Pending ledger rows never count as paid, and paid posts cannot be repriced.
INSERT INTO creator_transactions (user_id, managed_creator_post_id, amount_cents, type, status)
SELECT 'user_teo', id, 100, 'earning', 'pending'
FROM managed_creator_posts
WHERE post_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

DO $$
DECLARE v_paid INTEGER;
BEGIN
    SELECT total_paid_cents INTO v_paid
    FROM managed_creator_posts
    WHERE post_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    IF v_paid <> 6000 THEN
        RAISE EXCEPTION 'Pending transaction was counted as paid: %', v_paid;
    END IF;

    BEGIN
        PERFORM reprice_unpaid_managed_creator_post(
            (SELECT id FROM managed_creator_posts WHERE post_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
            '22222222-2222-2222-2222-222222222222'
        );
        RAISE EXCEPTION 'Expected paid post repricing to fail';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'Paid or partially paid posts cannot be repriced' THEN RAISE; END IF;
    END;

    PERFORM reprice_unpaid_managed_creator_post(
        (SELECT id FROM managed_creator_posts WHERE post_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
        '22222222-2222-2222-2222-222222222222'
    );
    SELECT base_pay_cents INTO v_paid
    FROM managed_creator_posts
    WHERE post_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    IF v_paid <> 2000 THEN
        RAISE EXCEPTION 'Explicit unpaid repricing did not update the snapshot: %', v_paid;
    END IF;
END;
$$;

ROLLBACK;
