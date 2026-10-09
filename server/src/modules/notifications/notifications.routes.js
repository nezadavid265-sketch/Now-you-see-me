import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { id } from '../../lib/validators.js';
import { pageResult, paginate, paginationSchema } from '../../lib/pagination.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  validate({ query: z.object({ ...paginationSchema, unread: z.enum(['true', 'false']).optional() }) }),
  async (req, res) => {
    const { page, pageSize, unread } = req.valid.query;
    const where = { userId: req.user.id, ...(unread === 'true' ? { readAt: null } : {}) };
    const [total, items] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, ...paginate({ page, pageSize }) }),
    ]);
    res.json(pageResult(items, total, { page, pageSize }));
  },
);

router.get('/unread-count', async (req, res) => {
  const count = await prisma.notification.count({ where: { userId: req.user.id, readAt: null } });
  res.json({ count });
});

router.post('/read-all', async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true });
});

router.post('/:id/read', validate({ params: z.object({ id }) }), async (req, res) => {
  await prisma.notification.updateMany({ where: { id: req.valid.params.id, userId: req.user.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true });
});

export default router;
