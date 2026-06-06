/**
 * ops_set_avatar.js
 * Category: Operations / Admin Tool
 * 
 * Configures the Telegram Bot's profile photo (avatar) and metadata (name, description, short description)
 * by contacting the Telegram Bot API.
 * 
 * Usage:
 *   npm run set-avatar
 */

const fs = require('fs');
const path = require('path');


// Simple function to load env files
function loadEnv() {
  const envFiles = ['.env.local', '.env.production', '.env'];
  for (const file of envFiles) {
    const envPath = path.join(__dirname, '..', file);
    if (fs.existsSync(envPath)) {
      console.log(`Loading environment variables from: ${file}`);
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        if (line.trim().startsWith('#') || !line.trim()) return;
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let val = match[2] || '';
          if (val.startsWith('"') && val.endsWith('"')) {
            val = val.substring(1, val.length - 1);
          } else if (val.startsWith("'") && val.endsWith("'")) {
            val = val.substring(1, val.length - 1);
          }
          process.env[key] = val;
        }
      });
      break; // Stop at the first found env file to maintain priority
    }
  }
}

loadEnv();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('❌ Error: TELEGRAM_BOT_TOKEN is not defined in .env files or environment');
  process.exit(1);
}

async function setAvatar() {
  let fileData = null;
  let fileName = '';
  const rootDir = path.join(__dirname, '..');
  
  const possibleFiles = ['avatar.jpg', 'avatar.png', 'avatar.jpeg'];
  for (const file of possibleFiles) {
    const filePath = path.join(rootDir, file);
    if (fs.existsSync(filePath)) {
      fileData = fs.readFileSync(filePath);
      fileName = file;
      break;
    }
  }
  
  if (!fileData) {
    console.error('❌ Error: No avatar.jpg, avatar.png, or avatar.jpeg found in the project root directory.');
    console.log('Please place your avatar image file in the project root and run this script again.');
    process.exit(1);
  }
  
  console.log(`Found avatar file: ${fileName} (${fileData.length} bytes)`);
  console.log('Uploading bot profile photo to Telegram...');
  
  const mimeType = fileName.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const blob = new Blob([fileData], { type: mimeType });
  const formData = new FormData();
  formData.append('photo', blob, fileName);
  
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setMyProfilePhoto`, {
      method: 'POST',
      body: formData
    });
    
    const data = await res.json();
    if (data.ok) {
      console.log('✅ Success: Bot profile photo updated successfully!');
      console.log(data);
    } else {
      console.error('❌ Failed to update bot profile photo:', data.description);
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Request error:', err);
    process.exit(1);
  }
}

setAvatar();
