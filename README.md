# Terhune Realty Partners

Real estate lead-gen site with a Flexmls Spark API IDX integration.

## Run locally

```
npm install
npm start
```

Serves the site + API at `http://localhost:3000`. Without a Spark API key, `/api/listings` returns built-in mock data so the site works out of the box.

## Connect a real Flexmls (Spark API) feed

1. Ask your MLS admin for a Spark API Datamart/IDX key via the [Spark API Developer Portal](https://sparkplatform.com/docs/overview/set_up_access).
2. Copy `.env.example` to `.env` and set `SPARK_API_KEY`.
3. Restart the server — `/api/listings` will now query `https://sparkapi.com/v1/listings` directly instead of mock data.

**Per-MLS field tuning:** every MLS board configures its own field set and neighborhood/subdivision naming. `lib/sparkApi.js` filters community pages using `COMMUNITY_FIELD_MAP` at the top of the file (currently mapped to City/SubdivisionName values for the demo Austin communities) — update that map to match your MLS's actual field names and values. Cross-check against [Spark's Standard Fields reference](https://sparkplatform.com/docs/api_services/standard_fields) for the target MLS before going live.

**Compliance:** `DisplayCompliance` on each Spark listing result indicates what's allowed to be shown publicly for that listing (some brokers restrict address/photo display via reciprocity rules). The normalizer in `lib/sparkApi.js` passes this through as `displayView`/`attribution` — respect it before rendering full listing detail pages.

**Network note:** this integration could not be live-tested end to end during development — the sandbox it was built in blocks outbound requests to `sparkapi.com`. The request/response handling follows Spark's documented API shape and was verified against a local mock server matching that shape; verify against the real feed once deployed somewhere with normal internet egress.
