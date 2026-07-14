#!/usr/bin/env node
// Minimal mock backend for Kimi Study frontend demos.
// Responds to the REST/WS surface that kimi-web needs to boot past the
// connecting splash, with dangerous_bypass_auth enabled so no login is required.

import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.MOCK_KIMI_PORT) || 58627;
const HOST = process.env.MOCK_KIMI_HOST || '127.0.0.1';

function envelope(data) {
  return JSON.stringify({
    code: 0,
    msg: 'ok',
    data,
    request_id: randomUUID(),
  });
}

function sendJson(res, data, status = 200) {
  const body = envelope(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, text, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

const handlers = {
  'GET /api/v1/meta': (_req, res) => {
    sendJson(res, {
      server_version: '0.0.0-demo',
      server_id: 'demo-server',
      started_at: new Date().toISOString(),
      capabilities: {},
      open_in_apps: [],
      dangerous_bypass_auth: true,
      backend: 'v1',
    });
  },

  'GET /api/v1/auth': (_req, res) => {
    sendJson(res, {
      ready: true,
      providers_count: 0,
      default_model: null,
      managed_provider: null,
    });
  },

  'GET /api/v1/healthz': (_req, res) => {
    sendJson(res, { status: 'ok', uptimeSec: 0 });
  },

  'GET /api/v1/models': (_req, res) => {
    sendJson(res, { items: [] });
  },

  'GET /api/v1/providers': (_req, res) => {
    sendJson(res, { items: [] });
  },

  'GET /api/v1/config': (_req, res) => {
    sendJson(res, {
      providers: {},
      default_provider: undefined,
      default_model: undefined,
      models: {},
      thinking: { enabled: false },
      plan_mode: false,
      yolo: false,
      default_permission_mode: 'manual',
      default_plan_mode: false,
      permission: {},
      hooks: [],
      services: {},
      merge_all_available_skills: false,
      extra_skill_dirs: [],
      loop_control: {},
      background: {},
      experimental: {},
      telemetry: false,
      raw: {},
    });
  },

  'GET /api/v1/workspaces': (_req, res) => {
    sendJson(res, {
      items: [
        {
          id: 'demo-workspace',
          root: '/home/demo',
          name: '家庭学习空间',
          is_git_repo: false,
          branch: null,
          last_opened_at: new Date().toISOString(),
          session_count: 0,
        },
      ],
      has_more: false,
    });
  },

  'GET /api/v1/fs:home': (_req, res) => {
    sendJson(res, { home: '/home/demo', recent_roots: [] });
  },

  'GET /api/v1/sessions': (_req, res) => {
    sendJson(res, { items: [], has_more: false });
  },

  'GET /api/v1/sessions/': (req, res) => {
    // Any /sessions/:id path returns 404 envelope
    sendJson(res, null, 404);
  },
};

function route(req, res) {
  const method = req.method;
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    });
    res.end();
    return;
  }

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');

  const key = `${method} ${pathname}`;
  const handler = handlers[key] ?? handlers[`${method} ${pathname.replace(/\/sessions\/[^/]+/, '/sessions/')}`];

  if (handler) {
    handler(req, res);
    return;
  }

  // Default 404
  sendJson(res, { msg: `not found: ${method} ${pathname}` }, 404);
}

const server = http.createServer(route);

// Minimal WebSocket upgrade handler: accept connection, send server_hello, ignore traffic.
server.on('upgrade', (request, socket) => {
  const key = request.headers['sec-websocket-key'];
  const accept = Buffer.from(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11', 'binary')
    .toString('base64');

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n` +
    '\r\n',
  );

  function sendWsFrame(type, payload) {
    const data = JSON.stringify({
      type,
      timestamp: new Date().toISOString(),
      payload,
    });
    const buf = Buffer.from(data, 'utf-8');
    const header = [0x81];
    if (buf.length <= 125) {
      header.push(buf.length);
    } else if (buf.length <= 65535) {
      header.push(126, buf.length >> 8, buf.length & 0xff);
    } else {
      header.push(127, 0, 0, 0, 0, (buf.length >> 24) & 0xff, (buf.length >> 16) & 0xff, (buf.length >> 8) & 0xff, buf.length & 0xff);
    }
    socket.write(Buffer.concat([Buffer.from(header), buf]));
  }

  sendWsFrame('server_hello', {
    server_id: 'demo-server',
    max_event_buffer_size: 1000,
    capabilities: { event_batching: true, compression: false },
  });

  socket.on('data', () => {
    // Keep connection alive; ignore client frames.
  });

  socket.on('error', () => {
    socket.destroy();
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Mock Kimi server listening on http://${HOST}:${PORT}`);
});
