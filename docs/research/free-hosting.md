# Free hosting for the Running Zone server and Postgres

Research for issue #57 (child of map #56). Researched 2026-10-16 from official pricing and docs pages.

Question: which free (no card charge) app hosts and Postgres providers can run this app as it is, auto-deploying from `main` on GitHub at a free HTTPS address, for about 30 phones polling every 5 seconds over an 8-hour day?

## The app, as it is

- One long-running Node 22 Fastify server (`src/server/main.ts`), built by the repo `Dockerfile`, `npm start`. Serves the PWA from `dist/web` and the API under `/api/`. Health check: `/api/health`.
- One `pg.Pool` built from `DATABASE_URL` only (`src/server/storage.ts`), per-request transactions with `pg_advisory_xact_lock`. Creates its own tables on startup. Needs `DATABASE_URL`, `OWNER_PASSWORD`.
- Listens on `HOST` / `PORT`. **`HOST` defaults to `127.0.0.1` and the Dockerfile does not set it**, so every container host below needs `HOST=0.0.0.0` set as an env var (or a one-line Dockerfile change), or the platform health check will never reach it.
- No response compression and no ETags, so every poll returns the full body.

## Load arithmetic

- 30 phones / 5 s = **6 requests/s** while visible.
- 8 hours = 28,800 s, so **172,800 API requests per event day**, roughly 5.2 M per month if there were 30 such days. Realistically 1 to 4 event days a month, so 0.2 to 0.7 M requests a month.
- Bandwidth per day = 172,800 x average response size. At 5 KB that is about 0.86 GB/day; at 20 KB about 3.5 GB/day. **Average poll response size has not been measured** and it decides whether several free tiers fit (Render bandwidth, Neon and Supabase egress, Cloud Run egress). Measure it during a rehearsal (browser devtools, or Postgres-side `pg_stat_statements` / provider usage graphs).
- Advisory locks: the app uses only `pg_advisory_xact_lock` (transaction-scoped). These are released at commit, so they also work through transaction-mode poolers. Neon's pooler docs list only *session-level* advisory locks as unsupported [Neon pooling]. Still, with a long-running server the direct (unpooled) connection is the simplest choice.

## App hosts

| Host | Runs the Dockerfile as a long-running server? | Free limits that matter | Card | Auto-deploy from `main` | Fits 6 req/s for 8 h? |
|---|---|---|---|---|---|
| **Render** (free web service) | Yes, Docker runtime runs the Dockerfile `CMD` [Render deploys] | 512 MB RAM, 0.1 CPU [Render compute]. 750 instance hours/month per workspace. Spins down after **15 min** without inbound traffic, spin-up "about one minute". Ephemeral filesystem; may be restarted at any time [Render free]. Hobby workspace includes **5 GB outbound bandwidth/month** (new plans, 2026); over it with no card, services are spun down until next month [Render bandwidth] | Not needed to start; needed to avoid suspension on overage [Render free] | Yes, on by default [Render deploys] | Hours: yes. CPU: tight at 0.1 CPU. **Bandwidth: only if average response is under ~29 KB for one event day a month** (5 GB / 172,800), less with more days |
| **Koyeb** (free instance) | Yes, Dockerfile builder [Koyeb git] | 1 free instance per org, 512 MB RAM, 0.1 vCPU, 2 GB SSD, Frankfurt or Washington D.C. only. Scales to zero after **1 hour** without traffic. "Testing and hobby projects, not production" [Koyeb instances]. 100 GB outbound bandwidth/month [Koyeb FAQ] | **Card required** for fraud checks (verification hold, cancelled; "never be charged" for the free service) [Koyeb FAQ] | Yes, on push to production branch (repos owned by the linked GitHub org) [Koyeb git] | Yes on hours and bandwidth. CPU tight at 0.1 vCPU, same as Render |
| **Vercel** (Hobby) | No. Fastify becomes **one Vercel Function** on Fluid compute [Vercel Fastify] | Per month: 1 M function invocations, 4 active CPU-hours, 360 GB-hours memory, 100 GB fast data transfer, 10 GB fast origin transfer, 1 M CDN requests, 300 s max duration. Over a limit: wait 30 days. **Non-commercial personal use only** [Vercel Hobby] | No | Yes (Git integration) | About **5 event days/month** on invocations (172,800/day vs 1 M). Active CPU 4 h/month at ~10-15 ms per request is about 30-45 min/day, so also about 5 days. Fast origin transfer 10 GB is the same unmeasured-size risk |
| **Google Cloud Run** | Yes, any container | Request-based billing free tier per month: 2 M requests, 180,000 vCPU-s, 360,000 GiB-s, **1 GB egress from North America** [GCP free] | **Billing account required** for the free tier [GCP free] | Yes, via Cloud Build / Developer Connect trigger [Cloud Run CD] | Requests and CPU yes. **1 GB egress fails** at almost any response size |
| **Fly.io** | Yes | **No free tier for new organizations**; trial is 2 machine-hours or 7 days [Fly pricing] | Card after trial | Via GitHub Actions | No |
| **Railway** | Yes | 30-day trial with $5, then Free plan **$1 credit/month**, 0.5 GB RAM, 1 vCPU [Railway trial] [Railway plans] | Post-paid card required [Railway plans] | Yes | No, $1/month does not cover an app plus a database |
| **Northflank** (Developer Sandbox) | Yes | 2 services, 2 jobs, 1 addon (database), "always-on compute, no sleeping", compute "Limited", not for production [Northflank pricing] [Northflank billing] | **Payment method required** for all users [Northflank billing] | Yes | Probably, but free CPU/RAM sizes are not published |
| **Cloudflare Workers / Containers** | Containers: **Workers Paid ($5/month) only** [CF Containers]. Workers Free: not a Node server, would need a rewrite to the Workers runtime | Workers Free: **100,000 requests/day**, 10 ms CPU per request, 6 simultaneous outgoing connections [CF limits] | No (Workers Free) | Yes (Workers Builds) | **No: 172,800 requests/day exceeds 100,000/day** |

What a serverless rewrite would mean (Vercel, Cloudflare Workers): the per-request transaction and `pg_advisory_xact_lock` are fine, because they live inside one request. The work is packaging, not logic: export the Fastify app as the function entrypoint instead of calling `listen`, move table creation to an idempotent first-request or deploy step, and serve `dist/web` from the platform's static/CDN output instead of `@fastify/static`. Cloudflare additionally needs the Workers runtime (Node compat + TCP sockets) and would still hit the 100k/day cap.

## Postgres providers

| Provider | Free limits that matter | Expiry / inactivity | Connections | SSL with `pg` from the URL alone | Card |
|---|---|---|---|---|---|
| **Neon** Free | 100 CU-hours per project per month, 0.25 CU minimum, autoscale to 2 CU. 1 GB storage per project. **5 GB egress per project**. Compute suspends after 5 min idle. Over CU-hours or egress: compute suspended until next billing period; data is not deleted [Neon pricing] | Permanent plan, no inactivity deletion stated [Neon pricing] | 0.25 CU: 104 max (97 usable). Pooler accepts 10,000 clients [Neon pooling] | **Yes.** Neon uses a Let's Encrypt (ISRG Root X1) certificate and requires TLS [Neon TLS], so `pg`'s `sslmode=require` (which `pg` treats as full verification [pg-connection-string]) just works. Drop `channel_binding=require` from the copied URL or leave it; `pg-connection-string` does not document it | No [Neon pricing] |
| **Supabase** Free | Nano compute, shared CPU, 0.5 GB RAM. 500 MB database. 5 GB egress. 2 active projects [Supabase pricing] [Supabase compute] | **Paused after 1 week of inactivity** [Supabase pricing] | 60 direct, 200 pooler clients [Supabase compute] | **No, needs a tweak.** Direct connection is IPv6-only on free; IPv4 hosts must use the Supavisor session pooler (port 5432) [Supabase connect]. Verification needs the Supabase CA certificate downloaded from the dashboard [Supabase SSL], and `pg` verifies on `sslmode=require`, so either supply the CA or use `sslmode=no-verify` | Not stated |
| **Aiven** Free | 1 dedicated VM, 1 CPU, 1 GB RAM, 1 GB storage, no pooling, cloud/region **not selectable** [Aiven pricing] | No time limit, but may be powered off if unused, with notice; can be powered back on [Aiven free] | Not stated for free | **No, needs a tweak.** Aiven's Node guide loads a downloaded `ca.pem` [Aiven node]. From the URL alone only `sslmode=no-verify` works | Not required [Aiven free] |
| **Render Postgres** Free | 256 MB RAM, 0.1 CPU, 100 connections [Render compute]. 1 GB storage, no backups [Render free] | **Expires 30 days after creation**, 14-day grace, then deleted [Render free] | 100 | Internal URL: TLS optional, self-signed. External URL: always TLS with Render-managed certs [Render Postgres] | No |
| **Koyeb** Postgres Free | 0.25 vCPU, 1 GB RAM, 1 GB storage, **5 hours active compute per month**, sleeps after 5 min [Koyeb databases] | - | ~112 | Examples use `sslmode=require` | Card (account) |

Koyeb Postgres (5 h/month) and Render Postgres (30-day deletion) are out: one 8-hour day exhausts the first, and the second deletes data monthly.

## Ranked pairings

1. **Render free web service + Neon Free.** No card anywhere. Render runs the existing Dockerfile unchanged, auto-deploys from `main`, gives `https://<name>.onrender.com`. Neon is permanent, no card, publicly trusted TLS so `DATABASE_URL` works as copied. Caveats: 15-minute spin-down and ~1 minute cold start (open the app before the first race and keep a phone polling); 0.1 CPU; and **Render's 5 GB/month bandwidth is the deciding risk** - going over without a card spins the service down for the rest of the month. Measure response size at rehearsal; adding `@fastify/compress` would cut JSON size several-fold if needed.
2. **Koyeb free instance + Neon Free.** Same "runs the Dockerfile unchanged" story with **100 GB/month bandwidth** and a 1-hour idle window instead of 15 minutes, so far more headroom. Cost: a card must be entered for verification (a hold that is cancelled; the free service is never charged), only Frankfurt or Washington D.C., one free instance per org, labelled not-for-production. If the owner is fine entering a card, this is the safer pick on limits.
3. **Vercel Hobby + Neon Free.** No card and no sleep problem, but needs the serverless packaging change above and fits only about 5 event days a month on invocations, plus the Hobby non-commercial clause. Only worth it if the first two fail.

Database fallback for any of these: if Neon's 5 GB monthly egress turns out to bind (DB-to-app bytes per poll are unmeasured), **Aiven Free** has no stated transfer cap and a dedicated 1 GB VM, at the cost of a CA-certificate tweak (or `sslmode=no-verify`), an unselectable region, and power-off-if-unused.

## Key caveats

- Set `HOST=0.0.0.0` on whichever host is chosen; the app defaults to `127.0.0.1`.
- Neon free compute suspends after 5 minutes idle; the first query then waits for wake-up (sub-second to a few seconds). Harmless during polling, noticeable on the first open of the day.
- Neon egress and Render bandwidth both depend on unmeasured response sizes; both providers suspend service (not delete data) when exceeded, which would be bad mid-event.
- Free-tier terms move: Render's bandwidth dropped to 5 GB with the 2026 workspace plans, Fly.io and Railway removed free tiers. Re-check before each season.

## Sources

- [Render free] https://render.com/docs/free
- [Render compute] https://render.com/docs/compute-plans
- [Render bandwidth] https://render.com/docs/outbound-bandwidth
- [Render deploys] https://render.com/docs/deploys
- [Render Postgres] https://render.com/docs/postgresql-creating-connecting
- [Koyeb instances] https://www.koyeb.com/docs/reference/instances
- [Koyeb FAQ] https://www.koyeb.com/docs/faqs/pricing
- [Koyeb git] https://www.koyeb.com/docs/build-and-deploy/deploy-with-git
- [Koyeb databases] https://www.koyeb.com/docs/databases
- [Vercel Hobby] https://vercel.com/docs/plans/hobby
- [Vercel Fastify] https://vercel.com/docs/frameworks/backend/fastify
- [GCP free] https://docs.cloud.google.com/free/docs/free-cloud-features
- [Cloud Run CD] https://docs.cloud.google.com/run/docs/continuous-deployment
- [Fly pricing] https://docs.fly.io/about/pricing
- [Railway trial] https://docs.railway.com/reference/pricing/free-trial
- [Railway plans] https://docs.railway.com/reference/pricing/plans
- [Northflank pricing] https://northflank.com/pricing
- [Northflank billing] https://northflank.com/docs/v1/application/billing/pricing-on-northflank
- [CF Containers] https://developers.cloudflare.com/containers/pricing/
- [CF limits] https://developers.cloudflare.com/workers/platform/limits/
- [Neon pricing] https://neon.com/pricing
- [Neon pooling] https://neon.com/docs/connect/connection-pooling
- [Neon TLS] https://neon.com/docs/connect/connect-securely
- [Supabase pricing] https://supabase.com/pricing
- [Supabase compute] https://supabase.com/docs/guides/platform/compute-and-disk
- [Supabase connect] https://supabase.com/docs/guides/database/connecting-to-postgres
- [Supabase SSL] https://supabase.com/docs/guides/platform/ssl-enforcement
- [Aiven pricing] https://aiven.io/pricing?product=pg
- [Aiven free] https://aiven.io/docs/platform/concepts/free-plan
- [Aiven node] https://aiven.io/docs/products/postgresql/howto/connect-node
- [pg-connection-string] https://github.com/brianc/node-postgres/blob/master/packages/pg-connection-string/README.md
