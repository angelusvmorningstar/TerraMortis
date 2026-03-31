import { MongoClient } from 'mongodb';
import { config } from './config.js';

let client;
let db;

export async function connectDb() {
  client = new MongoClient(config.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  });
  await client.connect();
  db = client.db('tm_suite');
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
