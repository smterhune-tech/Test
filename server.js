require("dotenv").config();
const express = require("express");
const path = require("path");
const { searchListings, getListing } = require("./lib/sparkApi");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname), { extensions: ["html"] }));

app.get("/api/listings", async (req, res) => {
  try {
    const results = await searchListings({
      community: req.query.community,
      city: req.query.city,
      query: req.query.q,
      minBeds: req.query.minBeds,
      pool: req.query.pool === "true",
      newOnly: req.query.newOnly === "true",
      limit: req.query.limit
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

app.listen(PORT, () => {
  const mode = process.env.SPARK_API_KEY ? "live Spark API" : "mock data (SPARK_API_KEY not set)";
  console.log(`Terhune Realty Partners site running on http://localhost:${PORT} [${mode}]`);
});
