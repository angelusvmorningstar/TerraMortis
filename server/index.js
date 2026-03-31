import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { connectDb, closeDb, isConnected } from './db.js';
import charactersRouter from './routes/characters.js';

const app = express();

// CORS — allow multiple origins from comma-separated config
const allowedOrigins = config.CORS_ORIGIN.split(',').map(o => o.trim());
app.use(cors({
  origin(origin, callback) {
    // Allow requests with no origin (curl, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

app.use(express.json());

// Health check — proves DB connectivity
app.get('/api/health', (req, res) => {
  const dbStatus = isConnected() ? 'connected' : 'disconnected';
  const httpStatus = dbStatus === 'connected' ? 200 : 503;
  res.status(httpStatus).json({ status: dbStatus === 'connected' ? 'ok' : 'error', db: dbStatus });
});

// Route mounting
app.use('/api/characters', charactersRouter);

// Start server first, then attempt DB connection
// Server must be reachable even if MongoDB is unavailable
async function start() {
  app.listen(config.PORT, () => {
    console.log(`TM Suite API running on port ${config.PORT} (${config.NODE_ENV})`);
  });

  try {
    await connectDb();
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err.message);
    console.error('Health check will report disconnected status');
  }
}

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n${signal} received — shutting down`);
  closeDb().then(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
