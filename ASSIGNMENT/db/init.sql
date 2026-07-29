-- =====================================================================
-- Focused payment slice of the production schema, loadable into a plain
-- Postgres container. The TABLE shapes are trimmed to the columns the payment
-- path touches. The payment triggers below model the proposed migration to a
-- campaign-owned source of truth.
--
-- Loaded automatically by docker-compose on first boot.
-- =====================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_title TEXT NOT NULL,
    cpm_platforms_allowed TEXT[] NOT NULL DEFAULT '{}',
    cpm_base_pay NUMERIC,
    bonus_milestones JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE brand_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id),
    base_pay_per_video_cents INTEGER NOT NULL,
    max_pay_cents INTEGER,
    platforms TEXT[] NOT NULL DEFAULT '{}',
    bonus_milestones JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE managed_creators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name TEXT NOT NULL,
    linked_user_id TEXT,
    job_id UUID REFERENCES jobs(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    base_pay NUMERIC,                 -- DECIMAL that stores cents (legacy)
    cpm_rate INTEGER,                 -- cents per 1k views (NULL if not CPM)
    max_pay_cents INTEGER,            -- cap per video (NULL = no cap)
    bonus_milestones JSONB NOT NULL DEFAULT '[]',
    tiktok_account_id TEXT,
    instagram_account_id TEXT,
    youtube_account_id TEXT
);

CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tiktok_account_id TEXT,
    instagram_account_id TEXT,
    youtube_account_id TEXT,
    -- The campaign must be explicit. A job can have more than one campaign.
    brand_campaign_id UUID NOT NULL REFERENCES brand_campaigns(id),
    latest_views INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE post_engagement_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    views INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE managed_creator_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    managed_creator_id UUID NOT NULL REFERENCES managed_creators(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    brand_campaign_id UUID NOT NULL REFERENCES brand_campaigns(id),
    -- Immutable terms captured when the post is created.
    pricing_snapshot JSONB NOT NULL,
    base_pay_cents INTEGER NOT NULL DEFAULT 0,
    cpm_rate INTEGER,
    max_pay_cents INTEGER,
    bonus_milestones JSONB DEFAULT '[]',
    calculated_pay_cents INTEGER NOT NULL DEFAULT 0,
    bonus_cents INTEGER NOT NULL DEFAULT 0,
    total_owed_cents INTEGER NOT NULL DEFAULT 0,
    total_paid_cents INTEGER NOT NULL DEFAULT 0,
    payment_status TEXT NOT NULL DEFAULT 'unpaid'
        CHECK (payment_status IN ('unpaid', 'partially_paid', 'paid')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_managed_creator_posts_post_id UNIQUE (post_id)
);

CREATE TRIGGER update_managed_creator_posts_updated_at
    BEFORE UPDATE ON managed_creator_posts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE creator_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    managed_creator_post_id UUID REFERENCES managed_creator_posts(id),
    amount_cents INTEGER NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed'
        CHECK (status IN ('pending', 'completed', 'voided')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- Canonical payment calculation
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION normalize_bonus_milestones(p_milestones JSONB)
RETURNS JSONB AS $$
BEGIN
    RETURN COALESCE((
        SELECT jsonb_agg(
            jsonb_build_object(
                'min_views', COALESCE((elem->>'min_views')::INTEGER, (elem->>'views')::INTEGER),
                'amount_cents', COALESCE((elem->>'amount_cents')::INTEGER, (elem->>'bonus_cents')::INTEGER)
            ) ORDER BY COALESCE((elem->>'min_views')::INTEGER, (elem->>'views')::INTEGER)
        )
        FROM jsonb_array_elements(COALESCE(p_milestones, '[]'::jsonb)) AS elem
        WHERE COALESCE((elem->>'min_views')::INTEGER, (elem->>'views')::INTEGER) IS NOT NULL
          AND COALESCE((elem->>'amount_cents')::INTEGER, (elem->>'bonus_cents')::INTEGER) IS NOT NULL
    ), '[]'::jsonb);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION refresh_managed_creator_post_payment(p_mcp_id UUID)
RETURNS VOID AS $$
DECLARE
    v_mcp RECORD;
    v_views INTEGER;
    v_base_pay INTEGER;
    v_bonus INTEGER;
    v_total_owed INTEGER;
    v_total_paid INTEGER;
    v_cap INTEGER;
BEGIN
    SELECT * INTO v_mcp FROM managed_creator_posts WHERE id = p_mcp_id FOR UPDATE;
    IF v_mcp.id IS NULL THEN RETURN; END IF;

    SELECT COALESCE(MAX(views), 0) INTO v_views
    FROM post_engagement_metrics WHERE post_id = v_mcp.post_id;

    v_base_pay := COALESCE((v_mcp.pricing_snapshot->>'base_pay_per_video_cents')::INTEGER, 0);
    v_cap := NULLIF(v_mcp.pricing_snapshot->>'max_pay_cents', '')::INTEGER;
    SELECT COALESCE(MAX((elem->>'amount_cents')::INTEGER), 0) INTO v_bonus
    FROM jsonb_array_elements(v_mcp.pricing_snapshot->'bonus_milestones') AS elem
    WHERE (elem->>'min_views')::INTEGER <= v_views;

    v_total_owed := v_base_pay + v_bonus;
    IF v_cap IS NOT NULL THEN v_total_owed := LEAST(v_total_owed, v_cap); END IF;

    SELECT COALESCE(SUM(amount_cents), 0) INTO v_total_paid
    FROM creator_transactions
    WHERE managed_creator_post_id = v_mcp.id
      AND type = 'earning'
      AND status = 'completed';

    UPDATE managed_creator_posts
    SET base_pay_cents = v_base_pay,
        calculated_pay_cents = v_base_pay,
        bonus_cents = v_bonus,
        total_owed_cents = v_total_owed,
        total_paid_cents = v_total_paid,
        payment_status = CASE
            WHEN v_total_paid >= v_total_owed THEN 'paid'
            WHEN v_total_paid > 0 THEN 'partially_paid'
            ELSE 'unpaid'
        END
    WHERE id = v_mcp.id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_managed_creator_post()
RETURNS TRIGGER AS $$
DECLARE
    v_mc RECORD;
    v_campaign RECORD;
    v_snapshot JSONB;
    v_mcp_id UUID;
BEGIN
    SELECT * INTO v_campaign FROM brand_campaigns WHERE id = NEW.brand_campaign_id;
    IF v_campaign.id IS NULL THEN
        RAISE EXCEPTION 'Posts require an explicit valid brand_campaign_id';
    END IF;

    SELECT
        mc.id
    INTO v_mc
    FROM managed_creators mc
    WHERE mc.is_active = true
      AND mc.job_id = v_campaign.job_id
      AND (
          (NEW.instagram_account_id IS NOT NULL AND mc.instagram_account_id = NEW.instagram_account_id)
          OR (NEW.tiktok_account_id IS NOT NULL AND mc.tiktok_account_id = NEW.tiktok_account_id)
          OR (NEW.youtube_account_id IS NOT NULL AND mc.youtube_account_id = NEW.youtube_account_id)
      )
    LIMIT 1;

    IF v_mc.id IS NULL THEN
        RETURN NEW;
    END IF;

    v_snapshot := jsonb_build_object(
        'base_pay_per_video_cents', v_campaign.base_pay_per_video_cents,
        'max_pay_cents', v_campaign.max_pay_cents,
        'bonus_milestones', normalize_bonus_milestones(v_campaign.bonus_milestones)
    );

    INSERT INTO managed_creator_posts (
        managed_creator_id, post_id, brand_campaign_id, pricing_snapshot
    ) VALUES (
        v_mc.id, NEW.id, v_campaign.id, v_snapshot
    )
    ON CONFLICT (post_id) DO NOTHING
    RETURNING id INTO v_mcp_id;

    IF v_mcp_id IS NOT NULL THEN
        PERFORM refresh_managed_creator_post_payment(v_mcp_id);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_managed_creator_post
    AFTER INSERT ON posts
    FOR EACH ROW
    EXECUTE FUNCTION create_managed_creator_post();

CREATE OR REPLACE FUNCTION recalculate_managed_creator_post_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_mcp_id UUID;
BEGIN
    SELECT id INTO v_mcp_id FROM managed_creator_posts WHERE post_id = NEW.post_id;
    IF v_mcp_id IS NOT NULL THEN PERFORM refresh_managed_creator_post_payment(v_mcp_id); END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_recalculate_post_payment
    AFTER INSERT ON post_engagement_metrics
    FOR EACH ROW
    EXECUTE FUNCTION recalculate_managed_creator_post_payment();

CREATE OR REPLACE FUNCTION refresh_post_payment_from_ledger()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.managed_creator_post_id IS NOT NULL THEN
            PERFORM refresh_managed_creator_post_payment(OLD.managed_creator_post_id);
        END IF;
    ELSIF NEW.managed_creator_post_id IS NOT NULL THEN
        PERFORM refresh_managed_creator_post_payment(NEW.managed_creator_post_id);
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_refresh_post_payment_from_ledger
    AFTER INSERT OR UPDATE OR DELETE ON creator_transactions
    FOR EACH ROW EXECUTE FUNCTION refresh_post_payment_from_ledger();

CREATE OR REPLACE FUNCTION reprice_unpaid_managed_creator_post(
    p_mcp_id UUID,
    p_brand_campaign_id UUID
)
RETURNS VOID AS $$
DECLARE
    v_campaign RECORD;
BEGIN
    IF EXISTS (SELECT 1 FROM managed_creator_posts WHERE id = p_mcp_id AND total_paid_cents > 0) THEN
        RAISE EXCEPTION 'Paid or partially paid posts cannot be repriced';
    END IF;
    SELECT * INTO v_campaign FROM brand_campaigns WHERE id = p_brand_campaign_id;
    IF v_campaign.id IS NULL THEN RAISE EXCEPTION 'Unknown campaign'; END IF;
    UPDATE managed_creator_posts
    SET brand_campaign_id = v_campaign.id,
        pricing_snapshot = jsonb_build_object(
            'base_pay_per_video_cents', v_campaign.base_pay_per_video_cents,
            'max_pay_cents', v_campaign.max_pay_cents,
            'bonus_milestones', normalize_bonus_milestones(v_campaign.bonus_milestones)
        )
    WHERE id = p_mcp_id;
    PERFORM refresh_managed_creator_post_payment(p_mcp_id);
END;
$$ LANGUAGE plpgsql;

CREATE VIEW payment_summary AS
SELECT mcp.id AS managed_creator_post_id,
       mcp.brand_campaign_id,
       mcp.base_pay_cents,
       mcp.bonus_cents,
       mcp.total_owed_cents,
       mcp.total_paid_cents,
       GREATEST(mcp.total_owed_cents - mcp.total_paid_cents, 0) AS outstanding_cents,
       mcp.payment_status
FROM managed_creator_posts mcp;
