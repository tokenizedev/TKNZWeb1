import axios from 'axios';

export const config = { schedule: '*/1 * * * *' };

export default async (_req, _res) => {
  await axios.post('https://tknz.fun/.netlify/functions/send-new-tokens-background', {
    headers: {
      'Authorization': `Bearer ${process.env.WEBHOOK_SECRET}`,
    },
  });
};
