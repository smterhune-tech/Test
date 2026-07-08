require("dotenv").config();
const express = require("express");
const path = require("path");
const { searchListings, getListing } = require("./lib/sparkApi");
const followUpBoss = require("./lib/followUpBoss");
const leadLog = require("./lib/leadLog");
const communities = require("./data/communities.json");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.json());
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

app.get("/api/communities", (req, res) => {
  res.json(communities);
});

app.get("/community/:slug", (req, res) => {
  const community = communities.find((c) => c.slug === req.params.slug);
  if (!community) return res.status(404).send("Community not found");
  res.render("community", { community, allCommunities: communities });
});

// Malformed numeric query params (e.g. ?minBeds=abc) must not silently
// zero out results — Number("abc") is NaN, and comparisons/slices against
// NaN quietly filter out everything rather than failing loudly. Treat
// anything non-numeric as "not provided" instead.
function toPositiveInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

app.get("/api/listings", async (req, res) => {
  try {
    const results = await searchListings({
      community: req.query.community,
      city: req.query.city,
      query: req.query.q,
      minBeds: toPositiveInt(req.query.minBeds),
      pool: req.query.pool === "true",
      newOnly: req.query.newOnly === "true",
      limit: toPositiveInt(req.query.limit)
    });
    res.json(results);
  } catch (err) {
    console.error("[/api/listings] error:", err.message);
    res.status(502).json({ error: "listing_search_failed", message: err.message });
  }
});

app.get("/api/listings/:id", async (req, res) => {
  try {
    const listing = await getListing(req.params.id);
    if (!listing) return res.status(404).json({ error: "not_found" });
    res.json(listing);
  } catch (err) {
    console.error("[/api/listings/:id] error:", err.message);
    res.status(502).json({ error: "listing_fetch_failed", message: err.message });
  }
});

app.post("/api/leads", async (req, res) => {
  const lead = req.body;
  if (!lead || typeof lead !== "object" || typeof lead.type !== "string") {
    return res.status(400).json({ error: "invalid_lead" });
  }

  let loggedLocally = true;
  try {
    leadLog.appendLead({ ...lead, receivedAt: new Date().toISOString() });
  } catch (err) {
    // Local logging is the one guarantee this endpoint makes — if even
    // that fails (disk full, read-only filesystem), don't let it take the
    // whole request down silently; still attempt CRM sync and tell the
    // caller the local copy didn't land.
    loggedLocally = false;
    console.error("[/api/leads] local log write failed:", err.message);
  }

  if (!followUpBoss.isSyncable(lead)) {
    return res.json({ logged: loggedLocally, synced: false });
  }

  try {
    const result = await followUpBoss.syncLead(lead);
    res.json({ logged: loggedLocally, ...result });
  } catch (err) {
    console.error("[/api/leads] FUB sync failed:", err.message);
    // A CRM outage shouldn't surface as a failure to the visitor submitting
    // the form — the local log (if it succeeded above) is the fallback.
    res.json({ logged: loggedLocally, synced: false, error: err.message });
  }
});

app.listen(PORT, () => {
  const mode = process.env.SPARK_API_KEY ? "live Spark API" : "mock data (SPARK_API_KEY not set)";
  console.log(`Relocation Expert Arizona site running on http://localhost:${PORT} [${mode}]`);
});
