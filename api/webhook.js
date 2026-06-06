// api/webhook.js
// Vercel Serverless Function adapter for webhook updates

module.exports = async (req, res) => {
  try {
    const { handleVercelRequest } = await import('../lib/core.js');
    return handleVercelRequest(req, res);
  } catch (error) {
    console.error('Error in Vercel webhook wrapper:', error);
    return res.status(200).send('OK'); // Always return 200 OK to Telegram
  }
};
