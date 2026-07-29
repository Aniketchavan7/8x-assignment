-- =====================================================================
-- Focused payment slice of the production schema, loadable into a plain
-- Postgres container. The TABLE shapes are trimmed to the columns the payment
-- path touches; the TRIGGER FUNCTION bodies are copied verbatim from the real
-- migrations under supabase/migrations/ so the behaviour is authentic.
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- Trigger functions (verbatim from supabase/migrations/)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION create_managed_creator_post()
RETURNS TRIGGER AS $$
DECLARE
    v_mc RECORD;
    v_views INTEGER;
    v_calculated_pay INTEGER;
    v_bonus INTEGER;
    v_total_owed INTEGER;
BEGIN
    SELECT
        mc.id,
        COALESCE(mc.base_pay, 0)::INTEGER as base_pay_cents,
        mc.cpm_rate,
        mc.max_pay_cents,
        COALESCE(mc.bonus_milestones, '[]'::jsonb) as bonus_milestones
    INTO v_mc
    FROM managed_creators mc
    WHERE mc.is_active = true
      AND (
          (NEW.instagram_account_id IS NOT NULL AND mc.instagram_account_id = NEW.instagram_account_id)
          OR (NEW.tiktok_account_id IS NOT NULL AND mc.tiktok_account_id = NEW.tiktok_account_id)
          OR (NEW.youtube_account_id IS NOT NULL AND mc.youtube_account_id = NEW.youtube_account_id)
      )
    LIMIT 1;

    IF v_mc.id IS NULL THEN
        RETURN NEW;
    END IF;

    v_views := COALESCE(NEW.latest_views, 0);

    IF v_mc.cpm_rate IS NOT NULL AND v_mc.cpm_rate > 0 THEN
        v_calculated_pay := (v_mc.cpm_rate * v_views) / 1000;
    ELSE
        v_calculated_pay := v_mc.base_pay_cents;
    END IF;

    v_bonus := 0;
    IF v_mc.bonus_milestones IS NOT NULL AND jsonb_array_length(v_mc.bonus_milestones) > 0 THEN
        SELECT COALESCE(MAX((elem->>'amount_cents')::INTEGER), 0) INTO v_bonus
        FROM jsonb_array_elements(v_mc.bonus_milestones) AS elem
        WHERE (elem->>'min_views')::INTEGER <= v_views;
    END IF;

    v_total_owed := v_calculated_pay + v_bonus;
    IF v_mc.max_pay_cents IS NOT NULL AND v_total_owed > v_mc.max_pay_cents THEN
        v_total_owed := v_mc.max_pay_cents;
    END IF;

    INSERT INTO managed_creator_posts (
        managed_creator_id, post_id, base_pay_cents, cpm_rate, max_pay_cents,
        bonus_milestones, calculated_pay_cents, bonus_cents, total_owed_cents
    ) VALUES (
        v_mc.id, NEW.id, v_mc.base_pay_cents, v_mc.cpm_rate, v_mc.max_pay_cents,
        v_mc.bonus_milestones, v_calculated_pay, v_bonus, v_total_owed
    )
    ON CONFLICT (post_id) DO NOTHING;

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
    v_mcp RECORD;
    v_views INTEGER;
    v_calculated_pay INTEGER;
    v_bonus INTEGER;
    v_total_owed INTEGER;
BEGIN
    SELECT * INTO v_mcp
    FROM managed_creator_posts
    WHERE post_id = NEW.post_id;

    IF v_mcp.id IS NULL THEN
        RETURN NEW;
    END IF;

    v_views := COALESCE(NEW.views, 0);

    IF v_mcp.cpm_rate IS NOT NULL AND v_mcp.cpm_rate > 0 THEN
        v_calculated_pay := (v_mcp.cpm_rate * v_views) / 1000;
    ELSE
        v_calculated_pay := v_mcp.base_pay_cents;
    END IF;

    v_bonus := 0;
    IF v_mcp.bonus_milestones IS NOT NULL AND jsonb_array_length(v_mcp.bonus_milestones) > 0 THEN
        SELECT COALESCE(MAX((elem->>'amount_cents')::INTEGER), 0) INTO v_bonus
        FROM jsonb_array_elements(v_mcp.bonus_milestones) AS elem
        WHERE (elem->>'min_views')::INTEGER <= v_views;
    END IF;

    v_total_owed := v_calculated_pay + v_bonus;
    IF v_mcp.max_pay_cents IS NOT NULL AND v_total_owed > v_mcp.max_pay_cents THEN
        v_total_owed := v_mcp.max_pay_cents;
    END IF;

    UPDATE managed_creator_posts
    SET
        calculated_pay_cents = v_calculated_pay,
        bonus_cents = v_bonus,
        total_owed_cents = v_total_owed,
        payment_status = CASE
            WHEN total_paid_cents >= v_total_owed THEN 'paid'
            WHEN total_paid_cents > 0 AND total_paid_cents < v_total_owed THEN 'partially_paid'
            ELSE 'unpaid'
        END,
        updated_at = NOW()
    WHERE id = v_mcp.id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_recalculate_post_payment
    AFTER INSERT ON post_engagement_metrics
    FOR EACH ROW
    EXECUTE FUNCTION recalculate_managed_creator_post_payment();
