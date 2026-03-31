import 'dotenv/config';

export const config = {
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/tm_suite',
  PORT: parseInt(process.env.PORT, 10) || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:8080',
};
