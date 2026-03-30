require("dotenv").config();
const neonService = require("../services/database/neonService");

async function approveAllowlist(email) {
  try {
    console.log(`Approving allowlist for email: ${email}`);
    const entry = await neonService.findPRAllowlistByEmail(email);
    if (!entry) {
      console.log("No allowlist entry found for this email");
      return;
    }
    console.log("Current entry:", entry);
    if (entry.status === "approved") {
      console.log("Already approved");
      return;
    }
    const updated = await neonService.updatePRAllowlistEntry(entry.id, {
      status: "approved",
      approved_at: new Date(),
      approved_by: null, // or some PO id
    });
    console.log("Updated entry:", updated);
  } catch (error) {
    console.error("Error approving allowlist:", error);
  } finally {
    process.exit(0);
  }
}

const email = process.argv[2];
if (!email) {
  console.log("Usage: node approveAllowlist.js <email>");
  process.exit(1);
}

approveAllowlist(email.toLowerCase());
