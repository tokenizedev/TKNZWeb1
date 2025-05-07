import axios from 'axios';

export const config = { schedule: '*/10 * * * *' };

export const handler = async (_req, _res) => {
  const response = await axios.post('https://tknz.fun/.netlify/functions/update-leaderboard-background', {
    headers: {
      'Authorization': `Bearer ${process.env.WEBHOOK_SECRET}`,
    },
  });
  return response.data;
};
