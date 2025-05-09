import axios from 'axios';

export const config = { schedule: '*/4 * * * *' };

export default async (_req, _res) => {
  await axios.post('https://tknz.fun/.netlify/functions/update-leaderboard-background', {
    headers: {
      'Authorization': `Bearer ${process.env.WEBHOOK_SECRET}`,
    },
  });
};
