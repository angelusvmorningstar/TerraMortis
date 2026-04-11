import { Router } from 'express';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { generateToStream } = require('../lib/pdf-gen/generate.cjs');

const router = Router();

/**
 * POST /api/pdf/character
 * Accepts resolved character JSON (print-character schema) in the request body.
 * Returns a streamed PDF.
 */
router.post('/character', async (req, res) => {
  const data = req.body;
  if (!data || !data.identity) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Missing character data' });
  }

  const name = (data.identity.name || 'character').replace(/[^a-zA-Z0-9]/g, '_');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${name}_sheet.pdf"`);

  try {
    await generateToStream(data, res);
  } catch (err) {
    // If headers already sent, can't send JSON error — just end
    if (!res.headersSent) {
      res.status(500).json({ error: 'PDF_ERROR', message: err.message });
    }
  }
});

export default router;
