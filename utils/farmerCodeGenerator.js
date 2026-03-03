const Farmer = require("../models/model").Farmer;

/**
 * Generate unique farmer code
 * Format: FARMER-XXXX-YYYY (e.g., FARMER-1234-5678)
 */
async function generateFarmerCode() {
  const prefix = "FARMER";
  const maxAttempts = 100;
  let attempts = 0;

  while (attempts < maxAttempts) {
    // Generate random 4-digit + 4-digit code
    const code1 = Math.floor(1000 + Math.random() * 9000); // 1000-9999
    const code2 = Math.floor(1000 + Math.random() * 9000); // 1000-9999
    const code = `${prefix}-${code1}-${code2}`;

    // Check if code already exists
    const existing = await Farmer.findOne({ farmer_code: code });

    if (!existing) {
      return code; // Unique code found
    }

    attempts++;
  }

  throw new Error("Failed to generate unique farmer code after 100 attempts");
}

/**
 * Validate farmer code format
 */
function validateFarmerCode(code) {
  const pattern = /^FARMER-\d{4}-\d{4}$/;
  return pattern.test(code);
}

/**
 * Check if farmer code exists
 */
async function isFarmerCodeAvailable(code) {
  const existing = await Farmer.findOne({ farmer_code: code });
  return !existing;
}

module.exports = {
  generateFarmerCode,
  validateFarmerCode,
  isFarmerCodeAvailable,
};