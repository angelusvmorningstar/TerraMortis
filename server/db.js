import { MongoClient } from 'mongodb';
import { config } from './config.js';

let client;
let db;

export async function connectDb() {
  if (db) return; // Already connected — idempotent for test suites sharing a process
  // Strip legacy ssl= param — not accepted by MongoDB driver v7
  const uri = config.MONGODB_URI.replace(/[&?]ssl=[^&]*/g, '');
  client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    tls: true,
  });
  await client.connect();
  db = client.db(process.env.MONGODB_DB || 'tm_suite');
  console.log('MongoDB connected successfully');
}

export function getDb() {
  if (!db) throw new Error('Database not connected — call connectDb() first');
  return db;
}

export function getCollection(name) {
  return getDb().collection(name);
}

// Returns true if the DB connection is alive
export function isConnected() {
  try {
    return !!db;
  } catch {
    return false;
  }
}

export async function closeDb() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('MongoDB connection closed');
  }
}
