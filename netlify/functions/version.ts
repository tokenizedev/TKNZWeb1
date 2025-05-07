import { Handler } from '@netlify/functions'
const { tknz } = require('../../package.json')

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      ...tknz
    })
  };
}