/**
 * ci_check_localization.mjs
 * Category: Quality Assurance / CI Test
 * 
 * Verifies that all language dictionaries in lib/localize.js contain the exact same keys
 * and scans the codebase (except for localization code) to verify that all translation
 * keys are actively used and no unused keys are left in the dictionaries.
 * 
 * Usage:
 *   node scripts/ci_check_localization.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { translations } from '../lib/localize.js';
import { BOT_COMMANDS, getPublicCommands, getAdminCommands, generateHelpText } from '../lib/commands.js';
import { toMarkdownV2 } from '../lib/utils.js';


// Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Keys that are allowed to be English-only or optional in other languages
const optionalKeys = new Set([
  'botName',
  'botDescription',
  'botShortDescription',
  'promptDefault',
  'promptEmpty'
]);

// 1. Validate dictionaries have identical keys
const languages = Object.keys(translations);
console.log(`Checking dictionaries for languages: ${languages.join(', ')}`);

const englishKeys = Object.keys(translations.en || {});
console.log(`Base English dictionary contains ${englishKeys.length} keys.`);

let keysMismatch = false;

languages.forEach(lang => {
  if (lang === 'en') return;
  const langKeys = Object.keys(translations[lang] || {});
  
  // Find keys present in English but missing in target language (excluding optional keys)
  const missingInLang = englishKeys.filter(k => !langKeys.includes(k) && !optionalKeys.has(k));
  // Find keys present in target language but missing in English
  const extraInLang = langKeys.filter(k => !englishKeys.includes(k));
  
  if (missingInLang.length > 0) {
    console.error(`❌ Language [${lang}] is missing required keys: ${missingInLang.join(', ')}`);
    keysMismatch = true;
  }
  if (extraInLang.length > 0) {
    console.error(`❌ Language [${lang}] has extra keys not present in English: ${extraInLang.join(', ')}`);
    keysMismatch = true;
  }
  
  // Print optional keys info
  const missingOptional = englishKeys.filter(k => !langKeys.includes(k) && optionalKeys.has(k));
  if (missingOptional.length > 0) {
    console.log(`ℹ️ Language [${lang}] is missing optional keys (will fallback to English): ${missingOptional.join(', ')}`);
  }
});

if (keysMismatch) {
  console.error('❌ Mismatch in required translation keys across languages detected!');
} else {
  console.log('✅ All language dictionaries have identical required keys.');
}

// 2. Scan project files for key usages
const searchDirs = ['lib', 'api', 'src', 'scripts', 'netlify'];
const jsFiles = [];

function findJsFiles(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      findJsFiles(fullPath);
    } else if (file.endsWith('.js') || file.endsWith('.mjs')) {
      // Exclude check_localization and localize.js to avoid false self-matches
      if (file !== 'ci_check_localization.mjs' && file !== 'localize.js') {
        jsFiles.push(fullPath);
      }
    }
  });
}

searchDirs.forEach(d => findJsFiles(path.join(projectRoot, d)));
console.log(`Found ${jsFiles.length} JavaScript files to scan for localization keys.`);

const keyUsage = {};
englishKeys.forEach(k => {
  keyUsage[k] = {
    count: 0,
    files: []
  };
});

jsFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const relativePath = path.relative(projectRoot, file);
  
  englishKeys.forEach(key => {
    const escapedKey = key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    // Match the key as a full word boundary to detect both string literals ('key') and property access (.key)
    const regex = new RegExp(`\\b${escapedKey}\\b`, 'g');
    const matches = content.match(regex);
    if (matches) {
      keyUsage[key].count += matches.length;
      keyUsage[key].files.push(`${relativePath} (matches: ${matches.length})`);
    }
  });
});

// 3. Report findings
let unusedCount = 0;

const ignoredUnusedKeys = new Set([
  'langbotSuccess', 'langSuccess', 'modelSuccess', 
  'verboseSuccess', 'promptSuccess', 'promptTruncated'
]);

console.log('\n=== UNUSED KEYS (Defined in dictionary but not found in JS files) ===');
englishKeys.forEach(key => {
  if (keyUsage[key].count === 0) {
    if (!ignoredUnusedKeys.has(key)) {
      console.log(`- ${key}`);
      unusedCount++;
    } else {
      console.log(`- ${key} (Ignored deprecated key)`);
    }
  }
});

if (unusedCount === 0) {
  console.log('✅ No unused keys found in dictionaries.');
}

// Exit with code 1 if there is a dictionary key mismatch, unused keys, or formatting errors.
// 4. Validate Markdown Formatting in all translations
let formattingError = false;
console.log('\n=== VALIDATING MARKDOWN FORMATTING IN DICTIONARIES ===');

function validateMarkdownFormatting(text) {
  if (typeof text !== 'string') return null;
  // Remove pre code blocks and inline code blocks first, so formatting inside them is ignored
  let cleanText = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
  // Remove escaped characters and formatting placeholders like {max_mb} or {chat_id}
  cleanText = cleanText.replace(/\\./g, '').replace(/\{[a-zA-Z0-9_]+\}/g, '');
  
  // Count unescaped format characters
  const asterisks = (cleanText.match(/\*/g) || []).length;
  const underscores = (cleanText.match(/_/g) || []).length;
  const backticks = (cleanText.match(/`/g) || []).length;
  
  if (asterisks % 2 !== 0) return 'Unbalanced bold characters (*)';
  if (underscores % 2 !== 0) return 'Unbalanced italic characters (_)';
  if (backticks % 2 !== 0) return 'Unbalanced inline code characters (`)';
  
  // Count brackets and parentheses for links
  const openBrackets = (cleanText.match(/\[/g) || []).length;
  const closeBrackets = (cleanText.match(/\]/g) || []).length;
  const openParens = (cleanText.match(/\(/g) || []).length;
  const closeParens = (cleanText.match(/\)/g) || []).length;
  
  if (openBrackets !== closeBrackets) return 'Unbalanced link brackets ([ and ])';
  if (openParens !== closeParens) return 'Unbalanced URL parentheses (( and ))';
  
  return null;
}

languages.forEach(lang => {
  const dict = translations[lang] || {};
  Object.keys(dict).forEach(key => {
    const text = dict[key];
    const err = validateMarkdownFormatting(text);
    if (err) {
      console.error(`❌ [${lang}] Key "${key}" has malformed markdown: ${err}`);
      console.error(`   Content: "${text.replace(/\n/g, ' ')}"`);
      formattingError = true;
    }
  });
});

if (!formattingError) {
  console.log('✅ All localization strings have balanced Markdown formatting.');
}

// 5. Verify dynamic command descriptions registration & dynamic help compiler
let menuSyncError = false;
console.log('\n=== VERIFYING DYNAMIC COMMANDS REGISTRATION & HELP MENU ===');

try {
  // A. Verify BOT_COMMANDS is sorted alphabetically by command name
  const sortedNames = BOT_COMMANDS.map(c => c.command).slice().sort();
  BOT_COMMANDS.forEach((c, idx) => {
    if (c.command !== sortedNames[idx]) {
      console.error(`❌ BOT_COMMANDS is not sorted alphabetically! Expected index ${idx} to be "${sortedNames[idx]}", got "${c.command}"`);
      menuSyncError = true;
    }
  });

  languages.forEach(lang => {


    // C. Verify all registered BOT_COMMANDS have localized description keys
    BOT_COMMANDS.forEach(cmd => {
      if (!translations[lang]?.[cmd.descriptionKey]) {
        console.error(`❌ Language [${lang}] is missing description key "${cmd.descriptionKey}" for command "/${cmd.command}"`);
        menuSyncError = true;
      }
    });

    // D. Verify getPublicCommands and getAdminCommands return correct counts, keys and sorting
    const publicCmds = getPublicCommands(lang);
    const adminCmds = getAdminCommands(lang);

    // Verify public commands filter admin commands
    publicCmds.forEach(c => {
      const orig = BOT_COMMANDS.find(o => o.command === c.command && !o.isAdmin);
      if (!orig) {
        console.error(`❌ [${lang}] Public command "/${c.command}" has no corresponding public registration`);
        menuSyncError = true;
      }
    });

    // Verify alphabetical sorting of returned menus
    const publicSorted = [...publicCmds].sort((a, b) => a.command.localeCompare(b.command));
    publicCmds.forEach((c, idx) => {
      if (c.command !== publicSorted[idx].command) {
        console.error(`❌ [${lang}] getPublicCommands is not sorted alphabetically!`);
        menuSyncError = true;
      }
    });

    const adminSorted = [...adminCmds].sort((a, b) => a.command.localeCompare(b.command));
    adminCmds.forEach((c, idx) => {
      if (c.command !== adminSorted[idx].command) {
        console.error(`❌ [${lang}] getAdminCommands is not sorted alphabetically!`);
        menuSyncError = true;
      }
    });

    // E. Verify generateHelpText outputs correctly and does not duplicate command entries
    const userHelp = generateHelpText(false, lang, { version: '1.2.3' });
    const adminHelp = generateHelpText(true, lang, { version: '1.2.3' });

    // Ensure version and repo link are included
    if (!userHelp.includes('1.2.3') || !adminHelp.includes('1.2.3')) {
      console.error(`❌ [${lang}] generateHelpText did not include the version number`);
      menuSyncError = true;
    }
    if (!userHelp.includes('github.com') || !adminHelp.includes('github.com')) {
      console.error(`❌ [${lang}] generateHelpText did not include the repository link`);
      menuSyncError = true;
    }
    // Ensure command lines are compiled
    BOT_COMMANDS.forEach(cmd => {
      const desc = translations[lang]?.[cmd.descriptionKey] || cmd.command;
      const expectedLine = `/${cmd.command} \\- ${toMarkdownV2(desc)}`;
      const userHasCmd = userHelp.includes(expectedLine);
      const adminHasCmd = adminHelp.includes(expectedLine);

      if (cmd.isAdmin) {
        if (userHasCmd) {
          console.error(`❌ [${lang}] Non-owner help contains admin command "${expectedLine}"`);
          menuSyncError = true;
        }
        if (!adminHasCmd) {
          console.error(`❌ [${lang}] Owner help is missing admin command "${expectedLine}"`);
          menuSyncError = true;
        }
      } else {
        if (!userHasCmd) {
          console.error(`❌ [${lang}] Non-owner help is missing user command "${expectedLine}"`);
          menuSyncError = true;
        }
        if (!adminHasCmd) {
          console.error(`❌ [${lang}] Owner help is missing user command "${expectedLine}"`);
          menuSyncError = true;
        }
      }

      // Check for duplicate command strings in help text (allow prompt to appear in both sections)
      const occurrences = (adminHelp.match(new RegExp(`\\/${cmd.command}\\b`, 'g')) || []).length;
      const maxAllowed = cmd.command === 'prompt' ? 2 : 1;
      if (occurrences > maxAllowed) {
        console.error(`❌ [${lang}] Command "/${cmd.command}" is duplicated in help text (${occurrences} occurrences)`);
        menuSyncError = true;
      }
    });
  });
} catch (e) {
  console.error('❌ Error verifying dynamic commands/help:', e.stack || e.message);
  menuSyncError = true;
}

if (!menuSyncError) {
  console.log('✅ Dynamic commands registration, translations, and help texts verified successfully.');
}

if (keysMismatch || unusedCount > 0 || formattingError || menuSyncError) {
  console.error('\n❌ Localization check failed: errors detected.');
  process.exit(1);
} else {
  console.log('\n✅ Localization checks completed successfully.');
  process.exit(0);
}
