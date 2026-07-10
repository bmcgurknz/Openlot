# Hosting & distribution

Procore OpenLot ships in two editions from one codebase. Pick per audience.

| | Static edition | Server edition |
|---|---|---|
| What runs | The entire app + conformance engine **in the browser** | Node API + PostgreSQL + web UI |
| Customer data | Stays on the customer's device (browser storage + JSON backups) — never touches your host | In the deployment's PostgreSQL |
| Procore | Manual/CSV evidence entry | Live: OAuth, webhooks, auto-linking |
| Hosting | Any static host: GitHub Pages, Netlify, S3, a WordPress page… | Docker on a VM/container platform |
| Scaling | **One hosted copy serves unlimited customers** (it's just files) | One deployment per customer company |
| Cost to serve | ~zero | VM + database per deployment |

## Static edition — give it to everyone

Build once:

```bash
cd web && npm install && npm run build:static
```

`web/dist-static/index.html` is the whole product in **one self-contained
file** — all code and styles inlined — so it runs from a double-click on
any computer (no web server, no install), from a USB stick, as an email
attachment, or uploaded to any URL or subfolder. (The inlining matters:
browsers block multi-file JavaScript modules opened from a local folder,
so a single file is the only build that works offline by double-click.) Each user's register persists in
their own browser; the **Your data** panel gives them JSON backup/restore,
lot-register CSV import, and a sample project.

**GitHub Pages (recommended, free, automatic).** The included workflow
(`.github/workflows/pages.yml`) deploys on every push to `main`. One-time
setup: repository → Settings → Pages → Source: *GitHub Actions*. Your
customers' URL is `https://<org>.github.io/<repo>/`.

**Netlify / Vercel / Cloudflare Pages.** Point at the repo; build command
`cd web && npm install && npm run build:static`, publish directory
`web/dist-static`.

**S3 / Azure Static Web Apps / any web server.** Upload the contents of
`web/dist-static/`. No rewrites needed — routing is hash-based.

**WordPress.** Two options. (a) *Embed:* host the static build anywhere
above and add an iframe block to a page:
`<iframe src="https://your-org.github.io/procore-openlot/" style="width:100%;height:90vh;border:0"></iframe>`.
(b) *Self-host:* upload `dist-static/` to `wp-content/uploads/openlot/` via
SFTP or a file-manager plugin and link to
`https://yoursite.com/wp-content/uploads/openlot/index.html`.

**SharePoint / intranet.** Upload the folder to a document library that
allows HTML rendering, or serve it from an IIS virtual directory.

### What customers must understand (put this in your handover)

- Data lives **in the browser profile on that device**. Clearing site data
  clears the register. The Your data panel's JSON backup is the safety net —
  make weekly backups part of the QA routine, stored with project records.
- Different device or browser = different (empty) register until a backup
  is restored. There is no sync in this edition.
- Conformed/closed statuses are never importable from CSV — evidence must
  be recorded, keeping the ATS 1120 gate honest.
- Browser storage comfortably holds tens of thousands of lots (a lot is a
  few hundred bytes), far beyond a single project's register.

## Server edition — for Procore-connected customers

Unchanged: `docker compose up -d --build` per customer company (see
[installation.md](installation.md)). Suits customers who want live webhook
linking, a shared team register, and PostgreSQL-grade durability. Scale by
deployment: a $10–20/month VM per customer is the honest current model.

## The road to true multi-tenant SaaS (stated plainly)

Serving many companies from **one** server deployment requires work that is
deliberately not faked here: per-tenant authentication and authorisation
(OIDC + RBAC, roadmap 1.3), tenant isolation in the schema (tenant_id on
every table + row-level security), per-tenant Procore OAuth apps and
webhook routing, rate limiting, billing, and a data-processing agreement
story. The repository pattern and the tenant-agnostic domain engine mean
none of the business logic changes — it is an infrastructure and security
project, not a rewrite. Until then: static edition for scale, server
edition for depth.
