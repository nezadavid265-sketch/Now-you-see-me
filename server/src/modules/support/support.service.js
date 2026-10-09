import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { forbidden, notFound, unprocessable } from '../../lib/errors.js';
import { pageResult, paginate } from '../../lib/pagination.js';
import { notify, notifyAdmins, notifyShopOwner } from '../../services/notifications.js';

export function ticketNumber() {
  return `T-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

/** Tickets a non-admin user can see: their own, or (sellers) those about their shop. */
async function accessFilter(user) {
  if (user.role === 'SELLER') {
    const shop = await prisma.shop.findUnique({ where: { sellerId: user.id }, select: { id: true } });
    return shop ? { OR: [{ userId: user.id }, { shopId: shop.id }] } : { userId: user.id };
  }
  return { userId: user.id };
}

export async function listTickets(user, { status, page, pageSize }) {
  const where = { AND: [await accessFilter(user), status ? { status } : {}] };
  const [total, rows] = await Promise.all([
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.findMany({
      where,
      orderBy: { lastReplyAt: 'desc' },
      ...paginate({ page, pageSize }),
      include: { order: { select: { orderNumber: true } }, shop: { select: { name: true } }, user: { select: { name: true } }, _count: { select: { messages: { where: { isInternal: false } } } } },
    }),
  ]);
  const items = rows.map((t) => ({
    id: t.id,
    number: t.number,
    subject: t.subject,
    type: t.type,
    status: t.status,
    priority: t.priority,
    orderNumber: t.order?.orderNumber ?? null,
    shop: t.shop?.name ?? null,
    createdBy: t.userId === user.id ? 'You' : t.user.name.split(' ')[0],
    messageCount: t._count.messages,
    lastReplyAt: t.lastReplyAt,
    createdAt: t.createdAt,
  }));
  return pageResult(items, total, { page, pageSize });
}

export async function getTicket(user, ticketId) {
  const ticket = await prisma.supportTicket.findFirst({
    where: { AND: [{ id: ticketId }, await accessFilter(user)] },
    include: {
      order: { select: { id: true, orderNumber: true } },
      shop: { select: { name: true, sellerId: true } },
      messages: {
        where: { isInternal: false },
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { id: true, name: true, role: true } } },
      },
    },
  });
  if (!ticket) throw notFound('Ticket');
  return {
    id: ticket.id,
    number: ticket.number,
    subject: ticket.subject,
    type: ticket.type,
    status: ticket.status,
    priority: ticket.priority,
    order: ticket.order,
    shop: ticket.shop ? { name: ticket.shop.name } : null,
    isOwner: ticket.userId === user.id,
    createdAt: ticket.createdAt,
    messages: ticket.messages.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt,
      mine: m.author.id === user.id,
      author: m.author.role === 'ADMIN' ? 'Rivoshoppa Support' : m.author.role === 'SELLER' && ticket.shop?.sellerId === m.author.id ? ticket.shop.name : m.author.name.split(' ')[0],
      authorRole: m.author.role,
    })),
  };
}

export async function createTicket(user, { type, subject, message, orderId, sellerOrderId }) {
  let shopId = null;
  let resolvedOrderId = null;
  if (sellerOrderId) {
    const so = await prisma.sellerOrder.findFirst({ where: { id: sellerOrderId, order: { buyerId: user.id } }, select: { orderId: true, shopId: true } });
    if (!so) throw notFound('Order');
    shopId = so.shopId;
    resolvedOrderId = so.orderId;
  } else if (orderId) {
    const order = await prisma.order.findFirst({ where: { id: orderId, buyerId: user.id }, select: { id: true } });
    if (!order) throw notFound('Order');
    resolvedOrderId = order.id;
  }
  if (user.role === 'SELLER') {
    const shop = await prisma.shop.findUnique({ where: { sellerId: user.id }, select: { id: true } });
    shopId = shop?.id ?? null;
  }
  const openCount = await prisma.supportTicket.count({ where: { userId: user.id, status: { in: ['OPEN', 'IN_PROGRESS'] } } });
  if (openCount >= 20) throw unprocessable('You have many open requests. Please wait for a reply before opening more.');

  const ticket = await prisma.supportTicket.create({
    data: {
      number: ticketNumber(),
      userId: user.id,
      type,
      subject,
      orderId: resolvedOrderId,
      shopId,
      priority: ['DISPUTE', 'PAYMENT'].includes(type) ? 'HIGH' : 'NORMAL',
      messages: { create: { authorId: user.id, body: message } },
    },
  });
  await notifyAdmins('support', {
    type: 'support.new',
    title: `New support request ${ticket.number}`,
    body: subject,
    link: `/admin/support/${ticket.id}`,
  });
  if (shopId && user.role === 'BUYER') {
    await notifyShopOwner(shopId, {
      type: 'support.customer_request',
      title: 'New customer request',
      body: subject,
      link: `/seller/support/${ticket.id}`,
    });
  }
  return ticket;
}

export async function replyToTicket(user, ticketId, { body }) {
  const ticket = await prisma.supportTicket.findFirst({
    where: { AND: [{ id: ticketId }, await accessFilter(user)] },
    include: { shop: { select: { sellerId: true } } },
  });
  if (!ticket) throw notFound('Ticket');
  if (ticket.status === 'CLOSED') throw forbidden('This conversation is closed. Open a new request if you need more help.');
  const message = await prisma.$transaction(async (tx) => {
    const m = await tx.ticketMessage.create({ data: { ticketId, authorId: user.id, body } });
    await tx.supportTicket.update({
      where: { id: ticketId },
      data: { lastReplyAt: new Date(), status: ticket.status === 'RESOLVED' ? 'OPEN' : ticket.status },
    });
    return m;
  });
  // Let the other side know.
  if (ticket.userId !== user.id) {
    await notify(ticket.userId, { type: 'support.reply', title: `New reply on ${ticket.number}`, body: body.slice(0, 140), link: `/account/support/${ticket.id}` });
  } else if (ticket.shop && ticket.shop.sellerId !== user.id) {
    await notify(ticket.shop.sellerId, { type: 'support.reply', title: `Customer replied on ${ticket.number}`, body: body.slice(0, 140), link: `/seller/support/${ticket.id}` });
  }
  if (ticket.assignedToId) {
    await notify(ticket.assignedToId, { type: 'support.reply', title: `Reply on ${ticket.number}`, body: body.slice(0, 140), link: `/admin/support/${ticket.id}`, email: false });
  } else {
    await notifyAdmins('support', { type: 'support.reply', title: `Reply on ${ticket.number}`, body: body.slice(0, 140), link: `/admin/support/${ticket.id}` });
  }
  return message;
}

export async function closeTicket(user, ticketId) {
  const { count } = await prisma.supportTicket.updateMany({
    where: { id: ticketId, userId: user.id, status: { not: 'CLOSED' } },
    data: { status: 'CLOSED', resolvedAt: new Date() },
  });
  if (!count) throw notFound('Ticket');
}
