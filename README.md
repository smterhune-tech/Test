# Relocation Expert Arizona

Real estate lead-gen site with a Flexmls Spark API IDX integration and a Follow Up Boss CRM webhook.

## Run locally

```
npm install
npm start
```

Serves the site + API at `http://localhost:3000`. Without `SPARK_API_KEY` / `FUB_API_KEY`, listings fall back to built-in mock data and leads are logged to `var/leads.log.jsonl` only — the site works out of the box with no credentials.

## Project layout

- `public/` — static assets served as-is: `index.html`, `css/`, `js/`, `assets/illustrations/` (only this directory is web-accessible; `server.js`, `lib/`, and `data/` are not)
- `views/community.ejs` — single template for all community/neighborhood pages, rendered by `GET /community/:slug`
- `data/communities.json` — content for every community page (stats, about copy, schools, commute, articles) **and** the homepage's community teaser cards, which fetch from `/api/communities` so they can never drift out of sync with the detail pages. Edit this file to add/change a neighborhood or its articles — no HTML editing required.
- `data/listings.json` — mock listing inventory used when `SPARK_API_KEY` is unset. Edit this file to change the demo listings.
- `lib/sparkApi.js`, `lib/followUpBoss.js`, `lib/leadLog.js` — backend integrations, detailed below.

## Listing photos

Mock listings have no real photo — rather than hotlinking stock photography of actual houses to a fictional address (which would misrepresent a real property as a fake listing), each community gets a distinct hand-built SVG illustration (`public/assets/illustrations/`) matching its architecture style. Once a real Spark API key is connected, real MLS photos take over automatically (see `photoUrl` vs. `illustrationUrl` in `lib/sparkApi.js` — the illustration is only ever a fallback, never a substitute for an available real photo).

The homepage hero background works the same way: `public/css/styles.css` layers `/assets/hero-photo.jpg` over `/assets/hero-bg.svg`, so dropping a real photo in at that exact path takes over automatically with no code changes, and the illustration remains the fallback if it's ever removed.

## Videos

Every `.video-thumb` element opens a modal player driven by its `data-video-src` attribute (the `.mp4` path — a matching `.webm` at the same path is tried first for broader codec support, then the `.mp4` as fallback; if neither loads, a "video coming soon" message shows instead of a broken player). Video files live in `public/assets/videos/`, named to match each spot:

- `moving-to-phoenix-2026.{mp4,webm}` — homepage "Moving to Phoenix: 2026 Buyer's Guide"
- `phoenix-market-update-2026-07.{mp4,webm}` — homepage "Phoenix Market Update — July 2026"
- `tour-<slug>.{mp4,webm}` — homepage's Arcadia tour card **and** each community page's neighborhood-tour video share this same path per community (e.g. `tour-arcadia.mp4` covers both), so one file update covers both spots.

To add or replace a video: drop both a `.mp4` (H.264, universally supported) and a `.webm` (VP9) at the matching path — `ffmpeg -i source.mov -c:v libx264 -crf 23 -an -movflags +faststart output.mp4` and `-c:v libvpx-vp9 -crf 32 -b:v 0 -an output.webm` are reasonable defaults for short silent aerial/b-roll clips. Only the `.mp4` is required for real-world browsers; the `.webm` is optional but recommended for broader compatibility and was needed to verify playback in this project's own headless-Chromium test environment, which lacks H.264 decode support.

## Connect a real Flexmls (Spark API) feed

1. Ask your MLS admin for a Spark API Datamart/IDX key via the [Spark API Developer Portal](https://sparkplatform.com/docs/overview/set_up_access).
2. Copy `.env.example` to `.env` and set `SPARK_API_KEY`.
3. Restart the server — `/api/listings` will now query `https://sparkapi.com/v1/listings` directly instead of mock data.

**Per-MLS field tuning:** every MLS board configures its own field set and neighborhood/subdivision naming. `lib/sparkApi.js` filters community pages using `COMMUNITY_FIELD_MAP` at the top of the file (currently mapped to City/SubdivisionName values for the demo Phoenix-metro communities — for a real Phoenix-area deployment this MLS is [Arizona Regional MLS (ARMLS)](https://armls.com/), itself built on the Flexmls/Spark platform) — update that map to match your MLS's actual field names and values. Cross-check against [Spark's Standard Fields reference](https://sparkplatform.com/docs/api_services/standard_fields) for the target MLS before going live.

**Compliance:** `DisplayCompliance` on each Spark listing result indicates what's allowed to be shown publicly for that listing (some brokers restrict address/photo display via reciprocity rules). The normalizer in `lib/sparkApi.js` passes this through as `displayView`/`attribution` — respect it before rendering full listing detail pages.

**Network note:** this integration could not be live-tested end to end during development — the sandbox it was built in blocks outbound requests to `sparkapi.com`. The request/response handling follows Spark's documented API shape and was verified against a local mock server matching that shape; verify against the real feed once deployed somewhere with normal internet egress.

## Connect a real Follow Up Boss CRM webhook

Leads are captured everywhere on the site (IDX search, valuation tool, soft-registration gate, lead magnet), but only leads with an email or phone — valuation completions, soft registrations, and lead-magnet signups — carry enough identity to sync to a CRM. Every lead, synced or not, is always appended to `var/leads.log.jsonl` first, so a CRM outage or missing key never loses a lead or blocks the visitor's form submission.

1. In Follow Up Boss, go to **Admin > API** and generate an API key.
2. Copy `.env.example` to `.env` and set `FUB_API_KEY`.
3. Restart the server — `POST /api/leads` will now sync qualifying leads to `https://api.followupboss.com/v1/events`.

Only four event types trigger Follow Up Boss automations/action plans: `Registration`, `Property Inquiry`, `Seller Inquiry`, `General Inquiry` (plus `Visited Open House`). `lib/followUpBoss.js` maps our lead types accordingly (valuation → `Seller Inquiry`, soft-registration/lead-magnet → `Registration`) specifically so the sub-5-minute automated first touch — the single highest-ROI recommendation from the original site teardown — actually fires.

**X-System / X-System-Key:** Follow Up Boss's docs describe these as required for registered third-party integrations. For a single account's own custom website, requests with just the API key generally work; if FUB later requires it for your account, register a system name and set `FUB_SYSTEM` / `FUB_SYSTEM_KEY` in `.env` — no code changes needed.

**Network note:** same as Spark API above — this sandbox blocks `api.followupboss.com`, so this was verified against a local mock server replicating FUB's Basic Auth, event-type validation, and person/email requirements. Verify against the real API once deployed.
