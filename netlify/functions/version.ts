import { Handler } from '@netlify/functions'
const { tknz } = require('../../package.json')

export const handler: Handler = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      ...tknz
    })
  }
}