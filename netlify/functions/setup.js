// netlify/functions/setup.js
// Netlify Function adapter for webhook configuration

exports.handler = async function(event, context) {
  const { handleNetlifyRequest } = await import('../../lib/core.js');
  return handleNetlifyRequest(event, context);
};
