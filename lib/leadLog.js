const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "..", "var");
const LOG_FILE = path.join(LOG_DIR, "leads.log.jsonl");

function appendLead(lead) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify(lead) + "\n");
}

module.exports = { appendLead, LOG_FILE };
