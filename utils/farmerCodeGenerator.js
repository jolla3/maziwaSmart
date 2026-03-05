const Farmer = require("../models/model").Farmer;

/**
 * Generate unique numeric farmer code
 * Format: 8-digit number (e.g., 12345678)
 */
async function generateFarmerCode() {
  const min = 10000000; // 8 digits minimum
  const max = 99999999; // 8 digits maximum
  const maxAttempts = 100;
  let attempts = 0;

  while (attempts < maxAttempts) {
    // Generate random 8-digit number
    const code = Math.floor(Math.random() * (max - min + 1)) + min;

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
 * Validate farmer code format (numeric)
 */
function validateFarmerCode(code) {
  if (typeof code !== 'number') return false;
  if (code < 10000000 || code > 99999999) return false; // 8 digits
  return true;
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