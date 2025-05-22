import dotenv from 'dotenv';
import { handler } from '../netlify/functions/update-leaderboard-background.js';

dotenv.config();

// Parse dry-run flag from CLI args or environment
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || process.env.DRY_RUN === 'true';
const event = { dryRun };

(async () => {
  try {
    const res = await handler(event, {});
    console.log('Handler response:', res);
    process.exit(0);
  } catch (err) {
    console.error('Error running handler:', err);
    process.exit(1);
  }
})();
