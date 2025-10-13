// utils/upload.js
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;

/**
 * ✅ Configure Cloudinary
 * Uses your credentials safely from .env
 */
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET,
});

/**
 * Create a Cloudinary uploader with dynamic folder
 * @param {String} folderName - e.g. 'cows', 'users', 'farmers', 'listings', 'insemination'
 */
function makeUploader(folderName) {
  const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
      // 🧠 Guess file type and assign folder
      const folder = `maziwasmart/${folderName}`;
      const allowedFormats =
        folderName === "insemination"
          ? ["jpg", "jpeg", "png", "pdf"]
          : ["jpg", "jpeg", "png", "webp"];

      return {
        folder,
        allowed_formats: allowedFormats,
        public_id: `${Date.now()}-${file.originalname
          .replace(/\s+/g, "_")
          .replace(/[^a-zA-Z0-9._-]/g, "")}`,
      };
    },
  });

  // ✅ Just use Cloudinary’s validation; multer handles errors gracefully
  return multer({ storage });
}

module.exports = makeUploader;
