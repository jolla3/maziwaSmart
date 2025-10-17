// controllers/testUploadController.js
exports.testUpload = async (req, res) => {
  try {
    console.log("🟢 Upload test route hit");

    // 🧠 Log what multer actually sees
    console.log("📦 Full req.files:", JSON.stringify(req.files, null, 2));
    console.log("📦 Full req.body:", JSON.stringify(req.body, null, 2));

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "❌ No files received by multer. Check field name or Cloudinary setup.",
      });
    }

    const urls = req.files.map(f => f.path || f.secure_url);
    console.log("✅ Uploaded Cloudinary URLs:", urls);

    res.status(200).json({
      success: true,
      message: "✅ Uploaded successfully",
      uploaded: urls,
    });

  } catch (err) {
    console.error("❌ Upload test error:", err);
    res.status(500).json({
      success: false,
      message: "Upload failed",
      error: err.message,
    });
  }
};
