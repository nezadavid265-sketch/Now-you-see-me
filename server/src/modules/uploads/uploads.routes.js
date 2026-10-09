import { Router } from 'express';
import { z } from 'zod';
import { badRequest, forbidden } from '../../lib/errors.js';
import { authenticate, hasPermission, requireRole } from '../../middleware/auth.js';
import { imageUpload } from '../../middleware/upload.js';
import { sensitiveLimiter } from '../../middleware/rateLimit.js';
import { storeImage } from '../../services/storage.js';

const router = Router();

const PURPOSES = {
  product: { roles: ['SELLER'], maxSize: 1600 },
  shop: { roles: ['SELLER'], maxSize: 1200 },
  banner: { roles: ['ADMIN'], permission: 'marketing', maxSize: 2000 },
  category: { roles: ['ADMIN'], permission: 'catalog', maxSize: 800 },
};

/**
 * Upload images (multipart field "files"). Each file is decoded and
 * re-encoded server-side; the response contains the stored URLs that forms
 * then submit with the product / shop / banner they belong to.
 */
router.post('/images', authenticate, requireRole('SELLER', 'ADMIN'), sensitiveLimiter, imageUpload.array('files', 8), async (req, res) => {
  const purpose = z.enum(Object.keys(PURPOSES)).safeParse(req.body?.purpose);
  if (!purpose.success) throw badRequest('Unknown upload purpose');
  const rule = PURPOSES[purpose.data];
  if (!rule.roles.includes(req.user.role)) throw forbidden();
  if (rule.permission && !hasPermission(req.user, rule.permission)) throw forbidden();
  if (!req.files?.length) throw badRequest('Choose at least one image to upload.');

  const urls = [];
  for (const file of req.files) {
    urls.push(await storeImage(file.buffer, { folder: `${purpose.data}s`, maxSize: rule.maxSize }));
  }
  res.status(201).json({ urls });
});

export default router;
