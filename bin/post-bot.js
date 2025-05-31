import dotenv from 'dotenv';
import { handler } from '../netlify/functions/send-new-tokens-v2-background.js';

dotenv.config();

handler({}, {});
