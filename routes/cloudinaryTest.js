const express = require("express");
const router = express.Router();
const cloudinary = require("cloudinary").v2;
const multer = require("multer");

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET,
});

const upload = multer({ storage: multer.memoryStorage() });

router.post("/", upload.single("image"), async (req, res) => {
  try {
    console.log("📸 File received:", req.file?.originalname);

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file received" });
    }

    const result = await cloudinary.uploader.upload_stream(
      { folder: "maziwasmart/test", resource_type: "auto" },
      (error, uploadResult) => {
        if (error) {
          console.error("❌ Cloudinary error:", error);
          return res.status(500).json({ success: false, message: "Upload failed", error });
        }
        console.log("✅ Upload success:", uploadResult.secure_url);
        res.status(200).json({ success: true, url: uploadResult.secure_url });
      }
    );

    // Pipe file buffer into Cloudinary stream
    const stream = result;
    stream.end(req.file.buffer);

  } catch (err) {
    console.error("❌ Error in test route:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
