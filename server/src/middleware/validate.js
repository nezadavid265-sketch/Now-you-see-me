import { unprocessable } from '../lib/errors.js';

export function formatZodError(error) {
  const fieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { fieldErrors };
}

/**
 * Validates and coerces request input. Parsed values are exposed on
 * `req.valid.{body,query,params}`; unknown body keys are stripped so clients
 * cannot smuggle fields such as `shopId`, `price` overrides or `role`.
 */
export const validate = (schemas) => (req, _res, next) => {
  req.valid ??= {};
  for (const key of ['params', 'query', 'body']) {
    if (!schemas[key]) continue;
    const result = schemas[key].safeParse(req[key] ?? {});
    if (!result.success) {
      throw unprocessable('Please check the highlighted fields and try again.', formatZodError(result.error));
    }
    req.valid[key] = result.data;
    if (key === 'body') req.body = result.data;
  }
  next();
};
