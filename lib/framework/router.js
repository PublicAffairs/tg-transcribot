// lib/framework/router.js
// Generic Telegram Command Router and registry

export const COMMAND_REGISTRY = [];

/**
 * Register a bot command handler.
 */
export function registerCommand(command, handler, options = {}) {
  const priority = options.priority !== undefined ? options.priority : 100;
  COMMAND_REGISTRY.push({
    command: command.toLowerCase(),
    handler,
    condition: options.condition || (() => true),
    isAdmin: !!options.isAdmin,
    priority,
    descriptionKey: options.descriptionKey || null,
    hidden: !!options.hidden
  });
  // Sort by priority descending (higher priority first)
  COMMAND_REGISTRY.sort((a, b) => b.priority - a.priority);
}

export const HTTP_ROUTES = {};

export function registerHttpRoute(path, handler) {
  HTTP_ROUTES[path] = handler;
}

export async function dispatchHttpRoute(requestInfo, config, ctx) {
  const pathname = requestInfo.urlPath || '';
  const handler = HTTP_ROUTES[pathname] || (requestInfo.method === 'POST' && pathname === '/' ? HTTP_ROUTES['/api/webhook'] : null);
  if (handler) {
    return await handler(requestInfo, config, ctx);
  }
  return { status: 404, headers: { 'Content-Type': 'text/plain' }, body: 'Not Found' };
}
