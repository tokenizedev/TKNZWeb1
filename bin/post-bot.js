import dotenv from 'dotenv';
import { handler } from '../netlify/functions/send-new-tokens-background.js';

dotenv.config();

handler({}, {});
