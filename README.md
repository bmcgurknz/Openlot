# Procore OpenLot

**Lot management and conformance-to-claim gating for Procore, built for civil construction and aligned to ATS 1120 Quality Management Requirements.**

Procore is excellent at capturing civil quality records — ITP inspections, NCRs (observations), photos, daily-log quantities. What it doesn't have is the object those records hang off in every civil contract: **the lot**. Civil contractors bridge the gap with a spreadsheet lot register and a naming convention, which means no enforced lot status, no automated link between quality evidence and the register, and — the expensive part — no gate between conformance and the monthly progress claim.

Procore OpenLot supplies the missing layer on top of Procore's public REST API and webhooks:

- **A real lot register.** Lots with the `LOT-[WT]-[NNNN]` convention, descriptions carrying chainage/extent, spec references, cost codes, and quantities.
- **Automatic evidence linking.** Any Procore inspection, NCR, or daily-log quantity entry whose title or notes contain a lot ID is linked to that lot via webhooks — field crews keep working in Procore exactly as they do today. Zero new data entry on site.
- **A conformance engine.** A lot can only be marked *Conformed* when every linked ITP inspection has passed, zero NCRs are open, all test results are received and passing, and hold/witness points are released. Blockers are listed, not hidden.
- **ATS 1120 alignment.** Lot management, hold/witness point releases recorded against the Principal's authorised person, pavement-lot geo-referencing, payment-item traceability and claim substantiation follow Austroads ATS 1120 — clause-by-clause matrix in [docs/ats-1120-compliance.md](docs/ats-1120-compliance.md).
- **The conformance-to-claim gate.** Only conformed lots can enter a progress-claim period, and only once. The claim extract (CSV + printable substantiation report) is generated with the evidence trail behind it — principals' representatives certify faster when conformance substantiation arrives unasked.

## Who it's for

| Role | What they get |
|---|---|
| Project engineer | Live register instead of a Friday-night spreadsheet; blockers per lot; test tracking |
| Contract administrator | One-click list of claimable lots; double-claim prevention; substantiation report |
| Quality manager | Enforced status rules; audit trail; handover-ready conformance records |
| Superintendent / principal's rep | Substantiation attached to the claim instead of requested after it |

## Two editions, one codebase

| | Use it when |
|---|---|
| **Static edition** — the whole app runs in the browser; each customer's data stays on their device with JSON backup/restore and CSV register import. Host one copy on GitHub Pages / Netlify / S3 / a WordPress page and give the link to unlimited customers. | Distributing to customers at scale; no infrastructure per customer |
| **Server edition** — Node + PostgreSQL with live Procore integration (OAuth, webhooks, automatic evidence linking). | Procore-connected teams wanting a shared register |

Static build: `cd web && npm run build:static` → upload `web/dist-static/` anywhere (or push to `main` and let the included GitHub Pages workflow deploy it). Full options, WordPress embedding, and customer handover notes: [docs/hosting.md](docs/hosting.md).

## Quick start (demo mode — no Procore, no database)

```bash
git clone https://github.com/your-org/procore-openlot.git
cd openlot
npm install
npm run dev:demo      # works on Windows, macOS and Linux
# open http://localhost:4400 after building the UI, or run the UI dev server:
cd web && npm install && npm run dev   # http://localhost:5173
```

Demo mode loads a sample project — *Kestrel Ridge Stage 2*, a residential subdivision with earthworks, stormwater and pavement lots in various states — so you can walk the full lifecycle: open a lot → see blockers → pass tests → release the hold point → conform → claim.

## Production deployment (Docker)

```bash
cp .env.example .env       # fill in Procore OAuth app credentials + secrets
docker compose up -d --build
```

Then connect to Procore at `https://your-host/auth/procore` and register webhooks. Full walk-through: [docs/installation.md](docs/installation.md) and [docs/procore-setup.md](docs/procore-setup.md).

## Documentation

| | |
|---|---|
| Why this gap, and what else was considered | [docs/gap-analysis.md](docs/gap-analysis.md) |
| ATS 1120 compliance matrix | [docs/ats-1120-compliance.md](docs/ats-1120-compliance.md) |
| Executive summary | [docs/executive-summary.md](docs/executive-summary.md) |
| Product specification | [docs/product-specification.md](docs/product-specification.md) |
| Architecture | [docs/architecture.md](docs/architecture.md) |
| v1.3 enhancements (lot history, sorting, bulk import) | [docs/v1.3-enhancements.md](docs/v1.3-enhancements.md) |
| Reporting dashboard & Marketplace embedding | [docs/reporting-app.md](docs/reporting-app.md) |
| Publishing to the Procore Marketplace, step by step | [docs/marketplace-publishing-guide.md](docs/marketplace-publishing-guide.md) |
| Installation (server edition) | [docs/installation.md](docs/installation.md) |
| Hosting & distribution (static edition, GitHub Pages, WordPress) | [docs/hosting.md](docs/hosting.md) |
| Configuration | [docs/configuration.md](docs/configuration.md) |
| Procore setup (OAuth, permissions, webhooks) | [docs/procore-setup.md](docs/procore-setup.md) |
| User guide | [docs/user-guide.md](docs/user-guide.md) |
| Administrator guide | [docs/admin-guide.md](docs/admin-guide.md) |
| API reference | [docs/api-reference.md](docs/api-reference.md) |
| Data dictionary | [docs/data-dictionary.md](docs/data-dictionary.md) |
| Security | [docs/security.md](docs/security.md) |
| Testing | [docs/testing.md](docs/testing.md) |
| Deployment checklist | [docs/deployment-checklist.md](docs/deployment-checklist.md) |
| Backup & disaster recovery | [docs/backup-and-disaster-recovery.md](docs/backup-and-disaster-recovery.md) |
| Troubleshooting | [docs/troubleshooting.md](docs/troubleshooting.md) |
| Developer guide | [docs/developer-guide.md](docs/developer-guide.md) |
| Upgrade guide | [docs/upgrade-guide.md](docs/upgrade-guide.md) |

Procore Enterprise import files (ITP inspection templates, observation custom fields, civil cost codes) live in [/imports](imports/), sample datasets in [/examples](examples/), and sample outputs in [/exports](exports/).

## Project status

Version 1.4.0 — see [CHANGELOG.md](CHANGELOG.md) and [ROADMAP.md](ROADMAP.md). Contributions welcome: [CONTRIBUTING.md](CONTRIBUTING.md).

## What OpenLot is not

- Not a replacement for dedicated lot-QA platforms (CivilPro, CONQA) on authority mega-projects with electronic NATA test-request workflows — see the graduation criteria in the [gap analysis](docs/gap-analysis.md).
- Not an official Procore product release — it is a consulting/implementation tool that consumes only documented public APIs; verify endpoint versions against the [Procore API reference](https://developers.procore.com) when upgrading. Procore branding is used for internal alignment with the Procore UI.

## License

[MIT](LICENSE)
