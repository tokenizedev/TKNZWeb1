import postNewTokens from './postNewTokens.js';

export const handler = async (event, context) => {
  const { body } = await postNewTokens()
  return {
    statusCode: 200,
    body
  };
}
