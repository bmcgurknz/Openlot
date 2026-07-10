# Getting OpenLot onto the Procore Marketplace — the whole path, explained simply

Think of the Procore Marketplace like a farmers' market. Anyone can bake a
pie at home, but before you're allowed to sell it at the market, someone
checks that your kitchen is clean, at least one neighbor has tried a
slice and liked it, and your table has a sign saying what's in the pie
and who to call if something's wrong. This guide walks through every
step of getting OpenLot from "code on a laptop" to "pie on the table,"
in order, with no step skipped.

Sources for the official requirements: [Procore's Marketplace
requirements page](https://developers.procore.com/documentation/marketplace-requirements),
[the approval checklist](https://developers.procore.com/documentation/marketplace-checklist),
and [listing guidelines](https://developers.procore.com/documentation/marketplace-listing-guidelines).

---

## Step 0 — Understand the big picture

**Analogy:** You don't submit a pie to the farmers' market on day one of
owning an oven. There's a whole path: bake it, taste it yourself, have a
friend taste it, write the ingredients label, *then* ask the market
manager if you can have a table.

Procore's path has the same shape:

1. Build the app (done — that's everything from earlier in this project).
2. Prove it actually works, on real Procore data, in your own test
   account.
3. Get one real customer to try it and like it ("beta customer").
4. Write the plain-English instructions and support info a stranger
   would need.
5. Fill out a listing (like a menu card): name, picture, description,
   category.
6. Submit it. Procore's team checks it. They either approve it or tell
   you what to fix.
7. Once listed, keep it working — Procore can pull a listing down if it
   breaks or goes unmaintained.

Everything below is one of those steps, unpacked.

---

## Step 1 — Finish proving the code actually runs (not just reads correctly)

**Analogy:** You've written out the recipe perfectly on paper. But you've
never actually turned on the oven and baked it. A recipe that *looks*
right on paper can still burn the pie.

**Where OpenLot stands:** Every file in this project has been read
carefully and cross-checked by hand, and the Procore API paths and field
names have been checked against Procore's real API specification. But
the commands that actually compile and run the code —
`npm install`, `npm run typecheck`, `npm test`, `npm run build` — have
never been executed, because Node.js isn't installed on this computer.

**What you actually need to do:**
1. Install [Node.js](https://nodejs.org) (the LTS version) on a computer
   that has this project.
2. Open a terminal in the project folder and run, in order:
   `npm install`, then `npm run typecheck`, then `npm test`, then
   `cd web && npm install && npm run build`.
3. Fix anything that turns red. There may be small things a
   never-actually-compiled codebase surfaces — missing semicolons,
   a type that doesn't quite line up — that reading code by eye can miss.

**Why this matters:** Procore's checklist requires the app to "pass
functional testing with no major bugs or blockers." You cannot know that
is true until it has actually run.

---

## Step 2 — Put OpenLot somewhere on the internet Procore can actually reach

**Analogy:** GitHub is a filing cabinet. It stores the blueprints for
your bakery beautifully — every recipe, organized, with a full history
of every change. But nobody can walk in and buy a pie from a filing
cabinet. Procore needs an actual, open storefront with a street address
(a real `https://` web address) it can send customers to. Pushing code
to GitHub is necessary, but it is not the storefront — it's step one of
two.

**Why this trips people up:** "upload it to GitHub" feels like the
finish line because it's the last command you type, but GitHub only
stores code — it doesn't run it. Procore's embedded app loads inside an
iframe pointed at a **Launch URL**, and that URL has to be a real,
live, publicly reachable server that's actually executing OpenLot's
code right now, 24/7 — not a repository sitting on GitHub.

**What you actually need to do:**
1. Push the code to GitHub first regardless — good practice, and it's
   also what most hosting providers pull from directly.
2. Pick somewhere to actually *run* it. OpenLot is a Node.js server plus
   a Postgres database (not a static site — that's only the separate,
   Procore-disconnected static edition), and this repo already has a
   working `docker/Dockerfile` and `docker-compose.yml`. Two realistic
   paths:
   - **Easiest for a first test:** a platform that deploys straight from
     a GitHub repo and gives you a database and a live `https://` URL
     with almost no setup — Render or Railway are the common choices
     here, and both can build this repo's existing Dockerfile as-is.
     Connect your GitHub repo, add one Postgres database, and it hands
     you a URL like `https://openlot.onrender.com`.
   - **More control, more setup:** rent a small cloud server (a "VPS" —
     DigitalOcean, Linode, an AWS EC2 instance) and run
     `docker compose up -d --build` yourself, per the README's
     "Production deployment (Docker)" section. You'd also need to put a
     TLS-terminating proxy (Caddy or nginx) in front of it for HTTPS —
     the docker-compose file's own top comment says this explicitly.
3. Once it's live, set the real environment variables on that host —
   `APP_BASE_URL` (the exact `https://...` address you were just given),
   `PROCORE_CLIENT_ID`/`PROCORE_CLIENT_SECRET` (from your Developer
   Portal app registration), `DATABASE_URL`, `TOKEN_ENCRYPTION_KEY`, and
   `WEBHOOK_SHARED_SECRET` — see `.env.example` for the full list.
4. Run the database migrations once against that live database (the
   commands are in `docs/installation.md`).
5. In the Procore Developer Portal, go back to the embedded app entry
   you configured in the Configuration Builder and set the **Launch
   URL** to that real address (e.g. `https://openlot.onrender.com/`).
6. One easy-to-miss detail: your Procore app's OAuth settings also need
   `{that same address}/auth/procore/callback` added as an **allowed
   redirect URI** — Procore refuses to send a login back to a URL it
   wasn't told to expect, even if the Launch URL itself is right.

**Why this matters:** without this step, "Connect to Procore" and the
whole Reports dashboard have nowhere to actually run — Procore would be
pointing its iframe at nothing.

---

## Step 3 — Test it against a real Procore sandbox company

**Analogy:** Now that the oven works, bake the pie once in your own
kitchen before you serve it to anyone else. If something's off — too
salty, not cooked through — you want to find out privately, not at the
market stall.

**What you actually need to do:**
1. In the [Procore Developer Portal](https://developers.procore.com),
   your app registration includes a **Developer Sandbox** — a free,
   fake Procore company Procore gives every registered developer
   specifically for this kind of testing.
2. Connect OpenLot to that sandbox company (the OAuth flow already built
   in `/auth/procore` handles this — no new code needed).
3. Click through every feature: open a lot, walk it through the
   conformance rules, release a hold point, run a claim, open the new
   **Reports** tab and check Quality & Safety / Field Productivity /
   Project Controls all load.
4. This is also when you find out if any of the endpoint paths this
   session verified against Procore's specification actually behave
   differently in practice — a written specification and a live server
   can still disagree occasionally. `docs/reporting-app.md` §1 has the
   full list of what was checked.

**Why this matters:** this is the only step where you find real bugs
instead of theoretical ones. Skipping it means the first person to find
a bug is a paying customer, not you.

---

## Step 4 — Confirm the "Connect to Procore" screen actually looks right

**Analogy:** Imagine your pie's box has a little plastic window so
people can see the pie before buying. You should look through that
window yourself before anyone else does, to make sure it's not upside
down.

**What you actually need to do:**
1. In the Developer Portal, use the **Configuration Builder** to add
   an embedded app entry — pick **Full Screen** for the main
   Reports/register experience (a **Side Panel** entry is optional, for
   a narrower always-visible view).
2. Set the **Launch URL** to wherever OpenLot is actually hosted
   (e.g. `https://openlot.yourcompany.com/`, or
   `https://openlot.yourcompany.com/#/reports` if you want the Reports
   tab to open by default).
3. Save a version and get the **Sandbox App Version Key** — this is a
   special code that tells your sandbox company "install this
   in-progress version, not the public one."
4. Install that sandbox version in your sandbox company and click the
   app from inside Procore's own left-hand tool menu, exactly the way a
   real customer would. Confirm the "Connect to Procore" popup flow
   (`docs/reporting-app.md` §3) actually opens, completes, and closes
   itself.
5. Confirm the query parameter Procore's launch URL actually appends for
   the current project matches what `resolveProjectId()` in
   `web/src/App.tsx` expects (it currently assumes `?project_id=` —
   this is a guess that needs a real launch to confirm).

**Why this matters:** this is the one part of the whole build that
literally cannot be checked from code alone — it depends on how Procore
itself renders and launches the app, which only shows up inside a real
Procore session.

---

## Step 5 — Click through every "open in Procore" link once

**Analogy:** You've put little tags on the pie box that say "if you want
seconds, the bakery is two blocks that way." You should personally walk
those two blocks once to make sure the tag isn't pointing at a parking
lot.

**What you actually need to do:** In the Reports dashboard, click one
real Inspection, Incident, Punch Item, RFI, and Submittal link, and
compare the Procore page it lands on to the guessed URL pattern in
`WEB_ITEM_PATHS` (`src/procore/client.ts`). Fix any that land on the
wrong page — it's a one-line change per tool.

**Why this matters:** this is explicitly the one piece Procore's own API
specification cannot confirm, because a specification describes the
API, not the website's clickable links. Every other endpoint in this
project was checked against real Procore documentation this session —
this is the last unchecked piece.

---

## Step 6 — Check your app's permissions cover everything it asks for

**Analogy:** Imagine your recipe calls for six ingredients, but you only
bought four at the store. It won't bake right, and you won't find out
why until you're already halfway through mixing.

**What you actually need to do:** In the Developer Portal, open your
app's **Permissions** (sometimes called Scopes) section and confirm it
requests access to all of: Checklist Lists (Inspections), Observations,
Daily Log, Incidents, Punch List, RFIs, Submittals, and Budget. The
original app was likely only scoped for the first three — Incidents,
Punch List, RFIs, Submittals, and Budget were added later in this
project and are a good bet to be missing. If you add scopes after a
company has already connected, that company needs to reconnect
(redo the OAuth flow) for the new permission to take effect.

**Why this matters:** a missing scope doesn't cause a dramatic error —
it just makes that one tool's card in the Reports dashboard show a
quiet "couldn't load this" message, which is easy to miss during a quick
test.

---

## Step 7 — Write the plain-English instructions a stranger would need

**Analogy:** The market manager won't let you sell a pie with no
ingredients label. Somebody buying it needs to know what's in it and
who to call if they're allergic to something.

**What Procore actually requires:** "clear, step-by-step onboarding
instructions" and "accessible support documentation or support contact
information."

**What you actually need to do:** Write (or adapt from what already
exists in `docs/`) a short, customer-facing page — not a technical
document — that covers:
- What OpenLot does, in one paragraph, for someone who has never seen it.
- How to install it: click the listing, click "Install," approve the
  permissions Procore shows them.
- How to connect it the first time (the "Connect to Procore" button).
- Where to click to see the lot register vs. claims vs. reports.
- A support email or contact form.

This project already has `docs/user-guide.md` and `docs/installation.md`
— they're written for a technical audience installing the server
edition. The Marketplace listing needs a shorter, friendlier version of
the same information, written for the person who will actually click
around in it day to day.

**Why this matters:** Procore's reviewers check for this directly, and
customers abandon apps in the first five minutes if they can't figure
out what button to click.

---

## Step 8 — Find one real customer to try it (the "beta customer")

**Analogy:** Before the market manager lets your table onto the main
row, they want to hear from at least one person who's actually eaten
the pie and is still standing.

**What Procore actually requires:** "at least one (1) beta customer
prior to submission," and — ongoing, after you're listed — "at least
one (1) active customer using the app within the past 12 months."

**What you actually need to do:** Find one real Procore-using
construction company (could be your own company, a client, or a
friendly contact) willing to connect their real Procore account —
or their sandbox — and actually use the lot register and Reports
dashboard for a real project for a few weeks. Ask them directly: did
anything break, was anything confusing, did the conformance rules match
how their quality manager actually works.

**Why this matters:** this is a hard requirement, not a suggestion —
Procore's checklist will not approve a submission without it. It's also
just good practice: a stranger using your app for the first time finds
things you, as the builder, are blind to.

---

## Step 9 — Fill out the actual Marketplace listing

**Analogy:** This is the sign on the table at the market: a name, a
picture, a short description of what's inside, and a price (or "free").

**What you actually need to do**, inside the Developer Portal's listing
form:
- **App name and tagline** — "Procore OpenLot" and a one-line summary
  (you already have a good one: *"Lot management and
  conformance-to-claim gating for civil construction, aligned to
  ATS 1120."*).
- **Category** — likely Quality & Safety or Project Management; Procore
  will show you the list of categories to choose from.
- **Description** — a longer version of the README's opening paragraph.
- **Logo / icon** — the `brand/logo-mark.svg` file already made this
  session is exactly this; check the Developer Portal's exact size
  requirement (usually a square PNG, so you may need to export the SVG
  to PNG at their required dimensions) and the `brand/logo-wordmark-light.svg`
  works well as a listing header image.
- **Screenshots** — a few real screenshots of the register, a lot
  dossier, and the new Reports dashboard.
- **Support contact / URL** and, if you're collecting any data, a
  **privacy policy URL** — neither of these exist yet in this project
  and need to be written.
- **Pricing** — free, or a price; that's a business decision, not a
  technical one.

**Why this matters:** this is literally the page a customer sees before
they ever click Install — it needs to be accurate (Procore explicitly
checks that the listing matches what the app actually does) and kept up
to date afterward.

---

## Step 10 — Submit for review

**Analogy:** Now you actually hand the market manager a sample and wait
for them to taste it and check your paperwork.

**What actually happens:** Procore's team reviews the submission against
their checklist (production-ready, functional testing passes, has a
beta customer, listing is accurate, complies with their Partner Program
terms). They'll either approve it, or come back with specific things to
fix — this is normal and often takes more than one round.

**What you actually need to do:** submit through the Developer Portal
once Steps 1–8 are genuinely done, then respond to whatever feedback
comes back. Don't submit early hoping reviewers will catch what testing
should have caught — every round of back-and-forth adds real weeks.

---

## Step 11 — Stay listed (this doesn't end at approval)

**Analogy:** Getting a table at the market isn't a one-time badge — if
your pies start showing up moldy, the manager takes the table away.

**What Procore actually requires:** ongoing compliance. They monitor
listed apps and can remove ones that stop working, go unmaintained, or
lose their one active customer for 12 months.

**What you actually need to do:** keep an eye on the endpoint versions
this session verified (`docs/reporting-app.md` §1) — Procore updates
its API over time, and a path that's correct today can be deprecated
later. Keep the CHANGELOG current, and keep at least one real customer
connected and using it.

---

## The short version — where OpenLot actually stands right now

The app itself (Step 0's premise — the lot register, conformance engine,
claims, and reporting dashboard) is built. From there:

| Step | Status |
|---|---|
| 1. Prove it compiles/runs (`npm install/typecheck/test/build`) | **Done, 2026-07-10** — `npm install`, `npm run typecheck`, `npm test` (57/57 passed), `npm run build`, and `npm run build:static` all ran clean on a real machine. One real bug turned up and was fixed: `LotService.create()` was missing `createdAt`, which would have crashed every "create lot" call against Postgres (`created_at` is `NOT NULL`) — invisible in the in-memory demo/test path, which is exactly why this step exists |
| 2. Deploy it somewhere with a real `https://` address (GitHub alone doesn't do this) | Not done |
| 3. Test in a real Procore sandbox company | Not done |
| 4. Confirm the embedded-app launch inside Procore's UI | Not done |
| 5. Click-verify the `webUrl()` deep links | Not done |
| 6. Confirm OAuth scopes cover all 8 tools | Not done |
| 7. Write customer-facing onboarding/support docs | Not done |
| 8. Get one beta customer | Not done |
| 9. Fill out the Marketplace listing (logo is ready) | Partially ready — logo done, screenshots/privacy policy/support contact not done |
| 10. Submit | Not done |
| 11. Stay listed after approval | Ongoing, once you get there |

The honest bottleneck is now Step 2 — nothing after it can happen at all
until OpenLot is actually running somewhere Procore's iframe can reach,
not just compiled and sitting in a GitHub repository.
