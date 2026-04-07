/**
 * Generic JSON Schema validation middleware factory.
 *
 * Usage:
 *   import { validate } from '../middleware/validate.js';
 *   import { playerSchema } from '../schemas/player.schema.js';
 *   router.post('/', validate(playerSchema), async (req, res) => { ... });
 *
 * Returns 400 with structured error list on validation failure.
 * Passes through to next() on success.
 */

import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, coerceTypes: false });

// Cache compiled validators by schema title to avoid recompilation
const cache = new Map();

export function validate(schema) {
  let compiledValidate = cache.get(schema.title);
  if (!compiledValidate) {
    compiledValidate = ajv.compile(schema);
    cache.set(schema.title, compiledValidate);
  }

  return (req, res, next) => {
    const valid = compiledValidate(req.body);
    if (valid) return next();

    const errors = compiledValidate.errors.map(e => ({
      path:    e.instancePath || '(root)',
      message: e.message,
      ...(e.params?.additionalProperty
        ? { property: e.params.additionalProperty }
        : {}),
    }));

    return res.status(400).json({
      error:   'VALIDATION_ERROR',
      message: `Request body failed schema validation (${errors.length} error${errors.length === 1 ? '' : 's'})`,
      errors,
    });
  };
}
