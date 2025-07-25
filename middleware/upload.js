const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure directory exists
const uploadDir = path.join(__dirname, '../uploads/inseminations');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Sanitize file name: remove spaces & special characters
    const cleanName = file.originalname
      .replace(/\s+/g, '_')              // Replace spaces with underscores
      .replace(/[^a-zA-Z0-9._-]/g, '');  // Remove unsupported characters

    const uniqueName = `${Date.now()}-${cleanName}`;
    cb(null, uniqueName);
  }
});

// Filter only image files
const fileFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('❌ Only .jpg, .jpeg, .png image files are allowed.'));
  }
};

// Export the multer upload instance
const upload = multer({ storage, fileFilter });

module.exports = upload;
