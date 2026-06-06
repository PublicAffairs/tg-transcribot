// lib/framework/markdown.js
// Universal MarkdownV2 escaping and HTML parsing utilities

/**
 * Escape regular text according to Telegram's MarkdownV2 rules.
 */
export function escapeMarkdownV2(text) {
  if (text === null || text === undefined) return '';
  return String(text).replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

/**
 * Escape text inside inline code or preformatted code blocks.
 */
export function escapeMarkdownV2Code(text) {
  if (text === null || text === undefined) return '';
  return String(text).replace(/[\\`]/g, '\\$&');
}

/**
 * Escape text inside link URLs in MarkdownV2.
 */
export function escapeMarkdownV2Link(text) {
  if (text === null || text === undefined) return '';
  return String(text).replace(/[)]/g, '\\$&');
}

/**
 * Parse HTML string and convert standard HTML formatting tags to MarkdownV2.
 */
export function htmlToMarkdownV2(html) {
  if (html === null || html === undefined) return '';
  
  let processedHtml = String(html)
    .replace(/<pre><code\s+class="language-json">/gi, '<pre class="json">')
    .replace(/<\/code><\/pre>/gi, '</pre>');

  let result = '';
  let index = 0;
  
  const stateStack = [];
  let currentLinkUrl = null;
  
  const tagRegex = /<(\/?[a-zA-Z0-9]+)(?:\s+[^>]*)?>/g;
  let match;
  
  function decodeHtmlEntities(text) {
    return text
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  function escapeSegment(text) {
    const decoded = decodeHtmlEntities(text);
    if (stateStack.includes('code') || stateStack.includes('pre')) {
      return escapeMarkdownV2Code(decoded);
    }
    return escapeMarkdownV2(decoded);
  }

  while ((match = tagRegex.exec(processedHtml)) !== null) {
    const tagStart = match.index;
    const tagText = match[0];
    const tagName = match[1].toLowerCase();
    
    if (tagStart > index) {
      result += escapeSegment(processedHtml.substring(index, tagStart));
    }
    
    if (tagName === 'b') {
      stateStack.push('bold');
      result += '*';
    } else if (tagName === '/b') {
      if (stateStack[stateStack.length - 1] === 'bold') {
        stateStack.pop();
        result += '*';
      }
    } else if (tagName === 'i') {
      stateStack.push('italic');
      result += '_';
    } else if (tagName === '/i') {
      if (stateStack[stateStack.length - 1] === 'italic') {
        stateStack.pop();
        result += '_';
      }
    } else if (tagName === 'code') {
      stateStack.push('code');
      result += '`';
    } else if (tagName === '/code') {
      if (stateStack[stateStack.length - 1] === 'code') {
        stateStack.pop();
        result += '`';
      }
    } else if (tagName === 'pre') {
      const classMatch = tagText.match(/class="([^"]+)"/i) || tagText.match(/class='([^']+)'/i);
      const langClass = classMatch ? classMatch[1] : '';
      stateStack.push('pre');
      if (langClass) {
        result += '```' + langClass + '\n';
      } else {
        result += '```\n';
      }
    } else if (tagName === '/pre') {
      if (stateStack[stateStack.length - 1] === 'pre') {
        stateStack.pop();
        if (!result.endsWith('\n')) {
          result += '\n';
        }
        result += '```';
      }
    } else if (tagName === 'a') {
      const hrefMatch = tagText.match(/href="([^"]+)"/i) || tagText.match(/href='([^']+)'/i);
      const url = hrefMatch ? hrefMatch[1] : '';
      stateStack.push('link');
      currentLinkUrl = url;
      result += '[';
    } else if (tagName === '/a') {
      if (stateStack[stateStack.length - 1] === 'link') {
        stateStack.pop();
        result += `](${escapeMarkdownV2Link(currentLinkUrl)})`;
        currentLinkUrl = null;
      }
    }
    
    index = tagRegex.lastIndex;
  }
  
  if (index < processedHtml.length) {
    result += escapeSegment(processedHtml.substring(index));
  }
  
  return result;
}

/**
 * Format raw text containing simple markdown markers into valid Telegram MarkdownV2 format.
 */
export function toMarkdownV2(text) {
  if (text === null || text === undefined) return '';
  let result = '';
  let i = 0;
  
  while (i < text.length) {
    if (text[i] === '\\' && i + 1 < text.length) {
      result += '\\' + text[i + 1];
      i += 2;
      continue;
    }

    if (i === 0 || text[i - 1] === '\n') {
      let j = i;
      while (j < text.length && (text[j] === ' ' || text[j] === '\t')) {
        j++;
      }
      if (j < text.length && (text[j] === '-' || text[j] === '*' || text[j] === '+') && (j + 1 < text.length && (text[j + 1] === ' ' || text[j + 1] === '\t'))) {
        result += text.substring(i, j) + '• ';
        i = j + 2;
        continue;
      }
    }

    if (text[i] === '\n' || text[i] === '\r') {
      result += text[i];
      i++;
      continue;
    }

    if (text.startsWith('```', i)) {
      let endIdx = text.indexOf('```', i + 3);
      if (endIdx !== -1) {
        const block = text.substring(i + 3, endIdx);
        let lang = '';
        let code = block;
        const firstNewLine = block.indexOf('\n');
        if (firstNewLine !== -1) {
          const firstLine = block.substring(0, firstNewLine).trim();
          if (/^[a-zA-Z0-9_-]+$/.test(firstLine)) {
            lang = firstLine;
            code = block.substring(firstNewLine + 1);
          } else if (firstNewLine === 0) {
            code = block.substring(1);
          }
        }
        result += '```' + lang + '\n' + escapeMarkdownV2Code(code) + '```';
        i = endIdx + 3;
        continue;
      }
    }
    
    if (text[i] === '`') {
      let endIdx = text.indexOf('`', i + 1);
      if (endIdx !== -1) {
        const code = text.substring(i + 1, endIdx);
        result += '`' + escapeMarkdownV2Code(code) + '`';
        i = endIdx + 1;
        continue;
      }
    }
    
    if (text[i] === '[') {
      let endBracket = text.indexOf(']', i + 1);
      if (endBracket !== -1 && text[endBracket + 1] === '(') {
        let balance = 1;
        let endParen = -1;
        for (let j = endBracket + 2; j < text.length; j++) {
          if (text[j] === '\\') {
            j++;
          } else if (text[j] === '(') {
            balance++;
          } else if (text[j] === ')') {
            balance--;
            if (balance === 0) {
              endParen = j;
              break;
            }
          }
        }
        if (endParen !== -1) {
          const anchor = text.substring(i + 1, endBracket);
          const url = text.substring(endBracket + 2, endParen);
          result += '[' + toMarkdownV2(anchor) + '](' + escapeMarkdownV2Link(url) + ')';
          i = endParen + 1;
          continue;
        }
      }
    }
    
    if (text[i] === '*') {
      let endIdx = text.indexOf('*', i + 1);
      if (endIdx !== -1) {
        const boldText = text.substring(i + 1, endIdx);
        result += '*' + toMarkdownV2(boldText) + '*';
        i = endIdx + 1;
        continue;
      }
    }
    
    if (text[i] === '_') {
      let endIdx = text.indexOf('_', i + 1);
      if (endIdx !== -1) {
        const italicText = text.substring(i + 1, endIdx);
        result += '_' + toMarkdownV2(italicText) + '_';
        i = endIdx + 1;
        continue;
      }
    }
    
    let nextSpecial = i;
    while (nextSpecial < text.length) {
      const char = text[nextSpecial];
      if (char === '\\' || char === '`' || char === '*' || char === '_' || char === '[' || char === '\n' || char === '\r') {
        break;
      }
      if (char === ']' && nextSpecial + 1 < text.length && text[nextSpecial + 1] === '(') {
        break;
      }
      nextSpecial++;
    }
    
    if (nextSpecial > i) {
      const plainSegment = text.substring(i, nextSpecial);
      result += escapeMarkdownV2(plainSegment);
      i = nextSpecial;
    } else {
      result += escapeMarkdownV2(text[i]);
      i++;
    }
  }
  
  return result;
}

/**
 * Strip Markdown tags to yield clean plain text.
 */
export function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[_*`\\]/g, '');
}

/**
 * Computes length after formatting tags are stripped.
 */
export function getMarkdownV2RenderedLength(text) {
  let temp = text;
  temp = temp.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  temp = temp.replace(/```[a-zA-Z0-9]*\n([\s\S]*?)```/g, '$1');
  temp = temp.replace(/[*_~|`]/g, '');
  return temp.length;
}

export function findSplitIndex(text, maxLength) {
  if (text.length <= maxLength) return text.length;
  let guessLength = Math.min(text.length, maxLength);
  let newlineIdx = text.lastIndexOf('\n', guessLength);
  if (newlineIdx !== -1 && newlineIdx >= guessLength * 0.7) {
    return newlineIdx;
  }
  let spaceIdx = text.lastIndexOf(' ', guessLength);
  if (spaceIdx !== -1 && spaceIdx >= guessLength * 0.5) {
    return spaceIdx;
  }
  return guessLength;
}
