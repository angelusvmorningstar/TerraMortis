/**
 * Express middleware: validates req.body against the character JSON Schema.
 * Returns 400 with structured error list on failure.
 */

import Ajv from 'ajv';
import { characterSchema, characterPartialSchema } from '../schemas/character.schema.js';

const ajv = new Ajv({ allErrors: true });
const validateFull = ajv.compile(characterSchema);
const validatePartial = ajv.compile(characterPartialSchema);

function _validate(validator, req, res, next) {
  if (validator(req.body)) return next();

  const errors = validator.errors.map(e => ({
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

/** Full validation — all required fields enforced. Use for POST (new documents). */
export function validateCharacter(req, res, next) {
  _validate(validateFull, req, res, next);
}

/** Partial validation — types/shapes checked, no required fields. Use for PUT (partial updates). */
export function validateCharacterPartial(req, res, next) {
  _validate(validatePartial, req, res, next);
}
