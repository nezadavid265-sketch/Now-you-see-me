import { Router } from 'express';
import { z } from 'zod';
import { id, text } from '../../lib/validators.js';
import { paginationSchema } from '../../lib/pagination.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { sensitiveLimiter } from '../../middleware/rateLimit.js';
import * as support from './support.service.js';

const router = Router();
router.use(authenticate, requireRole('BUYER', 'SELLER', 'DELIVERY'));

const createSchema = z.object({
  type: z.enum(['GENERAL', 'ORDER', 'PAYMENT', 'DELIVERY', 'REFUND', 'COMPLAINT', 'DISPUTE', 'SELLER_ACCOUNT']).default('GENERAL'),
  subject: text(150, 4),
  message: text(4000, 10),
  orderId: id.optional(),
  sellerOrderId: id.optional(),
});

router.get(
  '/tickets',
  validate({ query: z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(), ...paginationSchema }) }),
  async (req, res) => res.json(await support.listTickets(req.user, req.valid.query)),
);

router.post('/tickets', sensitiveLimiter, validate({ body: createSchema }), async (req, res) => {
  const ticket = await support.createTicket(req.user, req.valid.body);
  res.status(201).json({ ticket: { id: ticket.id, number: ticket.number } });
});

router.get('/tickets/:id', validate({ params: z.object({ id }) }), async (req, res) => {
  res.json({ ticket: await support.getTicket(req.user, req.valid.params.id) });
});

router.post(
  '/tickets/:id/messages',
  sensitiveLimiter,
  validate({ params: z.object({ id }), body: z.object({ body: text(4000, 1) }) }),
  async (req, res) => {
    await support.replyToTicket(req.user, req.valid.params.id, req.valid.body);
    res.status(201).json({ ticket: await support.getTicket(req.user, req.valid.params.id) });
  },
);

router.post('/tickets/:id/close', validate({ params: z.object({ id }) }), async (req, res) => {
  await support.closeTicket(req.user, req.valid.params.id);
  res.json({ ticket: await support.getTicket(req.user, req.valid.params.id) });
});

export default router;
