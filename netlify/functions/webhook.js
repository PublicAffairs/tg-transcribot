// netlify/functions/webhook.js
// Netlify Function adapter for webhook updates

exports.handler = async function(event, context) {
  const { handleNetlifyRequest } = await import('../../lib/core.js');
  return handleNetlifyRequest(event, context);
};
