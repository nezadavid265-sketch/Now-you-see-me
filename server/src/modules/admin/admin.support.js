import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';
import { id, text } from '../../lib/validators.js';
import { pageResult, paginate, paginationSchema } from '../../lib/pagination.js';
import { validate } from '../../middleware/validate.js';
import { audit } from '../../services/audit.js';
import { notify } from '../../services/notifications.js';

const router = Router();
const params = z.object({ id });

router.get(
  '/',
  validate({
    query: z.object({
      status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
      type: z.enum(['GENERAL', 'ORDER', 'PAYMENT', 'DELIVERY', 'REFUND', 'COMPLAINT', 'DISPUTE', 'SELLER_ACCOUNT']).optional(),
      priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
      mine: z.enum(['true', 'false']).optional(),
      q: z.string().trim().max(100).optional(),
      ...paginationSchema,
    }),
  }),
  async (req, res) => {
    const { status, type, priority, mine, q, page, pageSize } = req.valid.query;
    const where = {
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(priority ? { priority } : {}),
      ...(mine === 'true' ? { assignedToId: req.user.id } : {}),
      ...(q ? { OR: [{ subject: { contains: q, mode: 'insensitive' } }, { number: { contains: q, mode: 'insensitive' } }] } : {}),
    };
    const [total, items] = await Promise.all([
      prisma.supportTicket.count({ where }),
      prisma.supportTicket.findMany({
        where,
        orderBy: [{ status: 'asc' }, { lastReplyAt: 'desc' }],
        ...paginate({ page, pageSize }),
        include: {
          user: { select: { name: true, email: true, role: true } },
          assignedTo: { select: { name: true } },
          shop: { select: { name: true } },
          order: { select: { orderNumber: true } },
        },
      }),
    ]);
    res.json(pageResult(items, total, { page, pageSize }));
  },
);

router.get('/:id', validate({ params }), async (req, res) => {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: req.valid.params.id },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, role: true } },
      assignedTo: { select: { id: true, name: true } },
      shop: { select: { id: true, name: true, slug: true } },
      order: { select: { id: true, orderNumber: true, status: true, total: true } },
      messages: { orderBy: { createdAt: 'asc' }, include: { author: { select: { id: true, name: true, role: true } } } },
    },
  });
  if (!ticket) throw notFound('Ticket');
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', status: 'ACTIVE', OR: [{ isSuperAdmin: true }, { adminPermissions: { has: 'support' } }] },
    select: { id: true, name: true },
  });
  res.json({ ticket, admins });
});

router.post(
  '/:id/messages',
  validate({ params, body: z.object({ body: text(4000, 1), isInternal: z.boolean().default(false) }) }),
  async (req, res) => {
    const ticket = await prisma.supportTicket.findUnique({ where: { id: req.valid.params.id }, include: { shop: { select: { sellerId: true } } } });
    if (!ticket) throw notFound('Ticket');
    const { body, isInternal } = req.valid.body;
    await prisma.$transaction([
      prisma.ticketMessage.create({ data: { ticketId: ticket.id, authorId: req.user.id, body, isInternal } }),
      prisma.supportTicket.update({
        where: { id: ticket.id },
        data: {
          lastReplyAt: new Date(),
          ...(isInternal ? {} : { status: ticket.status === 'OPEN' ? 'IN_PROGRESS' : ticket.status }),
          assignedToId: ticket.assignedToId ?? req.user.id,
        },
      }),
    ]);
    if (!isInternal) {
      const owner = await prisma.user.findUnique({ where: { id: ticket.userId }, select: { role: true } });
      const ownerLink = owner?.role === 'SELLER' ? `/seller/support/${ticket.id}` : `/account/support/${ticket.id}`;
      await notify(ticket.userId, { type: 'support.reply', title: `Rivoshoppa Support replied (${ticket.number})`, body: body.slice(0, 160), link: ownerLink });
      if (ticket.shop && ticket.shop.sellerId !== ticket.userId) {
        await notify(ticket.shop.sellerId, { type: 'support.reply', title: `Support replied on ${ticket.number}`, body: body.slice(0, 160), link: `/seller/support/${ticket.id}` });
      }
    }
    res.status(201).json({ ok: true });
  },
);

router.patch(
  '/:id',
  validate({
    params,
    body: z.object({
      status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
      priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
      assignedToId: id.nullable().optional(),
    }),
  }),
  async (req, res) => {
    const data = { ...req.valid.body };
    if (data.status === 'RESOLVED' || data.status === 'CLOSED') data.resolvedAt = new Date();
    const ticket = await prisma.supportTicket.update({ where: { id: req.valid.params.id }, data });
    await audit(req, 'admin.ticket_updated', { entityType: 'SupportTicket', entityId: ticket.id, metadata: req.valid.body });
    if (req.valid.body.status === 'RESOLVED') {
      await notify(ticket.userId, {
        type: 'support.resolved',
        title: `Your request ${ticket.number} was resolved`,
        body: 'Reply to the conversation if you still need help.',
        link: `/account/support/${ticket.id}`,
      });
    }
    res.json({ ticket });
  },
);

export default router;
