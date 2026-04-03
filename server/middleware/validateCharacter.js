/**
 * Express middleware: validates req.body against the character JSON Schema.
 * Returns 400 with structured error list on failure.
 */

import Ajv from 'ajv';
import { characterSchema } from '../schemas/character.schema.js';

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(characterSchema);

export function validateCharacter(req, res, next) {
  const valid = validate(req.body);
  if (valid) return next();

  const errors = validate.errors.map(e => ({
    path:    e.instancePath || '(root)',
    message: e.message,
    ...(e.params?.additionalProperty
      ? { property: e.params.additionalProperty }
      : {})
  }));

  return res.status(400).json({
    error:   'VALIDATION_ERROR',
    message: `Character data failed schema validation (${errors.length} error${errors.length === 1 ? '' : 's'})`,
    errors
  });
}
