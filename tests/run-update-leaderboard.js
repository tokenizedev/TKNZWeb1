import dotenv from 'dotenv';
import { handler } from '../netlify/functions/update-leaderboard-background.js';

dotenv.config();

handler({}, {});



