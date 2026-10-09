import multer from 'multer';
import { badRequest } from '../lib/errors.js';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

// Files stay in memory and are re-encoded by the storage service, which also
// verifies the actual content (the declared MIME type is only a first filter).
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 8, fields: 20 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) return cb(badRequest('Only JPEG, PNG, WebP, GIF or AVIF images are allowed.'));
    cb(null, true);
  },
});
