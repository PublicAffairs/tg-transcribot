// api/webhook.js
// Vercel Serverless Function adapter for webhook updates and dashboard

const pkg = require('../package.json');

module.exports = async (req, res) => {
  try {
    await import('../lib/core.js'); // registers HTTP routes and config builder via side-effects
    const { handleVercelRequest } = await import('../lib/framework/adapters.js');
    return handleVercelRequest(req, res, { BOT_VERSION: pkg.version });
  } catch (error) {
    console.error('Error in Vercel webhook wrapper:', error);
    return res.status(200).send('OK'); // Always return 200 OK to Telegram
  }
};
