// netlify/functions/setup.js
// Netlify Function adapter for webhook configuration

const pkg = require('../../package.json');

exports.handler = async function(event, context) {
  const { handleNetlifyRequest } = await import('../../lib/framework/adapters.js');
  return handleNetlifyRequest(event, context, { BOT_VERSION: pkg.version });
};
