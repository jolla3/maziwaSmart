// utils/upload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

/**
 * Create a multer instance with dynamic folder
 * @param {String} folderName - e.g. 'cows', 'users', 'farmers', 'listings', 'insemination'
 */
function makeUploader(folderName) {
  const uploadDir = path.join(__dirname, `../uploads/${folderName}`);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const cleanName = file.originalname
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9._-]/g, '');
      cb(null, `${Date.now()}-${cleanName}`);
    },
  });

  const fileFilter = (req, file, cb) => {
    // For images we allow jpg, jpeg, png
    const imageExts = ['.jpg', '.jpeg', '.png'];
    // For insemination, maybe we allow pdf too
    const inseminationExts = ['.jpg', '.jpeg', '.png', '.pdf'];

    const ext = path.extname(file.originalname).toLowerCase();

    if (folderName === 'insemination') {
      if (inseminationExts.includes(ext)) cb(null, true);
      else cb(new Error('❌ Only .jpg, .jpeg, .png, .pdf files are allowed for insemination.'));
    } else {
      if (imageExts.includes(ext)) cb(null, true);
      else cb(new Error('❌ Only .jpg, .jpeg, .png files are allowed.'));
    }
  };

  return multer({ storage, fileFilter });
}

module.exports = makeUploader;
