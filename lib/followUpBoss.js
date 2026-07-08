/**
 * Follow Up Boss (FUB) CRM client — Events API.
 * Docs: https://docs.followupboss.com/reference/events-post
 *
 * Auth: HTTP Basic, with the account's API key as the username and an
 * empty password. FUB's docs also describe X-System / X-System-Key
 * headers that identify the integration itself (issued separately from
 * the account API key, via FUB's partner registration process) — those
 * are optional here and only added if configured, since a single-account
 * custom integration may not have them.
 *
 * Only "Registration", "Property Inquiry", "Seller Inquiry", and
 * "General Inquiry" event types trigger FUB automations/action plans —
 * this is what makes the sub-5-minute auto-response from the original
 * teardown report's #1 recommendation actually fire.
 */

const FUB_API_BASE = process.env.FUB_API_BASE || "https://api.followupboss.com/v1";
const FUB_API_KEY = process.env.FUB_API_KEY || "";
const FUB_SYSTEM = process.env.FUB_SYSTEM || "";
const FUB_SYSTEM_KEY = process.env.FUB_SYSTEM_KEY || "";
const FUB_SOURCE_NAME = process.env.FUB_SOURCE_NAME || "Relocation Expert Arizona Website";

// Only these lead types carry enough identity (email or phone) to create/
// match a Person in FUB, and map to event types that trigger automations.
const LEAD_TYPE_MAP = {
  valuation_complete: { type: "Seller Inquiry", message: (l) => `Requested a home value estimate for ${l.address || "their property"}.` },
  soft_registration: { type: "Registration", message: () => "Registered on the site to view full listing details." },
  lead_magnet: { type: "Registration", message: () => "Requested the Phoenix Relocation & Buyer's Guide." },
  showing_request: { type: "Property Inquiry", message: (l) => `Requested a showing for ${l.address || "a property"}.` }
};

function isConfigured() {
  return Boolean(FUB_API_KEY);
}

function splitName(name) {
  if (!name) return { firstName: undefined, lastName: undefined };
  const parts = String(name).trim().split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") || undefined };
}

function authHeader() {
  return "Basic " + Buffer.from(`${FUB_API_KEY}:`).toString("base64");
}

// A lead needs an email or phone to be worth syncing to the CRM — an
// address or search query alone can't identify a Person in FUB.
function hasIdentity(lead) {
  return Boolean(lead.email || lead.phone);
}

function isSyncable(lead) {
  return Boolean(LEAD_TYPE_MAP[lead.type]) && hasIdentity(lead);
}

async function syncLead(lead) {
  if (!isConfigured()) {
    return { synced: false, reason: "FUB_API_KEY not configured" };
  }
  if (!isSyncable(lead)) {
    return { synced: false, reason: "lead has no email/phone or unmapped type" };
  }

  const mapping = LEAD_TYPE_MAP[lead.type];
  const { firstName, lastName } = splitName(lead.name);

  const payload = {
    source: FUB_SOURCE_NAME,
    system: FUB_SYSTEM || FUB_SOURCE_NAME,
    type: mapping.type,
    message: mapping.message(lead),
    person: {
      firstName,
      lastName,
      emails: lead.email ? [{ value: lead.email }] : undefined,
      phones: lead.phone ? [{ value: lead.phone }] : undefined
    }
  };

  if (lead.address) {
    payload.property = { street: lead.address };
  }

  const headers = {
    Authorization: authHeader(),
    "Content-Type": "application/json",
    Accept: "application/json"
  };
  if (FUB_SYSTEM) headers["X-System"] = FUB_SYSTEM;
  if (FUB_SYSTEM_KEY) headers["X-System-Key"] = FUB_SYSTEM_KEY;

  const response = await fetch(`${FUB_API_BASE}/events`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message = (body && (body.errorMessage || body.message)) || `FUB API request failed with status ${response.status}`;
    throw new Error(message);
  }

  return { synced: true, fubType: mapping.type, response: body };
}

module.exports = { syncLead, isConfigured, isSyncable, hasIdentity };
