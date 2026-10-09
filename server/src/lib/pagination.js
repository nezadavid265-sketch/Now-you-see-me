import { z } from 'zod';

export const paginationSchema = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export function paginate({ page = 1, pageSize = 20 } = {}) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function pageResult(items, total, { page = 1, pageSize = 20 } = {}) {
  return {
    items,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}
