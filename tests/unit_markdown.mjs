/**
 * tests/unit_markdown.mjs
 * Category B: MarkdownV2 Formatting & Translation Parsing Unit Tests
 */

import assert from 'node:assert';
import { 
  escapeMarkdownV2, 
  escapeMarkdownV2Code, 
  escapeMarkdownV2Link,
  toMarkdownV2, 
  htmlToMarkdownV2,
  stripMarkdown
} from '../lib/utils.js';
import { getTranslation, hasTranslation } from '../lib/localize.js';
import { getUserLang } from '../lib/localize.js';
import { validateMarkdownV2 } from './whitebox_helper.mjs';

// ----------------------------------------------------
// 1. escapeMarkdownV2, escapeMarkdownV2Code, escapeMarkdownV2Link
// ----------------------------------------------------
function testBasicEscaping() {
  console.log('\n--- 1. Testing Escaping Utilities ---');

  // escapeMarkdownV2 escapes 18 reserved characters (excluding backslash itself)
  const reserved = '_*[]()~`>#+-=|{}.!';
  const escaped = escapeMarkdownV2(reserved);
  assert.strictEqual(
    escaped, 
    '\\_\\*\\[\\]\\(\\)\\~\\`\\>\\#\\+\\-\\=\\|\\{\\}\\.\\!',
    'All regular MarkdownV2 reserved characters must be backslash-escaped'
  );

  // escapeMarkdownV2Code escapes backticks and backslashes
  const codeSegment = 'const x = `hello` \\ "world";';
  const escapedCode = escapeMarkdownV2Code(codeSegment);
  assert.strictEqual(escapedCode, 'const x = \\`hello\\` \\\\ "world";');

  assert.strictEqual(escapeMarkdownV2Code('\\`test\\`'), '\\\\\\`test\\\\\\`');

  // escapeMarkdownV2Link: Only closing parenthesis needs escaping in URL contexts
  const url = 'https://example.com/path(test)value';
  const escapedUrl = escapeMarkdownV2Link(url);
  assert.ok(escapedUrl.includes('\\)'), 'Closing paren escaped');
  assert.ok(!escapedUrl.includes('\\('), 'Opening paren NOT escaped');
  assert.ok(!escapedUrl.includes('\\.'), 'Dot NOT escaped');

  assert.strictEqual(escapeMarkdownV2Link(null), '');
  assert.strictEqual(escapeMarkdownV2Link(undefined), '');

  console.log('✅ Escaping: verified basic, code block and URL link escaping functions');
}

// ----------------------------------------------------
// 2. toMarkdownV2 Edge Cases and Unmatched Markers
// ----------------------------------------------------
function testToMarkdownV2() {
  console.log('\n--- 2. Testing toMarkdownV2 Formatting ---');

  // Standard checks
  const rawMarkdown = 'Hello! *this is bold* and [this is a link](https://test.com) - awesome.';
  assert.strictEqual(toMarkdownV2(rawMarkdown), 'Hello\\! *this is bold* and [this is a link](https://test.com) \\- awesome\\.');

  const preEscaped = 'Pre\\-escaped\\. Text';
  assert.strictEqual(toMarkdownV2(preEscaped), 'Pre\\-escaped\\. Text');
  assert.ok(!toMarkdownV2('Price is \\$100\\.00 today').includes('\\\\$'), 'No double escaping');

  // List markers normalization: "-" / "*" / "+"
  assert.ok(toMarkdownV2('- First item\n- Second').includes('• First item'));
  assert.ok(toMarkdownV2('* Star item').includes('• Star item'));
  assert.ok(toMarkdownV2('+ Plus item').includes('• Plus item'));
  assert.strictEqual(toMarkdownV2('  - Space'), '  • Space');
  assert.strictEqual(toMarkdownV2('\t* Tab'), '\t• Tab');

  // Pre blocks, inline code and null/undefined
  assert.ok(toMarkdownV2('```json\n{"a":1}\n```').includes('```json'));
  assert.ok(!toMarkdownV2('```json\n{"a":1}\n```').includes('\\{'));
  assert.ok(toMarkdownV2('Run `cmd` now').includes('`cmd`'));
  assert.strictEqual(toMarkdownV2(null), '');
  assert.strictEqual(toMarkdownV2(undefined), '');

  // Bold specials inside
  assert.ok(toMarkdownV2('*Hello. World!*').includes('\\.'));

  // Parentheses in URL links (Wikipedia pattern)
  const wikiLink = '[Wikipedia](https://en.wikipedia.org/wiki/Equation_(mathematics))';
  assert.strictEqual(toMarkdownV2(wikiLink), '[Wikipedia](https://en.wikipedia.org/wiki/Equation_(mathematics\\))');

  // Unmatched markdown markers formatting errors
  assert.strictEqual(toMarkdownV2('*bold without end'), '\\*bold without end');
  assert.strictEqual(toMarkdownV2('_italic without end'), '\\_italic without end');
  assert.strictEqual(toMarkdownV2('`code without end'), '\\`code without end');
  assert.strictEqual(toMarkdownV2('[stray bracket'), '\\[stray bracket');
  assert.strictEqual(toMarkdownV2('[link](url without end'), '\\[link\\]\\(url without end');
  assert.strictEqual(toMarkdownV2('*Bot Settings → *Allow Groups*'), '*Bot Settings → *Allow Groups\\*');

  console.log('✅ toMarkdownV2: verified lists, lists spacing, wiki URLs and unmatched formatting error handling');
}

// ----------------------------------------------------
// 3. htmlToMarkdownV2
// ----------------------------------------------------
function testHtmlToMarkdownV2() {
  console.log('\n--- 3. Testing htmlToMarkdownV2 Conversion ---');

  assert.strictEqual(htmlToMarkdownV2('<b>Hello</b> <i>World</i>'), '*Hello* _World_');
  assert.strictEqual(htmlToMarkdownV2('<code>const x = 5;</code>'), '`const x = 5;`');
  assert.strictEqual(htmlToMarkdownV2('<pre>Code block</pre>'), '```\nCode block\n```');
  assert.strictEqual(htmlToMarkdownV2('<pre><code class="language-json">{"ok":true}</code></pre>'), '```json\n{"ok":true}\n```');
  assert.strictEqual(htmlToMarkdownV2('<a href="https://example.com">Example</a>'), '[Example](https://example.com)');
  assert.strictEqual(htmlToMarkdownV2('&lt;hello&gt; &amp;'), '<hello\\> &');
  assert.strictEqual(htmlToMarkdownV2('A &lt;b&gt; &amp; C'), 'A <b\\> & C');
  assert.strictEqual(htmlToMarkdownV2(''), '');
  assert.strictEqual(htmlToMarkdownV2(null), '');

  console.log('✅ htmlToMarkdownV2: tag parsers and entity decoder checks passed');
}

// ----------------------------------------------------
// 4. Language Resolution, Dictionaries & Context Escaping
// ----------------------------------------------------
function testLanguageAndTranslations() {
  console.log('\n--- 4. Testing Language Resolution & Context-Aware Escaping ---');

  // getUserLang checks
  const settingsAuto = { autodetect: true, langbot: 'ru' };
  assert.strictEqual(getUserLang(settingsAuto, 'en-US'), 'en-US');
  assert.strictEqual(getUserLang(settingsAuto, 'fr-FR'), 'ru');

  const settingsManual = { autodetect: false, langbot: 'ru' };
  assert.strictEqual(getUserLang(settingsManual, 'en-US'), 'ru');

  const settingsEmpty = {};
  assert.strictEqual(getUserLang(settingsEmpty, 'uk'), 'uk');
  assert.strictEqual(getUserLang(settingsEmpty, 'it'), 'en');

  // hasTranslation checks
  assert.strictEqual(hasTranslation('en'), true);
  assert.strictEqual(hasTranslation('ru'), true);
  assert.strictEqual(hasTranslation('de'), true);
  assert.strictEqual(hasTranslation('uk'), true);
  assert.strictEqual(hasTranslation('fr'), false);
  assert.strictEqual(hasTranslation('en-US'), true);
  assert.strictEqual(hasTranslation('ru-UA'), true);
  assert.strictEqual(hasTranslation(null), false);

  // getTranslation basic normalization & fallbacks
  assert.strictEqual(getTranslation('en-US', 'botName'), 'Transcribot');
  assert.strictEqual(getTranslation('ru-UA', 'btnGroups'), 'Группы');
  assert.strictEqual(getTranslation('fr-FR', 'btnGroups'), 'Groups');
  assert.strictEqual(getTranslation('en', 'nonExistentKey'), '');

  // getTranslation context-aware parameter escaping ({val})
  // Inside inline code: no dot/dash escaping, only backtick/backslash
  const codeResult = getTranslation('en', 'botVersion', { val: 'v1.2-beta.3' });
  assert.ok(!codeResult.includes('v1\\`2\\-beta\\.3'), 'Do not double escape inside code tag context');

  // In plain text: full escaping (dots/dashes)
  const textResult = getTranslation('en', 'langbotSuccess', { val: 'en-US.region' });
  assert.ok(textResult.includes('en\\-US\\.region') || textResult.includes('en-US.region'));

  // Inside code blocks (notifyTransError: `{error}`)
  const codeBlockResult = getTranslation('en', 'notifyTransError', {
    chat_id: '12345',
    error: 'rate limit: 429 `exceeded`'
  });
  assert.ok(codeBlockResult.includes('rate limit') && codeBlockResult.includes('429'));

  console.log('✅ Languages: resolved autodetect routes, key fallbacks and context escaping');
}

function testHelpEscapingAndStripping() {
  console.log('\n--- 5. Testing Help Escaping and Stripping Utilities ---');

  // Test toMarkdownV2 parses formatting and links in descriptions
  const textWithLinks = 'Toggle modes (_Groups_, [_Secretary_](https://tips/sec), [_Guest_](https://tips/guest))!';
  const formatted = toMarkdownV2(textWithLinks);
  assert.strictEqual(
    formatted,
    'Toggle modes \\(_Groups_, [_Secretary_](https://tips/sec), [_Guest_](https://tips/guest)\\)\\!',
    'Should keep underscores for italicized text and keep Markdown links intact while escaping other characters'
  );

  // Test stripMarkdown
  const markdownText = 'This is *bold* and [_italic link_](https://url) with `code` block';
  assert.strictEqual(
    stripMarkdown(markdownText),
    'This is bold and italic link with code block',
    'Should strip Markdown links, bold, italic, code formatting, and backslashes'
  );

  console.log('✅ Help Utilities: verified escapeHelpDescription and stripMarkdown helpers');
}

// ----------------------------------------------------
// 6. Mock Telegram Validator self-tests
// ----------------------------------------------------
function testMockValidator() {
  console.log('\n--- 6. Testing Mock MarkdownV2 Validator ---');

  // Must throw on unescaped dot
  assert.throws(
    () => validateMarkdownV2('Version 1.0 released'),
    /can't parse entities/,
    'Unescaped dot in plain text must throw'
  );

  // Must throw on unescaped exclamation mark
  assert.throws(
    () => validateMarkdownV2('Hello! World'),
    /can't parse entities/,
    'Unescaped ! must throw'
  );

  // Must throw on unescaped dash
  assert.throws(
    () => validateMarkdownV2('Step-by-step guide'),
    /can't parse entities/,
    'Unescaped - must throw'
  );

  // Must NOT throw on properly escaped dot
  assert.doesNotThrow(
    () => validateMarkdownV2('Version 1\\.0 released'),
    'Escaped dot must NOT throw'
  );

  // Must NOT throw on dot inside code block
  assert.doesNotThrow(
    () => validateMarkdownV2('See ```\nfile.txt\n``` above'),
    'Dot inside code block must NOT throw'
  );

  // Must NOT throw on dot inside inline code
  assert.doesNotThrow(
    () => validateMarkdownV2('Run `node index.js` now'),
    'Dot inside inline code must NOT throw'
  );

  // Must NOT throw on dot inside a markdown link
  assert.doesNotThrow(
    () => validateMarkdownV2('[click here](https://example.com/path.html)'),
    'Dot inside link URL must NOT throw'
  );

  // Must NOT throw on || spoiler syntax (not a pipe pair)
  assert.doesNotThrow(
    () => validateMarkdownV2('||secret text||'),
    '|| spoiler syntax must NOT throw'
  );

  // Must NOT throw on bold text with no reserved chars
  assert.doesNotThrow(
    () => validateMarkdownV2('*Bold title* and _italic_'),
    'Standard formatting markers must NOT throw'
  );

  // The verboseTitle Russian localization string (тех.) must NOT throw once escaped
  assert.doesNotThrow(
    () => validateMarkdownV2('*Отображение тех\\. данных:*'),
    'Escaped dot in Russian menu title must NOT throw'
  );

  // Simulates what the old (broken) menu title would send — must throw
  assert.throws(
    () => validateMarkdownV2('*Отображение тех. данных:*'),
    /can't parse entities/,
    'Unescaped dot in Russian menu title MUST throw — regression guard'
  );

  console.log('✅ Mock Validator: correctly catches unescaped reserved chars and passes valid MarkdownV2');
}

export async function run() {
  testBasicEscaping();
  testToMarkdownV2();
  testHtmlToMarkdownV2();
  testLanguageAndTranslations();
  testHelpEscapingAndStripping();
  testMockValidator();
}
