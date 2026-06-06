// lib/framework/adapters.js
// Generic platform request helpers

import { dispatchHttpRoute } from './router.js';

let configBuilder = (env) => env;

export function configureConfigBuilder(fn) {
  configBuilder = fn;
}

export async function handleWebRequest(request, env = {}, ctx = null) {
  const url = new URL(request.url);
  const config = configBuilder(env);

  let body = null;
  if (request.method === 'POST') {
    try {
      body = await request.json();
    } catch (e) {
      console.warn('Request body is not JSON or empty:', e.message);
    }
  }

  const query = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const requestInfo = {
    method: request.method,
    headers: headers,
    body: body,
    query: query,
    urlPath: url.pathname
  };

  const responseInfo = await dispatchHttpRoute(requestInfo, config, ctx);

  const responseBody = typeof responseInfo.body === 'object'
    ? JSON.stringify(responseInfo.body)
    : responseInfo.body;

  return new Response(responseBody, {
    status: responseInfo.status,
    headers: responseInfo.headers
  });
}

export async function handleVercelRequest(req, res, env = {}) {
  const config = configBuilder(env);
  const urlObj = new URL(req.url, 'http://localhost');
  
  let ctx = null;
  try {
    const vercelFuncs = await import('@vercel/functions');
    if (vercelFuncs && typeof vercelFuncs.waitUntil === 'function') {
      ctx = {
        waitUntil: (promise) => vercelFuncs.waitUntil(promise)
      };
    }
  } catch {
    // Fallback
  }

  const query = {};
  urlObj.searchParams.forEach((val, key) => {
    query[key] = val;
  });

  const requestInfo = {
    method: req.method,
    headers: req.headers,
    body: req.body,
    query: query,
    urlPath: urlObj.pathname
  };

  const responseInfo = await dispatchHttpRoute(requestInfo, config, ctx);

  if (responseInfo.headers) {
    for (const [k, v] of Object.entries(responseInfo.headers)) {
      res.setHeader(k, v);
    }
  }
  res.status(responseInfo.status).send(responseInfo.body);
}

export async function handleNetlifyRequest(event, context, env = {}) {
  const config = configBuilder(env);
  
  let body = event.body;
  if (event.isBase64Encoded && event.body) {
    body = String(Buffer.from(event.body, 'base64'));
  }
  
  if (body && (event.headers['content-type'] || '').includes('application/json') && typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      console.warn('Failed to parse Netlify event body as JSON:', e.message);
    }
  }

  const requestInfo = {
    method: event.httpMethod || event.method,
    headers: event.headers,
    body: body,
    query: event.queryStringParameters || {},
    urlPath: event.path
  };

  const ctx = {
    waitUntil: (promise) => context.waitUntil ? context.waitUntil(promise) : promise
  };

  const responseInfo = await dispatchHttpRoute(requestInfo, config, ctx);

  const responseBody = typeof responseInfo.body === 'object'
    ? JSON.stringify(responseInfo.body)
    : responseInfo.body;

  return {
    statusCode: responseInfo.status,
    headers: responseInfo.headers || {},
    body: responseBody
  };
}
