import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT || 3210);
const HOST = process.env.HOST || '0.0.0.0';

const gatewayStatus = {
  state: 'running',
  port: PORT,
  pid: process.pid,
  connectedAt: Date.now(),
  version: 'mock-linux-device',
};

const settings = {
  theme: 'system',
  language: 'zh',
  gatewayAutoStart: true,
  gatewayPort: PORT,
  proxyEnabled: false,
  proxyServer: '',
  setupComplete: true,
};

const providerVendors = [
  {
    id: 'openai',
    name: 'OpenAI',
    category: 'official',
    defaultAuthMode: 'api_key',
    supportedAuthModes: ['api_key', 'oauth_browser'],
    supportsMultipleAccounts: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    category: 'official',
    defaultAuthMode: 'api_key',
    supportedAuthModes: ['api_key'],
    supportsMultipleAccounts: true,
    defaultBaseUrl: 'https://api.anthropic.com',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    category: 'local',
    defaultAuthMode: 'local',
    supportedAuthModes: ['local'],
    supportsMultipleAccounts: false,
    defaultBaseUrl: 'http://127.0.0.1:11434',
  },
];

const providerAccounts = [
  {
    id: 'openai-main',
    vendorId: 'openai',
    label: 'OpenAI Primary',
    authMode: 'api_key',
    apiProtocol: 'openai-responses',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5',
    enabled: true,
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const agents = [
  {
    id: 'main',
    name: 'Main Agent',
    isDefault: true,
    modelDisplay: 'OpenAI / gpt-5',
    inheritedModel: false,
    workspace: '/srv/openclaw/main',
    agentDir: '/srv/openclaw/agents/main',
    mainSessionKey: 'agent:main:main',
    channelTypes: ['telegram'],
  },
  {
    id: 'research',
    name: 'Research Wing',
    isDefault: false,
    modelDisplay: 'Anthropic / claude-sonnet',
    inheritedModel: false,
    workspace: '/srv/openclaw/research',
    agentDir: '/srv/openclaw/agents/research',
    mainSessionKey: 'agent:research:main',
    channelTypes: [],
  },
];

const channelConfigs = {
  telegram: {
    accountId: 'telegram-default',
    config: {
      botToken: 'mock-bot-token',
      allowedUsers: '123456',
    },
    enabled: true,
    status: 'connected',
    name: 'Telegram Relay',
  },
};

const skills = [
  {
    slug: 'find-skills',
    version: '1.0.0',
    source: 'managed',
    baseDir: '/srv/openclaw/skills/find-skills',
  },
  {
    slug: 'self-improving-agent',
    version: '1.0.0',
    source: 'managed',
    baseDir: '/srv/openclaw/skills/self-improving-agent',
  },
];

const marketplace = [
  {
    slug: 'tavily-search',
    name: 'Tavily Search',
    description: 'Web search skill for fresh information.',
    version: '1.0.0',
    downloads: 482,
    stars: 91,
  },
  {
    slug: 'bocha-skill',
    name: 'Bocha Skill',
    description: 'Chinese search and retrieval plugin.',
    version: '0.9.1',
    downloads: 271,
    stars: 48,
  },
  {
    slug: 'docx',
    name: 'Docx',
    description: 'Document processing skill bundle.',
    version: '1.1.3',
    downloads: 927,
    stars: 122,
  },
];

const cronJobs = [
  {
    id: 'morning-brief',
    name: 'Morning Brief',
    message: 'Summarize today priorities.',
    schedule: '0 9 * * *',
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nextRun: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    lastRun: {
      time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      success: true,
      duration: 1800,
    },
  },
];

const usageHistory = [
  {
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    sessionId: 'session-1',
    agentId: 'main',
    model: 'gpt-5',
    provider: 'openai',
    inputTokens: 1500,
    outputTokens: 760,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 2260,
    costUsd: 0.038,
  },
  {
    timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    sessionId: 'session-2',
    agentId: 'research',
    model: 'claude-sonnet',
    provider: 'anthropic',
    inputTokens: 2280,
    outputTokens: 1100,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 3380,
    costUsd: 0.051,
  },
];

const sessions = [
  {
    key: 'agent:main:main',
    label: 'Daily operator chat',
    displayName: 'Daily operator chat',
    model: 'gpt-5',
    updatedAt: Date.now() - 5 * 60 * 1000,
    messages: [
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Mock Linux device online. Ask me to simulate OpenClaw runtime behavior.',
        timestamp: Date.now() - 60 * 60 * 1000,
      },
    ],
  },
  {
    key: 'agent:research:main',
    label: 'Research backlog',
    displayName: 'Research backlog',
    model: 'claude-sonnet',
    updatedAt: Date.now() - 40 * 60 * 1000,
    messages: [
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Research agent warm and ready.',
        timestamp: Date.now() - 50 * 60 * 1000,
      },
    ],
  },
];

const sseClients = new Set();

function sendEvent(eventName, payload) {
  const frame = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(frame);
    } catch {
      sseClients.delete(client);
    }
  }
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function listAgentsSnapshot() {
  const configuredChannelTypes = Object.keys(channelConfigs).filter((key) => channelConfigs[key].enabled);
  const channelOwners = Object.fromEntries(
    agents.flatMap((agent) => agent.channelTypes.map((channelType) => [channelType, agent.id])),
  );

  return {
    agents,
    defaultAgentId: agents.find((agent) => agent.isDefault)?.id || 'main',
    configuredChannelTypes,
    channelOwners,
  };
}

function listConfiguredChannels() {
  return Object.entries(channelConfigs).map(([type, item]) => ({
    id: `${type}-${item.accountId || 'default'}`,
    type,
    name: item.name || type,
    status: item.status,
    accountId: item.accountId,
  }));
}

function getSession(sessionKey) {
  let session = sessions.find((item) => item.key === sessionKey);
  if (!session) {
    session = {
      key: sessionKey,
      label: sessionKey,
      displayName: sessionKey,
      model: 'gpt-5',
      updatedAt: Date.now(),
      messages: [],
    };
    sessions.unshift(session);
  }
  return session;
}

function touchSession(session) {
  session.updatedAt = Date.now();
}

async function serveStatic(req, res, pathname) {
  if (!existsSync(distDir)) {
    sendJson(res, 503, {
      success: false,
      error: '缺少 dist 目录，请先在 tjykClaw-Dashboard 内执行 `pnpm build`。',
    });
    return;
  }

  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(distDir, requested);
  const safePath = filePath.startsWith(distDir) ? filePath : distDir;
  const target = existsSync(safePath) ? safePath : path.join(distDir, 'index.html');

  const mime =
    target.endsWith('.html') ? 'text/html; charset=utf-8' :
      target.endsWith('.js') ? 'text/javascript; charset=utf-8' :
        target.endsWith('.css') ? 'text/css; charset=utf-8' :
          'application/octet-stream';

  res.statusCode = 200;
  res.setHeader('Content-Type', mime);
  res.end(await fs.readFile(target));
}

const server = createServer(async (req, res) => {
  const origin = `http://${req.headers.host || `${HOST}:${PORT}`}`;
  const url = new URL(req.url || '/', origin);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end();
    return;
  }

  if (url.pathname === '/api/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    sseClients.add(res);
    res.on('close', () => sseClients.delete(res));
    res.write(': connected\n\n');
    res.write(`event: gateway:status\ndata: ${JSON.stringify(gatewayStatus)}\n\n`);
    return;
  }

  if (url.pathname === '/api/gateway/status' && req.method === 'GET') {
    sendJson(res, 200, gatewayStatus);
    return;
  }

  if (url.pathname === '/api/app/gateway-info' && req.method === 'GET') {
    const protocol = origin.startsWith('https') ? 'wss' : 'ws';
    sendJson(res, 200, {
      wsUrl: `${protocol}://${url.host}/ws`,
      token: 'mock-token',
      port: PORT,
    });
    return;
  }

  if (url.pathname === '/api/gateway/start' && req.method === 'POST') {
    gatewayStatus.state = 'running';
    gatewayStatus.connectedAt = Date.now();
    sendEvent('gateway:status', gatewayStatus);
    sendJson(res, 200, { success: true });
    return;
  }

  if (url.pathname === '/api/gateway/stop' && req.method === 'POST') {
    gatewayStatus.state = 'stopped';
    sendEvent('gateway:status', gatewayStatus);
    sendJson(res, 200, { success: true });
    return;
  }

  if (url.pathname === '/api/gateway/restart' && req.method === 'POST') {
    gatewayStatus.state = 'running';
    gatewayStatus.connectedAt = Date.now();
    sendEvent('gateway:status', gatewayStatus);
    sendJson(res, 200, { success: true });
    return;
  }

  if (url.pathname === '/api/settings' && req.method === 'GET') {
    sendJson(res, 200, settings);
    return;
  }

  if (url.pathname === '/api/settings' && req.method === 'PUT') {
    Object.assign(settings, await readBody(req));
    sendJson(res, 200, { success: true });
    return;
  }

  if (url.pathname === '/api/agents' && req.method === 'GET') {
    sendJson(res, 200, { success: true, ...listAgentsSnapshot() });
    return;
  }

  if (url.pathname === '/api/agents' && req.method === 'POST') {
    const body = await readBody(req);
    const id = String(body.name || `agent-${Date.now()}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    agents.push({
      id,
      name: String(body.name || 'New Agent'),
      isDefault: false,
      modelDisplay: 'OpenAI / gpt-5-mini',
      inheritedModel: false,
      workspace: `/srv/openclaw/${id}`,
      agentDir: `/srv/openclaw/agents/${id}`,
      mainSessionKey: `agent:${id}:main`,
      channelTypes: [],
    });
    sendJson(res, 200, { success: true, ...listAgentsSnapshot() });
    return;
  }

  if (url.pathname.startsWith('/api/agents/') && req.method === 'PUT') {
    const suffix = url.pathname.slice('/api/agents/'.length);
    const parts = suffix.split('/').filter(Boolean);
    const agent = agents.find((item) => item.id === decodeURIComponent(parts[0]));
    if (!agent) {
      sendJson(res, 404, { success: false, error: 'Agent not found' });
      return;
    }
    if (parts.length === 1) {
      const body = await readBody(req);
      agent.name = String(body.name || agent.name);
    }
    if (parts.length === 3 && parts[1] === 'channels') {
      const channelType = decodeURIComponent(parts[2]);
      if (!agent.channelTypes.includes(channelType)) {
        agent.channelTypes.push(channelType);
      }
    }
    sendJson(res, 200, { success: true, ...listAgentsSnapshot() });
    return;
  }

  if (url.pathname.startsWith('/api/agents/') && req.method === 'DELETE') {
    const suffix = url.pathname.slice('/api/agents/'.length);
    const parts = suffix.split('/').filter(Boolean);
    if (parts.length === 1) {
      const agentId = decodeURIComponent(parts[0]);
      const index = agents.findIndex((item) => item.id === agentId);
      if (index >= 0 && !agents[index].isDefault) {
        agents.splice(index, 1);
      }
    }
    if (parts.length === 3 && parts[1] === 'channels') {
      const agentId = decodeURIComponent(parts[0]);
      const channelType = decodeURIComponent(parts[2]);
      const agent = agents.find((item) => item.id === agentId);
      if (agent) {
        agent.channelTypes = agent.channelTypes.filter((item) => item !== channelType);
      }
    }
    sendJson(res, 200, { success: true, ...listAgentsSnapshot() });
    return;
  }

  if (url.pathname === '/api/channels/configured' && req.method === 'GET') {
    sendJson(res, 200, { success: true, channels: listConfiguredChannels() });
    return;
  }

  if (url.pathname === '/api/channels/config' && req.method === 'POST') {
    const body = await readBody(req);
    channelConfigs[body.channelType] = {
      accountId: body.accountId || `${body.channelType}-default`,
      config: body.config || {},
      enabled: true,
      status: 'connected',
      name: `${body.channelType} relay`,
    };
    sendJson(res, 200, { success: true });
    return;
  }

  if (url.pathname === '/api/channels/config/enabled' && req.method === 'PUT') {
    const body = await readBody(req);
    const item = channelConfigs[body.channelType];
    if (item) {
      item.enabled = Boolean(body.enabled);
      item.status = body.enabled ? 'connected' : 'disconnected';
    }
    sendJson(res, 200, { success: true });
    return;
  }

  if (url.pathname.startsWith('/api/channels/config/') && req.method === 'GET') {
    const channelType = decodeURIComponent(url.pathname.slice('/api/channels/config/'.length));
    sendJson(res, 200, { success: true, values: channelConfigs[channelType]?.config || {} });
    return;
  }

  if (url.pathname.startsWith('/api/channels/config/') && req.method === 'DELETE') {
    const channelType = decodeURIComponent(url.pathname.slice('/api/channels/config/'.length));
    delete channelConfigs[channelType];
    sendJson(res, 200, { success: true });
    return;
  }

  if (url.pathname === '/api/provider-vendors' && req.method === 'GET') {
    sendJson(res, 200, providerVendors);
    return;
  }

  if (url.pathname === '/api/provider-accounts' && req.method === 'GET') {
    sendJson(res, 200, providerAccounts);
    return;
  }

  if (url.pathname === '/api/provider-accounts' && req.method === 'POST') {
    const body = await readBody(req);
    providerAccounts.push(body.account);
    sendJson(res, 200, { success: true, account: body.account });
    return;
  }

  if (url.pathname === '/api/provider-accounts/default' && req.method === 'GET') {
    sendJson(res, 200, { accountId: providerAccounts.find((item) => item.isDefault)?.id || null });
    return;
  }

  if (url.pathname === '/api/provider-accounts/default' && req.method === 'PUT') {
    const body = await readBody(req);
    providerAccounts.forEach((item) => {
      item.isDefault = item.id === body.accountId;
    });
    sendJson(res, 200, { success: true });
    return;
  }

  if (url.pathname.startsWith('/api/provider-accounts/') && req.method === 'PUT') {
    const accountId = decodeURIComponent(url.pathname.slice('/api/provider-accounts/'.length));
    const body = await readBody(req);
    const account = providerAccounts.find((item) => item.id === accountId);
    if (account) {
      Object.assign(account, body.updates || {});
      account.updatedAt = new Date().toISOString();
    }
    sendJson(res, 200, { success: true, account });
    return;
  }

  if (url.pathname.startsWith('/api/provider-accounts/') && req.method === 'DELETE') {
    const accountId = decodeURIComponent(url.pathname.slice('/api/provider-accounts/'.length));
    const index = providerAccounts.findIndex((item) => item.id === accountId);
    if (index >= 0) {
      providerAccounts.splice(index, 1);
    }
    sendJson(res, 200, { success: true });
    return;
  }

  if (url.pathname === '/api/clawhub/list' && req.method === 'GET') {
    sendJson(res, 200, { success: true, results: skills });
    return;
  }

  if (url.pathname === '/api/skills/configs' && req.method === 'GET') {
    sendJson(res, 200, {});
    return;
  }

  if (url.pathname === '/api/clawhub/search' && req.method === 'POST') {
    const body = await readBody(req);
    const query = String(body.query || '').toLowerCase();
    const results = marketplace.filter((item) => {
      if (!query) return true;
      return item.slug.includes(query) || item.name.toLowerCase().includes(query) || item.description.toLowerCase().includes(query);
    });
    sendJson(res, 200, { success: true, results });
    return;
  }

  if (url.pathname === '/api/clawhub/install' && req.method === 'POST') {
    const body = await readBody(req);
    const found = marketplace.find((item) => item.slug === body.slug);
    if (found && !skills.find((item) => item.slug === found.slug)) {
      skills.push({
        slug: found.slug,
        version: found.version,
        source: 'marketplace',
        baseDir: `/srv/openclaw/skills/${found.slug}`,
      });
    }
    sendJson(res, 200, { success: true });
    return;
  }

  if (url.pathname === '/api/clawhub/uninstall' && req.method === 'POST') {
    const body = await readBody(req);
    const index = skills.findIndex((item) => item.slug === body.slug);
    if (index >= 0) {
      skills.splice(index, 1);
    }
    sendJson(res, 200, { success: true });
    return;
  }

  if (url.pathname === '/api/cron/jobs' && req.method === 'GET') {
    sendJson(res, 200, cronJobs);
    return;
  }

  if (url.pathname === '/api/cron/jobs' && req.method === 'POST') {
    const body = await readBody(req);
    cronJobs.unshift({
      id: String(body.name || crypto.randomUUID()).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: String(body.name || 'New Job'),
      message: String(body.message || ''),
      schedule: String(body.schedule || '* * * * *'),
      enabled: body.enabled !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nextRun: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });
    sendJson(res, 200, cronJobs[0]);
    return;
  }

  if (url.pathname.startsWith('/api/cron/jobs/') && req.method === 'PUT') {
    const id = decodeURIComponent(url.pathname.slice('/api/cron/jobs/'.length));
    const body = await readBody(req);
    const job = cronJobs.find((item) => item.id === id);
    if (job) {
      Object.assign(job, body);
      job.updatedAt = new Date().toISOString();
    }
    sendJson(res, 200, { success: true });
    return;
  }

  if (url.pathname.startsWith('/api/cron/jobs/') && req.method === 'DELETE') {
    const id = decodeURIComponent(url.pathname.slice('/api/cron/jobs/'.length));
    const index = cronJobs.findIndex((item) => item.id === id);
    if (index >= 0) {
      cronJobs.splice(index, 1);
    }
    sendJson(res, 200, { success: true });
    return;
  }

  if (url.pathname === '/api/cron/toggle' && req.method === 'POST') {
    const body = await readBody(req);
    const job = cronJobs.find((item) => item.id === body.id);
    if (job) {
      job.enabled = Boolean(body.enabled);
    }
    sendJson(res, 200, { success: true });
    return;
  }

  if (url.pathname === '/api/cron/trigger' && req.method === 'POST') {
    const body = await readBody(req);
    const job = cronJobs.find((item) => item.id === body.id);
    if (job) {
      job.lastRun = {
        time: new Date().toISOString(),
        success: true,
        duration: 1200,
      };
    }
    sendJson(res, 200, { success: true });
    return;
  }

  if (url.pathname === '/api/usage/recent-token-history' && req.method === 'GET') {
    sendJson(res, 200, usageHistory);
    return;
  }

  if (url.pathname === '/api/logs' && req.method === 'GET') {
    sendJson(res, 200, {
      content: [
        '[mock-device] boot complete',
        '[mock-device] gateway state running',
        '[mock-device] host api reachable',
      ].join('\n'),
    });
    return;
  }

  if (url.pathname === '/api/app/openclaw-doctor' && req.method === 'POST') {
    const body = await readBody(req);
    sendJson(res, 200, {
      success: true,
      mode: body.mode || 'diagnose',
      summary: 'Mock device healthy.',
      checks: [{ name: 'gateway', ok: true }, { name: 'skills', ok: true }],
    });
    return;
  }

  if (url.pathname === '/api/files/stage-buffer' && req.method === 'POST') {
    const body = await readBody(req);
    sendJson(res, 200, {
      id: crypto.randomUUID(),
      fileName: body.fileName,
      mimeType: body.mimeType,
      fileSize: Buffer.from(body.base64 || '', 'base64').length,
      stagedPath: `/tmp/mock-staged/${body.fileName}`,
      preview: body.mimeType?.startsWith('image/') ? `data:${body.mimeType};base64,${body.base64}` : null,
    });
    return;
  }

  if (url.pathname === '/api/chat/send-with-media' && req.method === 'POST') {
    const body = await readBody(req);
    const session = getSession(String(body.sessionKey));
    session.messages.push({
      id: crypto.randomUUID(),
      role: 'user',
      content: body.message || '',
      timestamp: Date.now(),
      _attachedFiles: Array.isArray(body.media)
        ? body.media.map((item) => ({
          fileName: item.fileName,
          mimeType: item.mimeType,
          fileSize: 0,
          stagedPath: item.filePath,
        }))
        : [],
    });
    touchSession(session);
    sendEvent('gateway:notification', {
      method: 'agent',
      params: {
        phase: 'started',
        runId: crypto.randomUUID(),
        sessionKey: session.key,
      },
    });
    setTimeout(() => {
      session.messages.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Mock Linux device reply:\n\n${body.message || 'Received.'}`,
        timestamp: Date.now(),
      });
      touchSession(session);
      sendEvent('gateway:chat-message', { message: { sessionKey: session.key } });
      sendEvent('gateway:notification', {
        method: 'agent',
        params: {
          phase: 'completed',
          runId: crypto.randomUUID(),
          sessionKey: session.key,
        },
      });
    }, 900);
    sendJson(res, 200, { success: true, result: { accepted: true } });
    return;
  }

  if (url.pathname === '/api/sessions/delete' && req.method === 'POST') {
    const body = await readBody(req);
    const index = sessions.findIndex((item) => item.key === body.sessionKey);
    if (index >= 0) {
      sessions.splice(index, 1);
    }
    sendJson(res, 200, { success: true });
    return;
  }

  await serveStatic(req, res, url.pathname);
});

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (socket) => {
  socket.on('message', (raw) => {
    try {
      const payload = JSON.parse(String(raw));
      let result = null;
      if (payload.method === 'sessions.list') {
        result = {
          sessions: sessions.map((session) => ({
            key: session.key,
            label: session.label,
            displayName: session.displayName,
            model: session.model,
            updatedAt: session.updatedAt,
          })),
        };
      } else if (payload.method === 'chat.history') {
        result = getSession(String(payload.params?.sessionKey)).messages;
      } else if (payload.method === 'chat.abort') {
        result = { success: true };
      } else if (payload.method === 'channels.status') {
        result = {
          channelOrder: Object.keys(channelConfigs),
          channels: Object.fromEntries(
            Object.entries(channelConfigs).map(([type, item]) => [type, { configured: true, running: item.enabled, error: item.status === 'error' ? 'Mock error' : undefined }]),
          ),
          channelAccounts: Object.fromEntries(
            Object.entries(channelConfigs).map(([type, item]) => [type, [{
              accountId: item.accountId,
              configured: true,
              connected: item.status === 'connected',
              running: item.enabled,
              name: item.name,
            }]]),
          ),
          channelDefaultAccountId: Object.fromEntries(
            Object.entries(channelConfigs).map(([type, item]) => [type, item.accountId]),
          ),
        };
      }

      socket.send(JSON.stringify({
        jsonrpc: '2.0',
        id: payload.id,
        result,
      }));
    } catch (error) {
      socket.send(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { message: String(error) },
      }));
    }
  });
});

server.on('upgrade', (req, socket, head) => {
  if (!req.url?.startsWith('/ws')) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[mock-device] listening on http://${HOST}:${PORT}`);
  console.log(`[mock-device] serving dist from ${distDir}`);
});
