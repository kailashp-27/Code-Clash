import 'dotenv/config';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing. Run npm run setup from the project root.');
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'replace-with-a-random-secret') {
  throw new Error('JWT_SECRET is missing or a placeholder. Run npm run setup or set a random secret in server/.env.');
}

const port = Number(process.env.PORT || 5000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

export const config = {
  moderatorIds: (process.env.MODERATOR_USER_IDS || '').split(',').map(id => id.trim()).filter(Boolean),
  port,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  judge0Url: (process.env.JUDGE0_URL || 'http://localhost:2358').replace(/\/$/, ''),
  clientOrigins: (process.env.CLIENT_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',').map(origin => origin.trim()).filter(Boolean),
};
