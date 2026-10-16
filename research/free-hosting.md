# Free hosting for the Running Zone server and Postgres

Research for GitHub issue #57: "Which free hosts can run the Running Zone server and Postgres for 30 phones at once?"

Sources were read on 16 October 2026. Every claim links to the official page it came from. Claims marked **(unconfirmed)** could not be confirmed from a primary source. Claims marked **(inferred)** are my own reasoning from the cited facts plus this repo's code.

## What the app needs

- One long-running Node 22 Fastify 5 process (`npm start`, or the repo `Dockerfile`: node:22-alpine, `EXPOSE 3000`).
- `pg` 8 with one `pg.Pool({connectionString: DATABASE_URL})` (`src/server/storage.ts`). The pool's default maximum is 10 connections ([node-postgres Pool docs](https://node-postgres.com/apis/pool)).
- Each write runs in its own transaction on a checked-out client. Two routes take `pg_advisory_xact_lock(23001)` (`src/server/access/routes.ts`, `src/server/day/reset.ts`). The code uses no named prepared statements, no session `SET`, no `LISTEN`/`NOTIFY` and no session-level advisory locks (checked by grep).
- Creates its own tables on startup. Env: `DATABASE_URL`, `OWNER_PASSWORD`, `PORT`, `HOST=0.0.0.0`, `NODE_ENV=production`. Health check `/api/health`. The PWA service worker needs HTTPS.

### The load

30 phones x 1 request every 5 s = **6 requests/s**. Over an 8-hour day that is 6 x 28,800 = **172,800 requests per event day**. There are only a handful of event days a year, with long idle gaps. So the limits that matter are: per-month request caps, monthly bandwidth, how long data survives an idle gap, and whether the host sleeps mid-event. The app is idle most of the year, so a host that sleeps when idle is fine as long as polling keeps it awake during the event.

Bandwidth depends on response size, which I did not measure. The server does not compress responses (no compression plugin in `src/server`). Rule of thumb: 172,800 responses x 10 KB is about 1.7 GB per event day.

### Pooler and advisory locks

`pg_advisory_xact_lock` is released at the end of the transaction, and a transaction-mode pooler keeps one server connection for the whole transaction. So a transaction-mode pooler does not break this app **(inferred)**. Neon's PgBouncer docs list only *session-level* advisory locks, session `SET`/`RESET`, `LISTEN`/`NOTIFY` and SQL-level `PREPARE` as unsupported, and say protocol-level prepared statements still work ([Neon connection pooling](https://neon.com/docs/connect/connection-pooling)). This app uses none of the unsupported features. A direct (unpooled) connection is still the simplest choice for a single long-running server.

### How `pg` reads `sslmode` from the URL

The pg-connection-string README ([source](https://github.com/brianc/node-postgres/blob/master/packages/pg-connection-string/README.md)) says that by default `sslmode=prefer`, `require`, `verify-ca` and `verify-full` all set `ssl` to `true`. `sslmode=no-verify` sets `{ rejectUnauthorized: false }`, and `uselibpqcompat=true` switches to libpq meanings. The node-postgres SSL page says an `sslmode` in the URL replaces any `ssl` object passed in code ([node-postgres SSL](https://node-postgres.com/features/ssl)).

So in `pg` 8, `?sslmode=require` means **full certificate verification**. This is stricter than libpq's `require` **(inferred: `ssl: true` uses Node's TLS defaults, which verify the certificate)**. It works without code changes only when the provider's certificate chains to a public CA:

- **Neon:** uses Let's Encrypt (ISRG Root X1), so `sslmode=require` works from the URL alone ([Neon secure connections](https://neon.com/docs/connect/connect-securely)).
- **Providers with their own CA** (Aiven, Supabase, Render internal): verification will likely fail with a self-signed-chain error. The fix is `sslrootcert=<path>`, `sslmode=no-verify`, or `uselibpqcompat=true&sslmode=require` **(inferred, not tested)**.

## App hosts

### Render (free web service)

- **Runs as is:** Yes. It builds from a `Dockerfile` in the repo or from Node buildpacks ([Render deploys](https://render.com/docs/deploys)). The pg pool stays alive while the service is awake.
- **Free limits** ([Render free](https://render.com/docs/free), [pricing](https://render.com/pricing)):
  - Compute: 512 MB RAM, "less than 1 CPU". 750 free instance hours per workspace per month, and sleeping services use none.
  - Sleep: spins down after 15 minutes with no inbound traffic. Waking takes about one minute, and browsers see a loading page meanwhile.
  - Bandwidth: 5 GB included per month on the free workspace plan. Without a payment method, going over suspends all free services until the month ends.
  - Other: single instance, ephemeral disk, may restart at any time.
- **Card:** The docs only mention a payment method for overages **(unconfirmed that signup needs no card)**.
- **Auto-deploy:** Yes. It is on by default ("On Commit") for the linked branch ([Render deploys](https://render.com/docs/deploys)). The free address is `*.onrender.com` with automatic TLS ([pricing](https://render.com/pricing)).
- **Fits 30 phones?** Yes on hours and CPU. Bandwidth is the limit to watch: 5 GB a month allows about 29 KB per response for one event day, or less if there are several event days in a month (inferred). Open the app about a minute before the event so the first phone doesn't hit the cold start. After that, polling keeps it awake.

### Koyeb (free instance)

- **Runs as is:** Yes. It is a normal web service that builds from Git or a Dockerfile, and auto-deploys "each time you push or merge changes to your production branch" ([Koyeb build and deploy](https://www.koyeb.com/docs/build-and-deploy)).
- **Free limits** ([Koyeb instances](https://www.koyeb.com/docs/reference/instances), [scale to zero](https://www.koyeb.com/docs/run-and-scale/scale-to-zero)):
  - One free instance per organization: 512 MB RAM, 0.1 vCPU, 2 GB SSD.
  - Regions: Frankfurt or Washington, D.C. only.
  - Sleep: scales to zero after 1 hour without traffic, and this cannot be changed. Waking from deep sleep takes 1 to 5 s. The docs also say HTTP/2 requests cannot wake a sleeping service (scale to zero page).
  - Bandwidth: "We provide 100GB of outbound bandwidth per month for free" ([Koyeb pricing FAQ](https://www.koyeb.com/docs/faqs/pricing)), 20 times Render's 5 GB.
- **Card:** Required. The pricing FAQ says "We require a credit card to prevent fraud and abuse" and places a $29 pre-authorization hold, which is then cancelled ([Koyeb pricing FAQ](https://www.koyeb.com/docs/faqs/pricing)). It also says "You will never be charged when using the free web Service".
- **Free Postgres:** 5 hours of compute per month and 1 GB ([Koyeb databases](https://www.koyeb.com/docs/databases)). One 8-hour event day uses more than that, so Koyeb Postgres is ruled out.
- **Fits 30 phones?** Probably, with plenty of bandwidth headroom. Fastify on 0.1 vCPU at 6 requests/s should cope, but I did not load-test it **(unconfirmed)**. The current pricing page no longer lists the free web instance, only a free Postgres ([Koyeb pricing](https://www.koyeb.com/pricing)), though the docs and FAQ still describe it.

### Google Cloud Run

- **Runs as is:** Yes. It runs the container, and an instance handles many concurrent requests, so the module-level pg pool is reused across requests ([Cloud Run pricing](https://cloud.google.com/run/pricing)). With request-based billing, CPU is only allocated while requests are in flight. Idle pool sockets survive between requests, but there is no background work **(inferred)**.
- **Free limits** (request-based billing, per billing account per month) ([Cloud Run pricing](https://cloud.google.com/run/pricing), [Free Tier](https://docs.cloud.google.com/free/docs/free-cloud-features)):
  - Compute: 180,000 vCPU-seconds, 360,000 GiB-seconds and 2 million requests.
  - Egress: 1 GB per month from North America.
  - Billing time is rounded up to the nearest 100 ms.
- **Card:** "A Google Cloud billing account is required to access the Google Cloud Free Tier" ([Free Tier](https://docs.cloud.google.com/free/docs/free-cloud-features)). Self-serve billing accounts charge "the payment instrument on file" ([billing accounts](https://docs.cloud.google.com/billing/docs/how-to/manage-billing-account)). So a card is on file, but there is no charge while usage stays inside the free tier. There is no hard spending cap **(unconfirmed; budgets only alert)**.
- **Auto-deploy:** Yes. Continuous deployment from a GitHub branch through a Cloud Build trigger, with a "Dockerfile" build type ([Cloud Run continuous deployment](https://docs.cloud.google.com/run/docs/continuous-deployment)). Cloud Build gives 2,500 free build-minutes per month on e2-standard-2 ([Cloud Build pricing](https://cloud.google.com/build/pricing)). The image is stored in Artifact Registry, whose free storage I did not confirm **(unconfirmed)**. The free address is `*.run.app` with HTTPS.
- **Sleep:** Scales to zero when idle. Cold start time is **(unconfirmed)**.
- **Fits 30 phones?** Yes. Worst case, billed instance time is the full 28,800 s per event day: 28,800 vCPU-s with 1 vCPU, and 14,400 GiB-s with 512 MiB. That allows about 6 full event days a month inside the free tier. Requests (172,800 per day) allow about 11 event days (inferred). The real constraint is 1 GB of egress a month, which is tighter than Render's 5 GB.

### Vercel (Hobby)

- **Runs as is:** Partly. Fastify deploys "with zero configuration" as **a single Vercel Function** on Fluid compute ([Fastify on Vercel](https://vercel.com/docs/frameworks/backend/fastify)). One function instance serves many concurrent invocations and keeps module state, so the pg pool is reused while an instance is alive ([Fluid compute](https://vercel.com/docs/fluid-compute)). Per-request transactions and `pg_advisory_xact_lock` work unchanged, because each lock lives inside one request's transaction (inferred).
  - It is not a long-running server. After all requests finish, the instance is paused ([Fluid compute pricing](https://vercel.com/docs/functions/usage-and-pricing)), and the Hobby maximum duration is 300 s.
  - The entrypoint must be one of the detected file names (`src/server.ts`, `server.ts`, `index.ts` and so on), and startup table creation would run on each cold start (inferred).
  - Container images can also run as Vercel Functions, but in the same per-request model ([Docker on Vercel](https://vercel.com/kb/guide/does-vercel-support-docker-deployments)). Vercel Daemons run Dockerfiles continuously but "don't receive traffic" ([Vercel Daemons](https://vercel.com/kb/guide/vercel-daemons)).
- **Free limits per month** ([Hobby plan](https://vercel.com/docs/plans/hobby)):
  - 1,000,000 function invocations, 4 hours of Active CPU, 360 GB-hours of provisioned memory.
  - 100 GB Fast Data Transfer and 1,000,000 CDN requests.
  - Going over usually means waiting 30 days.
  - Hobby is "non-commercial, personal use only".
- **Card:** Not needed for Hobby. The plan page only asks for card details when upgrading ([Hobby plan](https://vercel.com/docs/plans/hobby)).
- **Auto-deploy:** Yes, from a connected Git repository ([Fastify on Vercel](https://vercel.com/docs/frameworks/backend/fastify)). The free address is `*.vercel.app` with HTTPS.
- **Fits 30 phones?** Only for a few event days a month. 172,800 invocations per day means the 1M cap is hit after about 5 event days in a 30-day window, and sooner if the PWA's static files go through the function (inferred). Being locked out for 30 days if an event goes over is a real risk. The non-commercial clause also needs checking against how the app is used.

### Cloudflare (Workers and Containers)

- **Containers:** Not available on the free plan. Containers are included only with the $5/month Workers Paid plan ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)).
- **Workers Free:** 100,000 requests per day and 10 ms of CPU per invocation ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)). One event day is 172,800 requests, so it **does not fit**.
- **Rewrite needed:** The Fastify server would have to become a Worker `fetch` handler that reaches Postgres through Hyperdrive. Hyperdrive is on the free plan, but only for 100,000 queries per day ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)). It pools in transaction mode and `RESET`s connections between transactions ([How Hyperdrive works](https://developers.cloudflare.com/hyperdrive/configuration/how-hyperdrive-works/)). `pg_advisory_xact_lock` inside one transaction would still work (inferred), but the request caps rule it out anyway.

### Fly.io

- No free tier: "New organizations don't have a free tier or a monthly free usage allowance." The trial lasts up to 2 hours of Machine runtime or 7 days, and then a credit card is required ([Fly pricing](https://docs.fly.io/about/pricing)). **Ruled out.**

### Railway

- **Trial:** A one-time $5 credit that expires after 30 days ([Railway free trial](https://docs.railway.com/reference/pricing/free-trial)).
- **Free plan:** $1 of usage credit per month that does not roll over. Up to 1 vCPU and 0.5 GB per service, 1 project, 3 services, 500 MB volume ([Railway pricing](https://railway.com/pricing), [plans](https://docs.railway.com/reference/pricing/plans)).
- **Prices:** RAM is $10 per GB per month and egress $0.05 per GB ([plans](https://docs.railway.com/reference/pricing/plans)).
- **Sleep:** Optional "Serverless" mode sleeps a service after 5 to 10 minutes with no *outbound* traffic. Open database connections count as outbound traffic, and the first request after sleep may return a 502 ([App sleeping](https://docs.railway.com/reference/app-sleeping)).
- **Card:** Whether the Free plan needs one is **(unconfirmed)**.
- **Fits?** Runs as is, but **$1 a month is too little for an always-on Postgres**. 0.1 GB RAM for a full month already costs about $1 (inferred). The app's pg pool keeps connections open, which stops the app from sleeping (inferred). Not recommended.

### Northflank (Developer Sandbox)

- **Free limits:** 2 free services, 2 cron jobs and 1 free database, with "Always-on-compute, no sleeping" ([Northflank pricing](https://northflank.com/pricing)). The free plan's CPU and RAM sizes are not stated on official pages **(unconfirmed)**.
- **Auto-deploy:** CI/CD is on by default and builds a Dockerfile from the linked branch. Public ports get Let's Encrypt TLS on a generated hostname ([Northflank build and deploy](https://northflank.com/docs/v1/application/getting-started/build-and-deploy-your-code)).
- **Card:** Required. "All users must add a payment method to start creating resources on Northflank, regardless of plan selection" ([Northflank billing](https://northflank.com/docs/v1/application/billing/pricing-on-northflank)).
- **Fits?** Probably, and it is the only always-on free option. But the sandbox size and the free database's limits are unconfirmed, so it needs a real trial before relying on it.

## Postgres providers

### Neon (Free)

- **Limits** ([Neon pricing](https://neon.com/pricing)):
  - Storage: 1 GB per project.
  - Compute: 100 CU-hours per project per month. When they run out, compute pauses until the next period.
  - Scale to zero after 5 minutes idle, and this cannot be turned off.
  - Egress: 5 GB per project.
  - "No credit card required", and the plan is "permanent (not a trial)". The page mentions no inactivity deletion, and says the limits never delete data.
- **Connections:** A 0.25 CU compute allows 104 direct connections (97 usable). The `-pooler` endpoint is PgBouncer in transaction mode and accepts up to 10,000 clients ([Neon connection pooling](https://neon.com/docs/connect/connection-pooling)).
- **SSL:** Required ("Neon rejects connections that do not use SSL/TLS"). The certificate chains to Let's Encrypt, so `pg` works from `?sslmode=require` alone ([Neon secure connections](https://neon.com/docs/connect/connect-securely)).
- **Fits?** Yes, easily. An event day at 0.25 CU is about 2 CU-hours (inferred). The pg pool's 10 connections are well under the limit. Use the direct (non-pooler) URL. The transaction-mode pooler would also work with this code (inferred, see the pooler section above). Wake-up time after scale to zero is **(unconfirmed)**, but polling keeps the compute awake all day. The 5 GB/month egress (database to app) depends on query result sizes, which I did not measure, so measure it at the rehearsal too.

### Supabase (Free)

- **Limits** ([Supabase pricing](https://supabase.com/pricing), [compute](https://supabase.com/docs/guides/platform/compute-and-disk)):
  - Storage: 500 MB database. Egress: 5 GB. 2 active projects.
  - Compute: Nano (shared CPU, up to 0.5 GB RAM), 60 direct connections, 200 pooler clients.
  - **Free projects pause after 1 week of inactivity.** A paused project can be restored in Studio within a 1-year window ([Supabase upgrading](https://supabase.com/docs/guides/platform/upgrading)).
- **Card:** Not stated **(unconfirmed)**.
- **Connections:** Direct connections are IPv6 only unless you pay for the IPv4 add-on. For IPv4-only servers, the docs say to use the session-mode pooler on port 5432. The transaction pooler (port 6543) does not support prepared statements ([Supabase connecting](https://supabase.com/docs/guides/database/connecting-to-postgres)).
- **SSL:** The docs recommend `require`, and full verification needs the downloadable root certificate (same page). With `pg`'s strict meaning of `require`, the connection likely fails until you add `sslrootcert` or `uselibpqcompat=true` **(inferred)**.
- **Fits?** Yes on load. But because events are months apart, the project will be paused before almost every event and must be restored by hand in advance.

### Aiven (Free PostgreSQL)

- **Limits** ([Aiven free plan](https://aiven.io/docs/platform/concepts/free-plan), [PG free tier](https://aiven.io/docs/products/postgresql/concepts/pg-free-tier)):
  - 1 CPU, 1 GB RAM, 1 GB disk.
  - `max_connections` is 20, with no connection pooling.
  - "You don't need a credit card" and the plan is free indefinitely.
  - Aiven may power off free services with no activity (after notifying you), and may change the region or configuration at any time.
- **SSL:** Not stated on these pages **(unconfirmed)**. Aiven uses a project CA **(unconfirmed)**, so `pg` with `sslmode=require` would likely need `sslrootcert` (inferred).
- **Fits?** Yes on load. The pool's default of 10 connections fits under 20, but leaves little room for a second instance during a deploy. The power-off between events means checking it before each event.

### Render Postgres (Free)

- **Limits** ([Render free](https://render.com/docs/free)): 1 GB, one free database per workspace, no backups. **It expires 30 days after creation** and is deleted after a 14-day grace period.
- **Connections:** Up to 100 connections under 8 GB RAM. The internal URL has optional TLS with self-signed certificates. The external URL always uses TLS and rejects `sslmode=disable` ([Render Postgres connecting](https://render.com/docs/postgresql-creating-connecting)).
- **Fits?** **No.** The 30-day expiry means rebuilding the database before nearly every event and losing all history.

### Koyeb Postgres (Free)

- 5 hours of compute a month ([Koyeb databases](https://www.koyeb.com/docs/databases)). **It does not last one event day.**

## Summary table

| App host | Runs the server as is | Card needed | Auto-deploy from `main` | Sleeps when idle | Fits one 8 h event day |
|---|---|---|---|---|---|
| Render free | Yes (Dockerfile) | Not confirmed | Yes, on by default | 15 min, about 1 min to wake | Yes; 5 GB/month bandwidth is the limit |
| Koyeb free | Yes | Yes ($29 hold, no charge) | Yes | 1 h, 1 to 5 s to wake | Probably (0.1 vCPU); 100 GB/month bandwidth |
| Cloud Run | Yes (container) | Billing account with payment method | Yes (Cloud Build trigger) | Scales to zero | Yes; 1 GB/month egress is the limit |
| Northflank sandbox | Yes | Yes | Yes | Never | Probably (size not confirmed) |
| Vercel Hobby | As one function, not a server | No | Yes | Paused between requests | Yes, but 1M invocations/month is about 5 days |
| Cloudflare Workers Free | No (rewrite needed) | No | n/a | n/a | No (100k requests/day) |
| Railway free | Yes | Not confirmed | Not checked | Optional | $1/month credit too small |
| Fly.io | n/a | Yes | n/a | n/a | No free tier |

| Database | Storage | Expiry or pause | Card | SSL with `pg` from URL alone |
|---|---|---|---|---|
| Neon | 1 GB | None (permanent) | No | Yes (Let's Encrypt) |
| Supabase | 500 MB | Pauses after 1 week idle, manual restore | Not confirmed | Likely needs `sslrootcert` (inferred) |
| Aiven | 1 GB, 20 connections | May be powered off when idle | No | Likely needs `sslrootcert` (inferred) |
| Render Postgres | 1 GB | Deleted after 30 days + 14 | Not confirmed | Internal URL: no TLS needed |
| Koyeb Postgres | 1 GB | 5 compute hours/month | Yes | n/a |

## Ranked pairings

1. **Render free web service + Neon Free.**
   - Why: no card needed for Neon, and none mentioned for Render. Deploys the existing `Dockerfile` with auto-deploy on by default. Free `onrender.com` HTTPS. Neon never expires or deletes data between events, and `DATABASE_URL=...?sslmode=require` works with `pg` unchanged.
   - Caveats: a cold start of about a minute on the first request after 15 minutes idle, so open it before the event. 5 GB/month bandwidth with suspension on overage, so measure the poll response size and consider adding compression. Single instance that "may be restarted at any time".
2. **Koyeb free instance + Neon Free.**
   - Why: always on during the event once awake (1 h idle timeout), quick 1 to 5 s wake-up, auto-deploy from Git, and 100 GB/month bandwidth, far more headroom than Render. If entering a card is acceptable, this is the safer pick on limits.
   - Caveats: a card and a $29 pre-authorization hold. Only 0.1 vCPU, only the Frankfurt or Washington regions. The free instance is missing from the current pricing page, so check it still exists at signup.
3. **Google Cloud Run + Neon Free.**
   - Why: the most generous compute and request limits, scale to zero, fast scaling, `run.app` HTTPS, and Cloud Build deploys from `main`.
   - Caveats: needs a billing account with a payment method and has no hard spending cap, so overages would be charged. Only 1 GB/month of egress from North America is free, which allows only about 6 KB per response for one event day (inferred). More setup than Render.

Runners-up: **Northflank** (always on, but a card is required and the free sizes are unconfirmed). **Vercel Hobby** (no card, but the per-month invocation cap fits only about 5 event days, Hobby is non-commercial only, and the server runs as a function). For the database, **Supabase** or **Aiven** work on load, but both go idle between events and need manual restore or checking, and likely need a CA file for `pg`.

Not viable for free: Cloudflare (Containers are paid, and Workers Free caps at 100k requests/day), Fly.io (no free tier), Railway ($1/month credit), Render Postgres (30-day expiry), Koyeb Postgres (5 hours/month).
