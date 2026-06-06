// lib/framework/dashboard.js
// Generic Dashboard / Landing Page renderer for Telegram Bots

import { parseWebhookConfig, buildWebhookSetup } from '../webhook-settings.js';
import { getHeader, sha256, callTelegram } from './utils.js';

export function makeDashboardHandler(options = {}) {
  const {
    botNameDefault = 'Telegram Bot',
    botDescriptionDefault = 'A serverless Telegram bot.',
    repoUrl = '#',
    repoName = 'repository',
    logoSvg = `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`,
    getSettingsSchema = (oldSettings) => oldSettings,
    getChecks = () => []
  } = options;

  return async (requestInfo, config) => {
    const token = config.telegramBotToken;
    let ownerId = null;
    let webhookRegistered = false;
    let webhookUrl = '';

    const proto = getHeader(requestInfo.headers, 'x-forwarded-proto') || 'https';
    const host = getHeader(requestInfo.headers, 'host');
    const baseUrl = config.webhookBaseUrl || `${proto}://${host}`;

    const hasBotToken = !!token;
    
    // Evaluate custom config checks
    const checks = getChecks(config);
    const failedCheck = checks.find(c => !c.ok);

    let isWebhookCorrect = false;
    let validationReason = '';
    let telegramErrorDescription = '';
    let oldWebhookUrl = '';
    let newWebhookUrl = '';
    let showTransition = false;
    let botUsername = null;
    let botName = null;


    let webhookRes = null;

    if (hasBotToken) {
      try {
        const results = await Promise.all([
          callTelegram(token, 'getWebhookInfo', {}),
          callTelegram(token, 'getMe', {})
        ]);
        webhookRes = results[0];
        const meRes = results[1];
        
        if (webhookRes && webhookRes.ok && webhookRes.result) {
          webhookUrl = webhookRes.result.url || '';
          const currentSettings = parseWebhookConfig(webhookRes.result);
          ownerId = currentSettings.owner || null;
          webhookRegistered = !!webhookUrl;
        }
        if (meRes.ok && meRes.result) {
          botUsername = meRes.result.username;
          botName = meRes.result.first_name;
        }
      } catch (e) {
        console.warn('Failed to retrieve bot info on landing page load:', e);
      }

      oldWebhookUrl = webhookUrl;
      const cleanBase = baseUrl.replace(/\/$/, '');
      const expectedWebhookPrefix = `${cleanBase}/api/webhook`;
      const needsRegistration = !webhookRegistered || !webhookUrl.startsWith(expectedWebhookPrefix);

      if (needsRegistration) {
        let isSupportedByTelegram = false;
        try {
          const parsedUrl = new URL(expectedWebhookPrefix);
          const isHttps = parsedUrl.protocol === 'https:';
          const port = parsedUrl.port;
          const isValidPort = !port || ['80', '88', '443', '8443'].includes(port);
          const isLocalhost = parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1';

          if (!isHttps) {
            validationReason = 'Telegram requires secure HTTPS.';
          } else if (!isValidPort) {
            validationReason = `Port ${port} is not supported.`;
          } else if (isLocalhost) {
            validationReason = 'Localhost address is not reachable.';
          } else {
            isSupportedByTelegram = true;
          }
        } catch (e) {
          validationReason = `Invalid URL structure: ${e.message}`;
        }

        if (!isSupportedByTelegram) {
          isWebhookCorrect = false;
        } else {
          try {
            const secretToken = await sha256(token);
            let oldSettings = {};
            if (webhookRegistered && webhookRes.ok && webhookRes.result) {
              oldSettings = parseWebhookConfig(webhookRes.result);
            }
            
            const defaultSettings = getSettingsSchema(oldSettings);
            const webhookSetup = buildWebhookSetup(baseUrl, token, defaultSettings, secretToken);
            newWebhookUrl = webhookSetup.url;
            
            const res = await callTelegram(token, 'setWebhook', webhookSetup);
            
            if (res.ok) {
              ownerId = defaultSettings.owner || null;
              webhookUrl = newWebhookUrl;
              isWebhookCorrect = true;
              showTransition = true;
            } else {
              telegramErrorDescription = res.description || res.error || JSON.stringify(res);
              isWebhookCorrect = false;
            }
          } catch (e) {
            telegramErrorDescription = e.message || String(e);
            isWebhookCorrect = false;
          }
        }
      } else {
        isWebhookCorrect = true;
      }
    }

    const cleanBase = baseUrl.replace(/\/$/, '');
    const expectedWebhookPrefix = `${cleanBase}/api/webhook`;

    let statusHtml;
    if (!hasBotToken) {
      statusHtml = `
        <div class="status-badge danger">X CONFIGURATION ERROR</div>
        <p style="color: var(--danger); font-weight: 600;">TELEGRAM_BOT_TOKEN is missing!</p>
        <p>Please configure the <code>TELEGRAM_BOT_TOKEN</code> environment variable on your platform to start the bot.</p>
      `;
    } else if (failedCheck) {
      statusHtml = `
        <div class="status-badge warning">⚠ ${failedCheck.name} MISSING</div>
        <p style="color: var(--warning); font-weight: 600;">${failedCheck.errorMsg}</p>
        <p>Please configure the required environment variables so that the bot can function normally.</p>
      `;
    } else if (!isWebhookCorrect) {
      if (validationReason) {
        statusHtml = `
          <div class="status-badge danger">X INVALID WEBHOOK URL</div>
          <div class="details" style="text-align: left; font-size: 0.95rem;">
            <div style="margin-bottom: 12px;">
              <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 4px;">Current Webhook</div>
              <div style="font-family: monospace; font-size: 0.9rem; word-break: break-all; color: var(--text-main);">${oldWebhookUrl || 'None'}</div>
            </div>
            <div style="margin-bottom: 12px;">
              <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 4px;">Attempted Webhook URL</div>
              <div style="font-family: monospace; font-size: 0.9rem; word-break: break-all; color: var(--text-main);">${expectedWebhookPrefix}</div>
            </div>
            <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px;">
              <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 4px;">Validation Blocked</div>
              <div style="color: var(--danger); font-weight: 600;">${validationReason}</div>
            </div>
          </div>
          <p style="margin-top: 20px; text-align: left; font-weight: 600;">To test real Telegram updates on this local machine:</p>
          <ul style="text-align: left; padding-left: 20px; font-size: 0.95rem; line-height: 1.6; color: var(--text-muted); margin-bottom: 20px;">
            <li style="margin-bottom: 12px;"><b>Option 1:</b> Run ngrok or localtunnel to establish a tunnel.</li>
            <li style="margin-bottom: 12px;"><b>Option 2:</b> Start the server with your tunnel URL as an argument</li>
            <li style="margin-bottom: 12px;"><b>Option 3:</b> Add the tunnel URL to your environment file.</li>
          </ul>
        `;
      } else {
        statusHtml = `
          <div class="status-badge danger">X WEBHOOK REGISTRATION FAILED</div>
          <div class="details" style="text-align: left; font-size: 0.95rem;">
            <div style="margin-bottom: 12px;">
              <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 4px;">Current Webhook</div>
              <div style="font-family: monospace; font-size: 0.9rem; word-break: break-all; color: var(--text-main);">${oldWebhookUrl || 'None'}</div>
            </div>
            <div style="margin-bottom: 12px;">
              <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 4px;">Attempted Webhook URL</div>
              <div style="font-family: monospace; font-size: 0.9rem; word-break: break-all; color: var(--text-main);">${newWebhookUrl || expectedWebhookPrefix}</div>
            </div>
            <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px;">
              <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 4px;">Telegram API Error</div>
              <div style="color: var(--danger); font-weight: 600;">${telegramErrorDescription || 'Request failed'}</div>
            </div>
          </div>
          <p>Please check your token or network connectivity and try again.</p>
        `;
      }
    } else {
      let transitionHtml = '';
      if (showTransition) {
        const isUpdate = !!oldWebhookUrl;
        const transitionHeading = isUpdate ? '✓ Webhook URL Updated' : '✓ Webhook Registered Successfully';
        const oldLabel = isUpdate ? 'Previous Webhook' : 'Previous Webhook';
        transitionHtml = `
          <div class="details" style="border-color: rgba(16, 185, 129, 0.15); background: rgba(16, 185, 129, 0.01); text-align: left; font-size: 0.95rem; margin-bottom: 16px;">
            <div style="color: var(--success); font-weight: 600; margin-bottom: 12px;">${transitionHeading}</div>
            <div style="margin-bottom: 12px;">
              <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 4px;">${oldLabel}</div>
              <div style="font-family: monospace; font-size: 0.9rem; word-break: break-all; color: var(--text-main);">${oldWebhookUrl || 'None'}</div>
            </div>
            <div>
              <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 4px;">New Webhook</div>
              <div style="font-family: monospace; font-size: 0.9rem; word-break: break-all; color: var(--text-main);">${newWebhookUrl}</div>
            </div>
          </div>
        `;
      }

      if (ownerId) {
        const botLinkHtml = botUsername
          ? `<a href="https://t.me/${botUsername}" target="_blank" style="color: #60a5fa; font-weight: 600; text-decoration: none; border-bottom: 1px dashed rgba(96, 165, 250, 0.4); padding-bottom: 1px; transition: color 0.2s;">${botName || botUsername} (@${botUsername})</a>`
          : 'Telegram';
        statusHtml = `
          <div class="status-badge active">✓ BOT ACTIVE & CONFIGURED</div>
          ${transitionHtml}
          <div class="details" style="text-align: left; font-size: 0.95rem;">
            <div>
              <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 4px;">Webhook Connection</div>
              <div style="font-family: monospace; font-size: 0.9rem; word-break: break-all; color: var(--success);">${webhookUrl}</div>
            </div>
          </div>
          <p>Your bot is running normally. You can configure settings directly inside ${botLinkHtml}.</p>
          <button id="resetBtn" class="btn btn-secondary">Reset Owner Chat</button>
        `;
      } else {
        const botLinkHtml = botUsername
          ? `<a href="https://t.me/${botUsername}" target="_blank" style="color: #60a5fa; font-weight: 600; text-decoration: none; border-bottom: 1px dashed rgba(96, 165, 250, 0.4); padding-bottom: 1px; transition: color 0.2s;">${botName || botUsername} (@${botUsername})</a>`
          : 'your bot';
        statusHtml = `
          <div class="status-badge warning">⚠ AWAITING OWNER REGISTRATION</div>
          ${transitionHtml}
          <p>To claim ownership and configure settings, please open Telegram and send any message directly to ${botLinkHtml}.</p>
        `;
      }
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${botNameDefault}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-color: #0b0f19;
      --card-bg: rgba(255, 255, 255, 0.03);
      --card-border: rgba(255, 255, 255, 0.07);
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --primary: #2563eb;
      --primary-hover: #3b82f6;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
    }
    body {
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: var(--bg-color);
      background-image: radial-gradient(circle at 50% 50%, #1e1b4b 0%, #0b0f19 80%);
      color: var(--text-main);
      margin: 0;
      padding: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .container {
      max-width: 500px;
      width: 100%;
      padding: 24px;
      box-sizing: border-box;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 24px;
      padding: 40px 32px;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
      text-align: center;
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }
    .card:hover {
      transform: translateY(-2px);
      box-shadow: 0 25px 50px rgba(0, 0, 0, 0.4);
    }
    .logo-container {
      display: inline-flex;
      justify-content: center;
      align-items: center;
      width: 80px;
      height: 80px;
      background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
      border-radius: 20px;
      margin-bottom: 24px;
      box-shadow: 0 8px 16px rgba(59, 130, 246, 0.3);
    }
    .logo-container svg {
      width: 40px;
      height: 40px;
      fill: #ffffff;
    }
    h1 {
      font-size: 2rem;
      font-weight: 800;
      margin: 0 0 8px 0;
      letter-spacing: -0.5px;
      background: linear-gradient(to right, #ffffff, #9ca3af);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    p {
      color: var(--text-muted);
      font-size: 1.05rem;
      line-height: 1.5;
      margin: 0 0 32px 0;
    }
    .status-badge {
      display: inline-block;
      padding: 8px 16px;
      font-size: 0.85rem;
      font-weight: 800;
      letter-spacing: 0.5px;
      border-radius: 9999px;
      margin-bottom: 24px;
    }
    .status-badge.active {
      background: rgba(16, 185, 129, 0.1);
      color: var(--success);
      border: 1px solid rgba(16, 185, 129, 0.2);
    }
    .status-badge.warning {
      background: rgba(245, 158, 11, 0.1);
      color: var(--warning);
      border: 1px solid rgba(245, 158, 11, 0.2);
    }
    .status-badge.danger {
      background: rgba(239, 68, 68, 0.1);
      color: var(--danger);
      border: 1px solid rgba(239, 68, 68, 0.2);
    }
    .details {
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 24px;
      text-align: left;
    }
    .btn {
      display: block;
      width: 100%;
      padding: 14px;
      font-size: 1rem;
      font-weight: 600;
      border-radius: 12px;
      border: none;
      cursor: pointer;
      transition: background-color 0.2s, transform 0.1s;
    }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-main);
      border: 1px solid var(--card-border);
      margin-top: 16px;
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    .footer {
      margin-top: 32px;
      border-top: 1px solid var(--card-border);
      padding-top: 24px;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    .footer a {
      color: #3b82f6;
      text-decoration: none;
      transition: color 0.2s;
    }
    .footer a:hover {
      color: #60a5fa;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo-container">
        ${logoSvg}
      </div>
      <h1>${botNameDefault}</h1>
      <p>${botDescriptionDefault}</p>
      
      ${statusHtml}
      
      <div class="footer">
        <p>Powered by <a href="${repoUrl}" target="_blank" style="display: inline-flex; align-items: center; vertical-align: middle; gap: 5px; margin-left: 4px;">
          <svg class="github-icon" viewBox="0 0 16 16" width="16" height="16" style="fill: currentColor;">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
          </svg>
          ${repoName}
        </a></p>
      </div>
    </div>
  </div>

  <script>
    document.getElementById('resetBtn')?.addEventListener('click', async () => {
      const token = prompt('Enter your Telegram Bot Token to authorize resetting the owner:');
      if (!token) return;
      
      try {
        const res = await fetch('/api/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reset_owner', token: token })
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          alert('Owner Chat ID has been successfully reset! Send a private message to the bot to claim ownership.');
          window.location.reload();
        } else {
          alert('Error: ' + (data.error || 'Invalid token or reset failed'));
        }
      } catch (err) {
        alert('Network error: ' + err.message);
      }
    });
  </script>
</body>
</html>`;

    return {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: html
    };
  };
}
