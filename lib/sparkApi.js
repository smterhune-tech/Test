/**
 * Flexmls Spark API client.
 * Docs: https://sparkplatform.com/docs/api_services/read_first
 *
 * Auth: a Spark "Datamart" API key issued by the MLS through the Spark API
 * Developer Portal, sent as `Authorization: Bearer <key>`. Requests also
 * require an `X-SparkApi-User-Agent` identifying the consuming application
 * (Spark API terms require this to be a stable, descriptive string).
 *
 * Every MLS board configures its own set of available fields and
 * subdivision/neighborhood naming, so COMMUNITY_FIELD_MAP below is the one
 * thing that needs to be tuned per-MLS once real credentials are in place —
 * confirm exact field names against Standard Fields
 * (https://sparkplatform.com/docs/api_services/standard_fields) for the
 * target MLS before going live.
 */

const fs = require("fs");
const path = require("path");

const SPARK_API_BASE = process.env.SPARK_API_BASE || "https://sparkapi.com/v1";
const SPARK_API_KEY = process.env.SPARK_API_KEY || "";
const SPARK_USER_AGENT = process.env.SPARK_USER_AGENT || "TerhuneRealtyPartners/1.0";

// Maps our site's community slugs to the MLS's City field (and, where the
// MLS exposes it, SubdivisionName). Adjust to match the real MLS's data.
const COMMUNITY_FIELD_MAP = {
  "downtown-austin": { city: "Austin", subdivision: "Downtown" },
  "south-congress": { city: "Austin", subdivision: "South Congress" },
  "cedar-park": { city: "Cedar Park", subdivision: null },
  "westlake-hills": { city: "Austin", subdivision: "Westlake Hills" }
};

const COMMUNITIES = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "communities.json"), "utf8"));
const MOCK_LISTINGS_RAW = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "listings.json"), "utf8"));

const ILLUSTRATION_BY_COMMUNITY = Object.fromEntries(COMMUNITIES.map((c) => [c.slug, c.illustration]));

// Mock listings have no real MLS photo, so fall back to a hand-drawn
// illustration matching the community's architecture style rather than
// hotlinking stock photography of real houses to a fictional address.
const MOCK_LISTINGS = MOCK_LISTINGS_RAW.map((l) => ({
  ...l,
  photoUrl: null,
  illustrationUrl: ILLUSTRATION_BY_COMMUNITY[l.community]
    ? `/assets/illustrations/${ILLUSTRATION_BY_COMMUNITY[l.community]}`
    : null
}));

function isLive() {
  return Boolean(SPARK_API_KEY);
}

function escapeFilterValue(value) {
  return String(value).replace(/'/g, "''");
}

function buildFilter({ community, city, query, minBeds, pool }) {
  const clauses = [];

  const mapped = community ? COMMUNITY_FIELD_MAP[community] : null;
  if (mapped) {
    if (mapped.subdivision) {
      clauses.push(`SubdivisionName Eq '${escapeFilterValue(mapped.subdivision)}'`);
    } else {
      clauses.push(`City Eq '${escapeFilterValue(mapped.city)}'`);
    }
  } else if (city) {
    clauses.push(`City Eq '${escapeFilterValue(city)}'`);
  }

  if (query) {
    clauses.push(`UnparsedAddress Like '%${escapeFilterValue(query)}%'`);
  }

  if (minBeds) {
    clauses.push(`BedsTotal Ge ${Number(minBeds)}`);
  }

  if (pool) {
    clauses.push(`PoolPrivateYN Eq true`);
  }

  clauses.push(`MlsStatus Eq 'Active'`);

  return clauses.join(" And ");
}

function sparkHeaders() {
  return {
    Authorization: `Bearer ${SPARK_API_KEY}`,
    Accept: "application/json",
    "X-SparkApi-User-Agent": SPARK_USER_AGENT
  };
}

function primaryPhotoUrl(result) {
  const photo = result._embedded && result._embedded.primaryPhoto && result._embedded.primaryPhoto[0];
  if (!photo) return null;
  return photo.Uri800 || photo.Uri640 || photo.Uri300 || photo.UriThumb || null;
}

function communityFromFields(fields) {
  for (const [slug, mapping] of Object.entries(COMMUNITY_FIELD_MAP)) {
    if (mapping.subdivision && fields.SubdivisionName === mapping.subdivision) return slug;
    if (!mapping.subdivision && fields.City === mapping.city) return slug;
  }
  return null;
}

function normalizeListing(result) {
  const fields = result.StandardFields || {};
  const compliance = result.DisplayCompliance || {};
  const community = communityFromFields(fields);
  const photoUrl = primaryPhotoUrl(result);

  return {
    id: result.Id || fields.ListingId,
    price: fields.ListPrice ?? null,
    address: fields.UnparsedAddress || [fields.StreetNumber, fields.StreetName, fields.City].filter(Boolean).join(" "),
    beds: fields.BedsTotal ?? null,
    baths: fields.BathroomsTotalInteger ?? fields.BathsTotal ?? null,
    sqft: fields.BuildingAreaTotal ?? null,
    community,
    badge: fields.MlsStatus === "Active" && fields.NewListing ? "New" : null,
    photoUrl,
    // Fall back to a community illustration only if the MLS hasn't supplied
    // a real photo yet (e.g. a brand-new listing) — never used to replace
    // an available real photo.
    illustrationUrl: !photoUrl && community && ILLUSTRATION_BY_COMMUNITY[community]
      ? `/assets/illustrations/${ILLUSTRATION_BY_COMMUNITY[community]}`
      : null,
    modificationTimestamp: fields.ModificationTimestamp || null,
    // IDX/MLS compliance: some listings restrict what can be shown publicly.
    // Respect DisplayCompliance rather than assuming full detail is allowed.
    displayView: compliance.View || "Detail",
    attribution: compliance.IDXLogoSmall || null
  };
}

async function sparkFetch(pathname, searchParams) {
  const url = new URL(SPARK_API_BASE + pathname);
  Object.entries(searchParams || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });

  const response = await fetch(url, { headers: sparkHeaders() });
  const body = await response.json().catch(() => null);

  if (!response.ok || !body || body.D?.Success === false) {
    const message = body?.D?.Message || `Spark API request failed with status ${response.status}`;
    throw new Error(message);
  }

  return body.D;
}

async function searchListings({ community, city, query, minBeds, pool, newOnly, limit } = {}) {
  if (!isLive()) {
    let items = MOCK_LISTINGS;
    if (community) items = items.filter((l) => l.community === community);
    if (city) items = items.filter((l) => l.address.toLowerCase().includes(String(city).toLowerCase()));
    if (query) items = items.filter((l) => l.address.toLowerCase().includes(String(query).toLowerCase()));
    if (minBeds) items = items.filter((l) => l.beds >= Number(minBeds));
    if (limit) items = items.slice(0, Number(limit));
    return { source: "mock", listings: items };
  }

  const filter = buildFilter({ community, city, query, minBeds, pool });
  const data = await sparkFetch("/listings", {
    _filter: filter,
    _limit: limit || 24,
    _expand: "PrimaryPhoto",
    _sort: newOnly ? "-ModificationTimestamp" : undefined
  });

  return { source: "spark", listings: (data.Results || []).map(normalizeListing) };
}

async function getListing(id) {
  if (!isLive()) {
    return MOCK_LISTINGS.find((l) => l.id === id) || null;
  }

  try {
    const data = await sparkFetch(`/listings/${encodeURIComponent(id)}`, { _expand: "PrimaryPhoto" });
    const result = Array.isArray(data.Results) ? data.Results[0] : data.Results;
    return result ? normalizeListing(result) : null;
  } catch (err) {
    if (/not found/i.test(err.message)) return null;
    throw err;
  }
}

module.exports = { searchListings, getListing, isLive, COMMUNITY_FIELD_MAP };
