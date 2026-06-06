// api/setup.js
// Vercel Serverless Function adapter for webhook configuration

const pkg = require('../package.json');

module.exports = async (req, res) => {
  try {
    await import('../lib/core.js'); // registers HTTP routes and config builder via side-effects
    const { handleVercelRequest } = await import('../lib/framework/adapters.js');
    return handleVercelRequest(req, res, { BOT_VERSION: pkg.version });
  } catch (error) {
    console.error('Error in Vercel setup wrapper:', error);
    return res.status(500).json({
      ok: false,
      error: `Internal server exception: ${error.message || error}`
    });
  }
};
