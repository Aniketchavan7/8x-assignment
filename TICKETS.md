# Support tickets — payments

Three tickets came in this week. We believe they're related. Your job is to
understand them (see `README.md` → "Part 2" for exactly what to deliver).

You can reproduce all three against the local database:

```bash
cd ASSIGNMENT
docker compose up -d          # boots Postgres on localhost:5433 and loads the slice
psql postgresql://postgres:postgres@localhost:5433/assignment
```

The schema and seed are in `ASSIGNMENT/db/`. The behaviour that fills in the
payment numbers is **not** in the seed file — it's in the database triggers and
functions defined in `ASSIGNMENT/db/init.sql`. Read them carefully.

---

### TICKET-481 — "I only got paid $1"

> Maria did a video for the Summer Launch campaign. The campaign pays $10 a
> video. Her payout came through as **$1**. What happened?

### TICKET-486 — "Where's my 500k bonus?"

> Both Maria and Teo crossed 500,000 views. The campaign has a $50 milestone
> bonus at 500k. Neither of them got it. The bonus shows as **$0**.

### TICKET-490 — "None of the numbers match"

> For the same creators, the admin payouts panel, the creator's wallet, and the
> brand's spend report each show a **different total**. Nobody can tell which one
> is right.

---

Start here:

```sql
-- what the admin payouts panel shows (the frozen snapshot)
SELECT mc.display_name, mcp.base_pay_cents, mcp.bonus_cents,
       mcp.total_owed_cents, mcp.payment_status
FROM managed_creator_posts mcp
JOIN managed_creators mc ON mc.id = mcp.managed_creator_id;
```

Then trace where those numbers come from, and why the brand's campaign config
isn't the thing producing them.
