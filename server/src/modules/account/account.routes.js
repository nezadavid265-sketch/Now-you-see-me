import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { sensitiveLimiter } from '../../middleware/rateLimit.js';
import { id, optionalPhone, optionalText, password, personName, phone, text } from '../../lib/validators.js';
import { accountController as c } from './account.controller.js';

const router = Router();
router.use(authenticate);

const profileSchema = z.object({
  name: personName.optional(),
  phone: optionalPhone,
  notifyEmail: z.boolean().optional(),
  notifySms: z.boolean().optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password').max(128),
  newPassword: password,
});

const addressSchema = z.object({
  label: text(30, 1).default('Home'),
  recipientName: personName,
  phone,
  line1: text(160, 3),
  line2: optionalText(160),
  sector: optionalText(80),
  district: text(80, 2),
  city: text(80, 2),
  country: z.string().trim().length(2).toUpperCase().default('RW'),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  instructions: optionalText(300),
  isDefault: z.boolean().optional(),
});

router.patch('/profile', validate({ body: profileSchema }), c.updateProfile);
router.post('/change-password', sensitiveLimiter, validate({ body: passwordSchema }), c.changePassword);
router.get('/addresses', c.listAddresses);
router.post('/addresses', validate({ body: addressSchema }), c.createAddress);
router.patch('/addresses/:id', validate({ params: z.object({ id }), body: addressSchema.partial() }), c.updateAddress);
router.delete('/addresses/:id', validate({ params: z.object({ id }) }), c.deleteAddress);

export default router;
