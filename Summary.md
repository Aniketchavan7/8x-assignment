# SUMMARY

## What I got done, and what I didn't get to
Part 1: fixed all three bugs — a rate limiter that allowed one extra attempt
before blocking, an admin lookup tool misclassifying valid ad codes, and a
CPM earnings calculation that was off by 10x. All tests pass.

Part 2: I fully diagnosed the root cause behind all three tickets and verified
it against the live database with real query output (not just reading the
code). I wrote a migration and a passing integration test that fixes the
underlying trigger logic. I did not get to updating the actual application
routes that read/write these values, a full backfill for every existing row
(only single-campaign jobs are auto-mapped), or an admin UI for the repricing
function I added.

## How I spotted the cause, and where I got to (Part 2)
I started from the tickets and reproduced each one against the database using
the queries in TICKETS.md. Then I read through the trigger functions in
init.sql to see where each number actually came from. I found that the
payment trigger was reading a stale per-creator field (managed_creators.base_pay)
instead of the campaign's actual rate — that explained the $1 instead of $10.
For the missing bonus, I found the campaign's bonus milestones and the
creator's copy of them used different JSON key names, so the lookup never
matched and silently returned zero. The mismatched totals ticket turned out to
be a downstream effect of these same two bugs, not a separate issue — once the
underlying numbers are correct, the three views agree.

While testing, I also caught that my local Docker Postgres container was
running an older schema than what was in the init.sql file on disk (Postgres
only re-runs its init scripts on first boot), so I had to recreate the
container to properly test against the fixed schema — worth flagging since it
would have made my "before/after" comparison meaningless otherwise.

## With one more hour
I'd migrate the actual application routes off any direct writes to
total_paid_cents so everything flows through the transactions ledger, resolve
the multi-campaign edge cases that the backfill migration currently flags for
manual review, and build a small admin endpoint for the repricing function
instead of requiring direct SQL access.