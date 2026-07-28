/**
 * Comparative Market Analysis (CMA) report builder.
 *
 * Modeled on the standard CMA deliverable (cover/subject info, market
 * summary, active + sold comp tables, per-comp detail, pricing
 * recommendation) rather than any specific vendor's exact layout.
 *
 * There's no MLS lookup wired up for the subject property yet — the
 * valuation form only collects address/name/email/phone — so subject facts
 * (beds/baths/sqft) are derived deterministically from the address, the
 * same approach the existing client-side estimateValue() in main.js uses.
 * Once a real Spark API subject-property lookup exists, swap
 * estimateSubjectFacts() for a real one without touching the rest of this
 * module.
 */

const fs = require("fs");
const path = require("path");

const COMMUNITIES = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "communities.json"), "utf8"));
const ACTIVE_LISTINGS = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "listings.json"), "utf8"));
const SOLD_COMPS = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "soldComps.json"), "utf8"));

const ILLUSTRATION_BY_COMMUNITY = Object.fromEntries(COMMUNITIES.map((c) => [c.slug, c.illustration]));

function illustrationUrl(communitySlug) {
  const file = ILLUSTRATION_BY_COMMUNITY[communitySlug];
  return file ? `/assets/illustrations/${file}` : null;
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return hash;
}

// Free-text address -> known community, by matching name/city mentions.
// Falls back to a deterministic (hash-based) pick so the same address
// always lands on the same community across repeat visits rather than
// leaving the report without any comps.
function matchCommunity(address) {
  const lower = String(address || "").toLowerCase();

  const byNameOrSlug = COMMUNITIES.find(
    (c) => lower.includes(c.name.toLowerCase()) || lower.includes(c.slug.replace(/-/g, " "))
  );
  if (byNameOrSlug) return byNameOrSlug;

  const CITY_TO_SLUG = {
    "old town scottsdale": "old-town-scottsdale",
    "paradise valley": "paradise-valley",
    scottsdale: "old-town-scottsdale",
    phoenix: "arcadia",
    gilbert: "gilbert"
  };
  for (const [city, slug] of Object.entries(CITY_TO_SLUG)) {
    if (lower.includes(city)) {
      const match = COMMUNITIES.find((c) => c.slug === slug);
      if (match) return match;
    }
  }

  return COMMUNITIES[hashString(address) % COMMUNITIES.length];
}

function estimateSubjectFacts(address) {
  const hash = hashString(address);
  return {
    beds: 3 + (hash % 3), // 3-5
    baths: 2 + ((hash >>> 3) % 3), // 2-4
    sqft: 1600 + (hash % 2600) // 1600-4199
  };
}

function average(nums) {
  const clean = nums.filter((n) => Number.isFinite(n));
  if (!clean.length) return null;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

function roundTo(n, nearest) {
  return n === null ? null : Math.round(n / nearest) * nearest;
}

function buildCma({ address, name, email, phone, community: communitySlugOverride } = {}) {
  if (!address || !String(address).trim()) {
    throw new Error("address is required to build a CMA");
  }

  const community =
    (communitySlugOverride && COMMUNITIES.find((c) => c.slug === communitySlugOverride)) ||
    matchCommunity(address);

  const activeComps = ACTIVE_LISTINGS.filter((l) => l.community === community.slug).map((l) => ({
    ...l,
    pricePerSqft: l.sqft ? Math.round(l.price / l.sqft) : null,
    illustrationUrl: illustrationUrl(l.community)
  }));

  const soldComps = SOLD_COMPS.filter((c) => c.community === community.slug).map((c) => ({
    ...c,
    pricePerSqft: c.sqft ? Math.round(c.soldPrice / c.sqft) : null,
    listToSaleRatio: c.listPrice ? c.soldPrice / c.listPrice : null,
    illustrationUrl: illustrationUrl(c.community)
  }));

  const subject = {
    address: String(address).trim(),
    name: name || null,
    email: email || null,
    phone: phone || null,
    community: community.name,
    communitySlug: community.slug,
    ...estimateSubjectFacts(String(address).trim()),
    illustrationUrl: illustrationUrl(community.slug)
  };

  const avgActivePrice = average(activeComps.map((l) => l.price));
  const avgActivePpsf = average(activeComps.map((l) => l.pricePerSqft));
  const avgSoldPrice = average(soldComps.map((c) => c.soldPrice));
  const avgSoldPpsf = average(soldComps.map((c) => c.pricePerSqft));
  const avgDom = average(soldComps.map((c) => c.dom));
  const avgListToSale = average(soldComps.map((c) => c.listToSaleRatio));

  // Sold prices are a stronger signal of what buyers will actually pay;
  // active listings show where today's competition is priced. Weight sold
  // comps higher when both are available.
  const blendedPpsf =
    avgSoldPpsf && avgActivePpsf
      ? avgSoldPpsf * 0.6 + avgActivePpsf * 0.4
      : avgSoldPpsf || avgActivePpsf || 300;

  const pointEstimate = roundTo(blendedPpsf * subject.sqft, 1000);
  const suggestedLow = roundTo(pointEstimate * 0.97, 1000);
  const suggestedHigh = roundTo(pointEstimate * 1.04, 1000);

  return {
    generatedAt: new Date().toISOString(),
    subject,
    activeComps,
    soldComps,
    stats: {
      avgActivePrice,
      avgActivePpsf,
      avgSoldPrice,
      avgSoldPpsf,
      avgDom,
      avgListToSale
    },
    pricing: {
      blendedPpsf: blendedPpsf ? Math.round(blendedPpsf) : null,
      pointEstimate,
      suggestedLow,
      suggestedHigh
    }
  };
}

module.exports = { buildCma, matchCommunity, estimateSubjectFacts };
