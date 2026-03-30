require("dotenv").config();
const neonService = require("../services/database/neonService");

async function checkAllowlist(email) {
  try {
    console.log(`Checking allowlist for email: ${email}`);
    const entry = await neonService.findPRAllowlistByEmail(email);
    if (entry) {
      console.log("Allowlist entry found:", entry);
    } else {
      console.log("No allowlist entry found for this email");
    }
  } catch (error) {
    console.error("Error checking allowlist:", error);
  } finally {
    process.exit(0);
  }
}

const email = process.argv[2];
if (!email) {
  console.log("Usage: node checkAllowlist.js <email>");
  process.exit(1);
}

checkAllowlist(email.toLowerCase());
