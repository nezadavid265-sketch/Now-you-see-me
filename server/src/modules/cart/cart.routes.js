import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { id } from '../../lib/validators.js';
import { cartController as c } from './cart.controller.js';

const router = Router();

const quantity = z.coerce.number().int().min(1, 'Quantity must be at least 1').max(99);
const lines = z.object({ items: z.array(z.object({ productId: id, quantity })).max(50) });

// Guest carts are priced by the server too — the browser only stores ids and quantities.
router.post('/preview', validate({ body: lines }), c.preview);

router.use(authenticate, requireRole('BUYER'));
router.get('/', validate({ query: z.object({ coupon: z.string().trim().max(40).optional() }) }), c.get);
router.post('/items', validate({ body: z.object({ productId: id, quantity: quantity.default(1) }) }), c.addItem);
router.patch('/items/:productId', validate({ params: z.object({ productId: id }), body: z.object({ quantity }) }), c.updateItem);
router.delete('/items/:productId', validate({ params: z.object({ productId: id }) }), c.removeItem);
router.delete('/', c.clear);
router.post('/merge', validate({ body: lines }), c.merge);

export default router;
