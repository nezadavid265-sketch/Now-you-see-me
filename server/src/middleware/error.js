import multer from 'multer';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { formatZodError } from './validate.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } });
}

export function errorHandler(err, req, res, _next) {
  let status = 500;
  let body = { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' };

  if (err instanceof AppError) {
    status = err.status;
    body = { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) };
  } else if (err instanceof ZodError) {
    status = 422;
    body = { code: 'VALIDATION_ERROR', message: 'Invalid input', details: formatZodError(err) };
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      status = 409;
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : err.meta?.target;
      body = { code: 'CONFLICT', message: `A record with this ${target ?? 'value'} already exists.` };
    } else if (err.code === 'P2025') {
      status = 404;
      body = { code: 'NOT_FOUND', message: 'Resource not found' };
    } else if (err.code === 'P2003') {
      status = 409;
      body = { code: 'CONFLICT', message: 'This record is referenced by other data and cannot be changed.' };
    }
  } else if (err instanceof multer.MulterError) {
    status = 400;
    const messages = {
      LIMIT_FILE_SIZE: 'Each image must be 5 MB or smaller.',
      LIMIT_FILE_COUNT: 'Too many files in one upload.',
      LIMIT_UNEXPECTED_FILE: 'Unexpected file field.',
    };
    body = { code: 'UPLOAD_ERROR', message: messages[err.code] ?? 'Upload failed.' };
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    body = { code: 'BAD_JSON', message: 'Malformed JSON body' };
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    body = { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' };
  }

  if (status >= 500) {
    logger.error({ err, reqId: req.id, path: req.path }, 'Unhandled error');
  }
  res.status(status).json({ error: body });
}
