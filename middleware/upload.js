// utils/upload.js
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;

// 🧠 Configure Cloudinary from .env
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME?.trim(),
  api_key: process.env.CLOUD_KEY?.trim(),
  api_secret: process.env.CLOUD_SECRET?.trim(),
});

// 🧩 Create uploader dynamically
function makeUploader(folderName) {
  const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
      const folder = `maziwasmart/${folderName}`;
      return {
        folder,
        allowed_formats: ["jpg", "jpeg", "png", "pdf", "webp"],
        resource_type: "auto", // ✅ allows image/pdf/video
        public_id: `${Date.now()}-${file.originalname
          .replace(/\s+/g, "_")
          .replace(/[^a-zA-Z0-9._-]/g, "")}`,
      };
    },
  });

  return multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  });
}

module.exports = makeUploader;
