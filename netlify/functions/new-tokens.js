import parseNewTokens from './parseNewTokens.js';

export const handler = async (event, context) => {
  const { body } = await parseNewTokens()
  return {
    statusCode: 200,
    body
  };
}
