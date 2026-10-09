import { prisma } from '../../lib/prisma.js';
import { notFound, unprocessable } from '../../lib/errors.js';
import { clientInfo } from '../../lib/http.js';
import { audit } from '../../services/audit.js';
import { REFRESH_COOKIE, refreshCookieOptions } from '../../services/tokens.js';
import { changePassword, createSession, getUserWithRelations, toUserDto } from '../auth/auth.service.js';

const MAX_ADDRESSES = 10;

async function ownAddress(userId, addressId) {
  const address = await prisma.address.findFirst({ where: { id: addressId, userId } });
  if (!address) throw notFound('Address');
  return address;
}

export const accountController = {
  async updateProfile(req, res) {
    const data = req.valid.body;
    await prisma.user.update({ where: { id: req.user.id }, data });
    await audit(req, 'account.profile_updated', { entityType: 'User', entityId: req.user.id, metadata: { fields: Object.keys(data) } });
    res.json({ user: toUserDto(await getUserWithRelations(req.user.id)) });
  },

  /** Changing the password signs out every other device and issues a fresh session here. */
  async changePassword(req, res) {
    const user = await changePassword(req.user.id, req.valid.body, req);
    const session = await createSession(user, clientInfo(req));
    res.cookie(REFRESH_COOKIE, session.refreshToken, refreshCookieOptions());
    res.json({ accessToken: session.accessToken, message: 'Password updated. Other devices have been signed out.' });
  },

  async listAddresses(req, res) {
    const items = await prisma.address.findMany({
      where: { userId: req.user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    res.json({ items });
  },

  async createAddress(req, res) {
    const count = await prisma.address.count({ where: { userId: req.user.id } });
    if (count >= MAX_ADDRESSES) throw unprocessable(`You can save up to ${MAX_ADDRESSES} addresses.`);
    const data = { ...req.valid.body, isDefault: req.valid.body.isDefault || count === 0 };
    const address = await prisma.$transaction(async (tx) => {
      if (data.isDefault) await tx.address.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });
      return tx.address.create({ data: { ...data, userId: req.user.id } });
    });
    res.status(201).json({ address });
  },

  async updateAddress(req, res) {
    await ownAddress(req.user.id, req.valid.params.id);
    const data = req.valid.body;
    const address = await prisma.$transaction(async (tx) => {
      if (data.isDefault) await tx.address.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });
      return tx.address.update({ where: { id: req.valid.params.id }, data });
    });
    res.json({ address });
  },

  async deleteAddress(req, res) {
    const address = await ownAddress(req.user.id, req.valid.params.id);
    await prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id: address.id } });
      if (address.isDefault) {
        const next = await tx.address.findFirst({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
    res.status(204).end();
  },
};
