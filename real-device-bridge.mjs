import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { Bonjour } from 'bonjour-service';

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3210);
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || 'openclaw';
const DIST_DIR = path.join(process.cwd(), 'dist');
const STATE_DIR = path.join(os.homedir(), '.tjykclaw-dashboard-bridge');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const OPENCLAW_DIR = path.join(os.homedir(), '.openclaw');
const OPENCLAW_CONFIG = path.join(OPENCLAW_DIR, 'openclaw.json');
const MAIN_AGENT_DIR = path.join(OPENCLAW_DIR, 'agents', 'main', 'agent');
const AUTH_PROFILES_PATH = path.join(MAIN_AGENT_DIR, 'auth-profiles.json');
const STAGING_DIR = path.join(STATE_DIR, 'staged');

const DEFAULT_GATEWAY_PORT = Number(process.env.GATEWAY_PORT || 18789);

const DEFAULT_STATE = {
  settings: {
    theme: 'system',
    language: 'zh',
    gatewayAutoStart: true,
    gatewayPort: DEFAULT_GATEWAY_PORT,
    gatewayToken: `tjykclaw-${crypto.randomBytes(16).toString('hex')}`,
    proxyEnabled: false,
    proxyServer: '',
    setupComplete: true,
  },
  providerAccounts: [],
  defaultProviderAccountId: null,
  agentNames: {
    main: 'Main Agent',
  },
};

const PROVIDER_VENDORS = [
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
    id: 'openrouter',
    name: 'OpenRouter',
    category: 'compatible',
    defaultAuthMode: 'api_key',
    supportedAuthModes: ['api_key'],
    supportsMultipleAccounts: true,
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'google',
    name: 'Google',
    category: 'official',
    defaultAuthMode: 'api_key',
    supportedAuthModes: ['api_key', 'oauth_browser'],
    supportsMultipleAccounts: true,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
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

let gatewayProcess = null;
let gatewayStatus = {
  state: 'stopped',
  port: DEFAULT_STATE.settings.gatewayPort,
  pid: undefined,
  connectedAt: undefined,
  error: undefined,
};
const sseClients = new Set();

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function loadState() {
  const raw = await readJson(STATE_FILE, DEFAULT_STATE);
  return {
    ...DEFAULT_STATE,
    ...raw,
    settings: {
      ...DEFAULT_STATE.settings,
      ...(raw.settings || {}),
    },
    providerAccounts: Array.isArray(raw.providerAccounts) ? raw.providerAccounts : [],
    agentNames: {
      ...DEFAULT_STATE.agentNames,
      ...(raw.agentNames || {}),
    },
  };
}

async function saveState(next) {
  await writeJson(STATE_FILE, next);
}

async function ensureOpenClawScaffold() {
  await ensureDir(STATE_DIR);
  await ensureDir(STAGING_DIR);
  await ensureDir(MAIN_AGENT_DIR);
  const config = await readJson(OPENCLAW_CONFIG, {});
  const nextConfig = {
    ...config,
    gateway: {
      ...(config.gateway || {}),
      mode: 'local',
      bind: 'lan',
      auth: {
        ...((config.gateway && config.gateway.auth) || {}),
        mode: 'token',
      },
      controlUi: {
        ...((config.gateway && config.gateway.controlUi) || {}),
        dangerouslyAllowHostHeaderOriginFallback: true,
      },
    },
    session: {
      mainKey: 'main',
      ...(config.session || {}),
    },
  };
  await writeJson(OPENCLAW_CONFIG, nextConfig);
  if (!existsSync(AUTH_PROFILES_PATH)) {
    await writeJson(AUTH_PROFILES_PATH, { profiles: {} });
  }
}

function sendEvent(name, payload) {
  const frame = `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
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

function normalizeOpenClawError(stderr, stdout) {
  return (stderr || stdout || 'OpenClaw command failed').trim();
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

async function runOpenClaw(args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(OPENCLAW_BIN, args, {
      env: {
        ...process.env,
        ...options.env,
      },
      cwd: options.cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(normalizeOpenClawError(stderr, stdout)));
        return;
      }
      resolve({ stdout, stderr });
    });

    if (typeof options.stdin === 'string') {
      child.stdin.write(options.stdin);
      child.stdin.end();
    }
  });
}

function currentGatewayWsUrl(state) {
  return `ws://127.0.0.1:${state.settings.gatewayPort}/ws`;
}

async function gatewayCall(state, method, params = {}) {
  const args = [
    'gateway',
    'call',
    method,
    '--json',
    '--url',
    currentGatewayWsUrl(state),
    '--token',
    state.settings.gatewayToken,
    '--params',
    JSON.stringify(params),
  ];
  const { stdout } = await runOpenClaw(args);
  return JSON.parse(stdout);
}

function parseCliJson(stdout) {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const candidate = lines.slice(index).join('\n');
    try {
      return JSON.parse(candidate);
    } catch {
      // Keep walking back until JSON parses.
    }
  }
  throw new Error('Failed to parse OpenClaw JSON output');
}

function titleCase(value) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

async function listAgentsSnapshot(state) {
  const { stdout } = await runOpenClaw(['agents', 'list', '--json', '--bindings']);
  const listed = parseCliJson(stdout);
  const config = await readJson(OPENCLAW_CONFIG, {});
  const bindings = Array.isArray(config.bindings) ? config.bindings : [];
  const channelOwners = {};
  const agentChannels = new Map();

  for (const binding of bindings) {
    const channelType = binding?.match?.channel;
    const agentId = binding?.agentId;
    if (!channelType || !agentId) continue;
    channelOwners[channelType] = agentId;
    if (!agentChannels.has(agentId)) agentChannels.set(agentId, []);
    agentChannels.get(agentId).push(channelType);
  }

  const agents = (Array.isArray(listed) ? listed : []).map((agent) => ({
    id: agent.id,
    name: state.agentNames[agent.id] || titleCase(agent.id),
    isDefault: Boolean(agent.isDefault),
    modelDisplay: typeof agent.model === 'string' ? agent.model : 'Unconfigured',
    inheritedModel: false,
    workspace: agent.workspace || '',
    agentDir: agent.agentDir || '',
    mainSessionKey: `agent:${agent.id}:main`,
    channelTypes: agentChannels.get(agent.id) || [],
  }));

  return {
    agents,
    defaultAgentId: agents.find((agent) => agent.isDefault)?.id || agents[0]?.id || 'main',
    configuredChannelTypes: Object.keys(config.channels || {}),
    channelOwners,
  };
}

async function readOpenClawConfig() {
  return await readJson(OPENCLAW_CONFIG, {});
}

async function writeOpenClawConfig(config) {
  await writeJson(OPENCLAW_CONFIG, config);
}

async function listConfiguredChannelsFromConfig() {
  const config = await readOpenClawConfig();
  const channels = config.channels || {};
  return Object.entries(channels).map(([type, section]) => {
    const accountId = section.defaultAccount || Object.keys(section.accounts || {})[0] || 'default';
    return {
      id: `${type}-${accountId}`,
      type,
      name: section.accounts?.[accountId]?.name || titleCase(type),
      status: section.enabled === false ? 'disconnected' : 'connected',
      accountId,
    };
  });
}

async function getChannelValues(channelType, accountId) {
  const config = await readOpenClawConfig();
  const section = config.channels?.[channelType];
  if (!section) return {};
  const resolvedAccount = accountId || section.defaultAccount || Object.keys(section.accounts || {})[0] || 'default';
  return section.accounts?.[resolvedAccount] || {};
}

async function saveChannelValues(channelType, values, accountId) {
  const config = await readOpenClawConfig();
  config.channels ||= {};
  config.channels[channelType] ||= { accounts: {}, enabled: true, defaultAccount: accountId || 'default' };
  config.channels[channelType].accounts ||= {};
  const resolvedAccount = accountId || config.channels[channelType].defaultAccount || 'default';
  config.channels[channelType].accounts[resolvedAccount] = values;
  config.channels[channelType].defaultAccount = resolvedAccount;
  config.channels[channelType].enabled = true;
  await writeOpenClawConfig(config);
}

async function setChannelEnabled(channelType, enabled) {
  const config = await readOpenClawConfig();
  if (!config.channels?.[channelType]) return;
  config.channels[channelType].enabled = enabled;
  await writeOpenClawConfig(config);
}

async function deleteChannelConfig(channelType) {
  const config = await readOpenClawConfig();
  if (config.channels?.[channelType]) {
    delete config.channels[channelType];
  }
  if (Array.isArray(config.bindings)) {
    config.bindings = config.bindings.filter((binding) => binding?.match?.channel !== channelType);
  }
  await writeOpenClawConfig(config);
}

async function readAuthProfiles() {
  const raw = await readJson(AUTH_PROFILES_PATH, { profiles: {} });
  return raw.profiles || {};
}

async function writeAuthProfiles(profiles) {
  await writeJson(AUTH_PROFILES_PATH, { profiles });
}

async function syncProviderAccountsToAuth(state) {
  const profiles = {};
  for (const account of state.providerAccounts) {
    const key = `${account.vendorId}:${account.id}`;
    profiles[key] = {
      type: account.authMode === 'local' ? 'api_key' : 'api_key',
      provider: account.vendorId,
      key: account.secret || '',
    };
  }
  await writeAuthProfiles(profiles);

  const defaultAccount = state.providerAccounts.find((item) => item.id === state.defaultProviderAccountId)
    || state.providerAccounts.find((item) => item.isDefault);
  if (defaultAccount?.model) {
    await runOpenClaw(['models', 'set', `${defaultAccount.vendorId}/${defaultAccount.model}`]).catch(() => { });
  }
}

async function loadProviderAccounts(state) {
  return state.providerAccounts.map((account) => ({
    id: account.id,
    vendorId: account.vendorId,
    label: account.label,
    authMode: account.authMode,
    baseUrl: account.baseUrl,
    apiProtocol: account.apiProtocol,
    model: account.model,
    enabled: account.enabled !== false,
    isDefault: account.id === state.defaultProviderAccountId,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  }));
}

function updateGatewayStatus(next) {
  gatewayStatus = {
    ...gatewayStatus,
    ...next,
  };
  sendEvent('gateway:status', gatewayStatus);
}

async function startGateway() {
  const state = await loadState();
  if (gatewayProcess && !gatewayProcess.killed) return;

  await ensureOpenClawScaffold();
  const args = [
    'gateway',
    'run',
    '--bind',
    'lan',
    '--allow-unconfigured',
    '--auth',
    'token',
    '--token',
    state.settings.gatewayToken,
    '--port',
    String(state.settings.gatewayPort),
  ];

  gatewayProcess = spawn(OPENCLAW_BIN, args, {
    env: process.env,
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  gatewayProcess.stdout.on('data', () => { });
  gatewayProcess.stderr.on('data', (chunk) => {
    const message = chunk.toString();
    if (message.toLowerCase().includes('error')) {
      updateGatewayStatus({ state: 'error', error: message.trim() });
    }
  });

  gatewayProcess.on('exit', (code) => {
    gatewayProcess = null;
    updateGatewayStatus({ state: 'stopped', pid: undefined, error: code === 0 ? undefined : `Gateway exited with code ${code}` });
  });

  updateGatewayStatus({
    state: 'running',
    port: state.settings.gatewayPort,
    pid: gatewayProcess.pid,
    connectedAt: Date.now(),
    error: undefined,
  });
}

async function stopGateway() {
  if (!gatewayProcess) {
    updateGatewayStatus({ state: 'stopped', pid: undefined });
    return;
  }
  gatewayProcess.kill('SIGTERM');
  gatewayProcess = null;
  updateGatewayStatus({ state: 'stopped', pid: undefined });
}

async function stageBuffer(base64, fileName, mimeType) {
  await ensureDir(STAGING_DIR);
  const id = crypto.randomUUID();
  const filePath = path.join(STAGING_DIR, `${id}-${fileName}`);
  const buffer = Buffer.from(base64, 'base64');
  await fs.writeFile(filePath, buffer);
  return {
    id,
    fileName,
    mimeType,
    fileSize: buffer.length,
    stagedPath: filePath,
    preview: mimeType?.startsWith('image/') ? `data:${mimeType};base64,${base64}` : null,
  };
}

async function sendChatMessage(body) {
  const imageAttachments = [];
  const fileReferences = [];
  for (const media of body.media || []) {
    fileReferences.push(`[media attached: ${media.filePath} (${media.mimeType}) | ${media.filePath}]`);
    if (String(media.mimeType || '').startsWith('image/')) {
      const buffer = await fs.readFile(media.filePath);
      imageAttachments.push({
        content: buffer.toString('base64'),
        mimeType: media.mimeType,
        fileName: media.fileName,
      });
    }
  }
  const message = [body.message || '', ...fileReferences].filter(Boolean).join('\n');
  const state = await loadState();
  return await gatewayCall(state, 'chat.send', {
    sessionKey: body.sessionKey,
    message,
    idempotencyKey: body.idempotencyKey || crypto.randomUUID(),
    deliver: true,
    attachments: imageAttachments.length > 0 ? imageAttachments : undefined,
  });
}

async function deleteSessionByKey(sessionKey) {
  const parts = String(sessionKey || '').split(':');
  if (parts.length < 3) return;
  const agentId = parts[1];
  const sessionsDir = path.join(OPENCLAW_DIR, 'agents', agentId, 'sessions');
  const sessionsJsonPath = path.join(sessionsDir, 'sessions.json');
  const sessionsJson = await readJson(sessionsJsonPath, {});

  let resolvedFile = null;
  if (Array.isArray(sessionsJson.sessions)) {
    const entry = sessionsJson.sessions.find((item) => item.key === sessionKey || item.sessionKey === sessionKey);
    if (entry?.file) {
      resolvedFile = path.join(sessionsDir, entry.file);
    }
  }
  if (!resolvedFile && sessionsJson[sessionKey]?.file) {
    resolvedFile = path.join(sessionsDir, sessionsJson[sessionKey].file);
  }
  if (resolvedFile && existsSync(resolvedFile)) {
    await fs.rename(resolvedFile, resolvedFile.replace(/\.jsonl$/, '.deleted.jsonl')).catch(() => { });
  }

  if (Array.isArray(sessionsJson.sessions)) {
    sessionsJson.sessions = sessionsJson.sessions.filter((item) => item.key !== sessionKey && item.sessionKey !== sessionKey);
  } else if (sessionsJson[sessionKey]) {
    delete sessionsJson[sessionKey];
  }
  await writeJson(sessionsJsonPath, sessionsJson);
}

async function serveStatic(req, res, pathname) {
  if (!existsSync(DIST_DIR)) {
    sendJson(res, 503, { success: false, error: 'Missing dist. Run `pnpm build` first.' });
    return;
  }
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(DIST_DIR, requested);
  const safePath = filePath.startsWith(DIST_DIR) ? filePath : DIST_DIR;
  const target = existsSync(safePath) ? safePath : path.join(DIST_DIR, 'index.html');
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
  const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end();
    return;
  }

  try {
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
      sendEvent('gateway:status', gatewayStatus);
      return;
    }

    if (url.pathname === '/api/settings' && req.method === 'GET') {
      const state = await loadState();
      sendJson(res, 200, state.settings);
      return;
    }

    if (url.pathname === '/api/settings' && req.method === 'PUT') {
      const patch = await readBody(req);
      const state = await loadState();
      state.settings = { ...state.settings, ...patch };
      await saveState(state);
      sendJson(res, 200, { success: true });
      return;
    }

    if (url.pathname === '/api/gateway/status' && req.method === 'GET') {
      const state = await loadState();
      sendJson(res, 200, { ...gatewayStatus, port: state.settings.gatewayPort });
      return;
    }

    if (url.pathname === '/api/app/gateway-info' && req.method === 'GET') {
      const state = await loadState();
      const protocol = (req.headers['x-forwarded-proto'] || '').toString().includes('https') ? 'wss' : 'ws';
      sendJson(res, 200, {
        wsUrl: `${protocol}://${url.hostname}:${PORT}/ws`,
        token: state.settings.gatewayToken,
        port: state.settings.gatewayPort,
      });
      return;
    }

    if (url.pathname === '/api/gateway/start' && req.method === 'POST') {
      await startGateway();
      sendJson(res, 200, { success: true });
      return;
    }

    if (url.pathname === '/api/gateway/stop' && req.method === 'POST') {
      await stopGateway();
      sendJson(res, 200, { success: true });
      return;
    }

    if (url.pathname === '/api/gateway/restart' && req.method === 'POST') {
      await stopGateway();
      await startGateway();
      sendJson(res, 200, { success: true });
      return;
    }

    if (url.pathname === '/api/agents' && req.method === 'GET') {
      const state = await loadState();
      sendJson(res, 200, { success: true, ...(await listAgentsSnapshot(state)) });
      return;
    }

    if (url.pathname === '/api/agents' && req.method === 'POST') {
      const body = await readBody(req);
      const name = String(body.name || 'New Agent');
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      await runOpenClaw(['agents', 'add', name, '--json', '--non-interactive', '--workspace', `~/.openclaw/workspace-${slug}`]);
      const state = await loadState();
      state.agentNames[slug] = name;
      await saveState(state);
      sendJson(res, 200, { success: true, ...(await listAgentsSnapshot(state)) });
      return;
    }

    if (url.pathname.startsWith('/api/agents/') && req.method === 'PUT') {
      const suffix = url.pathname.slice('/api/agents/'.length);
      const parts = suffix.split('/').filter(Boolean);
      const agentId = decodeURIComponent(parts[0]);
      if (parts.length === 1) {
        const body = await readBody(req);
        await runOpenClaw(['agents', 'set-identity', '--agent', agentId, '--name', String(body.name || agentId), '--json']);
        const state = await loadState();
        state.agentNames[agentId] = String(body.name || agentId);
        await saveState(state);
        sendJson(res, 200, { success: true, ...(await listAgentsSnapshot(state)) });
        return;
      }
      if (parts.length === 3 && parts[1] === 'channels') {
        const channelType = decodeURIComponent(parts[2]);
        await runOpenClaw(['agents', 'bind', '--agent', agentId, '--bind', channelType, '--json']);
        const state = await loadState();
        sendJson(res, 200, { success: true, ...(await listAgentsSnapshot(state)) });
        return;
      }
    }

    if (url.pathname.startsWith('/api/agents/') && req.method === 'DELETE') {
      const suffix = url.pathname.slice('/api/agents/'.length);
      const parts = suffix.split('/').filter(Boolean);
      const agentId = decodeURIComponent(parts[0]);
      if (parts.length === 1) {
        await runOpenClaw(['agents', 'delete', agentId, '--force', '--json']);
        const state = await loadState();
        delete state.agentNames[agentId];
        await saveState(state);
        sendJson(res, 200, { success: true, ...(await listAgentsSnapshot(state)) });
        return;
      }
      if (parts.length === 3 && parts[1] === 'channels') {
        const channelType = decodeURIComponent(parts[2]);
        await runOpenClaw(['agents', 'unbind', '--agent', agentId, '--bind', channelType, '--json']);
        const state = await loadState();
        sendJson(res, 200, { success: true, ...(await listAgentsSnapshot(state)) });
        return;
      }
    }

    if (url.pathname === '/api/channels/configured' && req.method === 'GET') {
      sendJson(res, 200, { success: true, channels: await listConfiguredChannelsFromConfig() });
      return;
    }

    if (url.pathname === '/api/channels/config' && req.method === 'POST') {
      const body = await readBody(req);
      await saveChannelValues(body.channelType, body.config || {}, body.accountId);
      sendJson(res, 200, { success: true });
      return;
    }

    if (url.pathname === '/api/channels/config/enabled' && req.method === 'PUT') {
      const body = await readBody(req);
      await setChannelEnabled(body.channelType, Boolean(body.enabled));
      sendJson(res, 200, { success: true });
      return;
    }

    if (url.pathname.startsWith('/api/channels/config/') && req.method === 'GET') {
      const channelType = decodeURIComponent(url.pathname.slice('/api/channels/config/'.length));
      const accountId = url.searchParams.get('accountId') || undefined;
      sendJson(res, 200, { success: true, values: await getChannelValues(channelType, accountId) });
      return;
    }

    if (url.pathname.startsWith('/api/channels/config/') && req.method === 'DELETE') {
      const channelType = decodeURIComponent(url.pathname.slice('/api/channels/config/'.length));
      await deleteChannelConfig(channelType);
      sendJson(res, 200, { success: true });
      return;
    }

    if (url.pathname === '/api/provider-vendors' && req.method === 'GET') {
      sendJson(res, 200, PROVIDER_VENDORS);
      return;
    }

    if (url.pathname === '/api/provider-accounts' && req.method === 'GET') {
      const state = await loadState();
      sendJson(res, 200, await loadProviderAccounts(state));
      return;
    }

    if (url.pathname === '/api/provider-accounts' && req.method === 'POST') {
      const body = await readBody(req);
      const state = await loadState();
      const account = {
        ...body.account,
        secret: body.apiKey || '',
      };
      state.providerAccounts.push(account);
      if (account.isDefault || !state.defaultProviderAccountId) {
        state.defaultProviderAccountId = account.id;
      }
      await saveState(state);
      await syncProviderAccountsToAuth(state);
      sendJson(res, 200, { success: true, account });
      return;
    }

    if (url.pathname === '/api/provider-accounts/default' && req.method === 'GET') {
      const state = await loadState();
      sendJson(res, 200, { accountId: state.defaultProviderAccountId });
      return;
    }

    if (url.pathname === '/api/provider-accounts/default' && req.method === 'PUT') {
      const body = await readBody(req);
      const state = await loadState();
      state.defaultProviderAccountId = body.accountId;
      await saveState(state);
      await syncProviderAccountsToAuth(state);
      sendJson(res, 200, { success: true });
      return;
    }

    if (url.pathname.startsWith('/api/provider-accounts/') && req.method === 'PUT') {
      const accountId = decodeURIComponent(url.pathname.slice('/api/provider-accounts/'.length));
      const body = await readBody(req);
      const state = await loadState();
      const account = state.providerAccounts.find((item) => item.id === accountId);
      if (account) {
        Object.assign(account, body.updates || {});
        if (body.apiKey) {
          account.secret = body.apiKey;
        }
        account.updatedAt = new Date().toISOString();
      }
      await saveState(state);
      await syncProviderAccountsToAuth(state);
      sendJson(res, 200, { success: true, account });
      return;
    }

    if (url.pathname.startsWith('/api/provider-accounts/') && req.method === 'DELETE') {
      const accountId = decodeURIComponent(url.pathname.slice('/api/provider-accounts/'.length));
      const state = await loadState();
      state.providerAccounts = state.providerAccounts.filter((item) => item.id !== accountId);
      if (state.defaultProviderAccountId === accountId) {
        state.defaultProviderAccountId = state.providerAccounts[0]?.id || null;
      }
      await saveState(state);
      await syncProviderAccountsToAuth(state);
      sendJson(res, 200, { success: true });
      return;
    }

    if (url.pathname === '/api/clawhub/list' && req.method === 'GET') {
      const { stdout } = await runOpenClaw(['skills', 'list', '--json']);
      const parsed = parseCliJson(stdout);
      const results = Array.isArray(parsed.skills)
        ? parsed.skills.map((skill) => ({
          slug: skill.name,
          version: 'bundled',
          source: skill.source,
          baseDir: skill.path || skill.source,
        }))
        : [];
      sendJson(res, 200, { success: true, results });
      return;
    }

    if (url.pathname === '/api/skills/configs' && req.method === 'GET') {
      sendJson(res, 200, {});
      return;
    }

    if (url.pathname === '/api/clawhub/search' && req.method === 'POST') {
      sendJson(res, 200, { success: true, results: [] });
      return;
    }

    if (url.pathname === '/api/clawhub/install' && req.method === 'POST') {
      sendJson(res, 501, { success: false, error: 'Marketplace install is not wired in the Linux bridge yet.' });
      return;
    }

    if (url.pathname === '/api/clawhub/uninstall' && req.method === 'POST') {
      sendJson(res, 501, { success: false, error: 'Marketplace uninstall is not wired in the Linux bridge yet.' });
      return;
    }

    if (url.pathname === '/api/cron/jobs' && req.method === 'GET') {
      const state = await loadState();
      const jobs = await gatewayCall(state, 'cron.list', { includeDisabled: true });
      sendJson(res, 200, Array.isArray(jobs.items) ? jobs.items.map((job) => ({
        id: job.id,
        name: job.name,
        message: job.payload?.message || job.payload?.text || '',
        schedule: job.schedule?.expr || job.schedule || '',
        enabled: job.enabled,
        createdAt: new Date(job.createdAtMs || Date.now()).toISOString(),
        updatedAt: new Date(job.updatedAtMs || Date.now()).toISOString(),
        nextRun: job.state?.nextRunAtMs ? new Date(job.state.nextRunAtMs).toISOString() : undefined,
        lastRun: job.state?.lastRunAtMs ? {
          time: new Date(job.state.lastRunAtMs).toISOString(),
          success: job.state.lastStatus !== 'error',
          error: job.state.lastError,
          duration: job.state.lastDurationMs,
        } : undefined,
      })) : []);
      return;
    }

    if (url.pathname === '/api/cron/jobs' && req.method === 'POST') {
      const body = await readBody(req);
      const state = await loadState();
      await runOpenClaw([
        'cron', 'add',
        '--name', String(body.name || 'New Job'),
        '--message', String(body.message || ''),
        '--cron', String(body.schedule || '* * * * *'),
        ...(body.enabled === false ? ['--disabled'] : []),
        '--json',
        '--url', currentGatewayWsUrl(state),
        '--token', state.settings.gatewayToken,
      ]);
      sendJson(res, 200, { success: true });
      return;
    }

    if (url.pathname.startsWith('/api/cron/jobs/') && req.method === 'PUT') {
      const id = decodeURIComponent(url.pathname.slice('/api/cron/jobs/'.length));
      const body = await readBody(req);
      const state = await loadState();
      const args = [
        'cron', 'edit',
        id,
        '--json',
        '--url', currentGatewayWsUrl(state),
        '--token', state.settings.gatewayToken,
      ];
      if (body.name) args.push('--name', String(body.name));
      if (body.message) args.push('--message', String(body.message));
      if (body.schedule) args.push('--cron', String(body.schedule));
      await runOpenClaw(args);
      sendJson(res, 200, { success: true });
      return;
    }

    if (url.pathname.startsWith('/api/cron/jobs/') && req.method === 'DELETE') {
      const id = decodeURIComponent(url.pathname.slice('/api/cron/jobs/'.length));
      const state = await loadState();
      await runOpenClaw(['cron', 'rm', id, '--json', '--url', currentGatewayWsUrl(state), '--token', state.settings.gatewayToken]);
      sendJson(res, 200, { success: true });
      return;
    }

    if (url.pathname === '/api/cron/toggle' && req.method === 'POST') {
      const body = await readBody(req);
      const state = await loadState();
      await runOpenClaw(['cron', body.enabled ? 'enable' : 'disable', body.id, '--json', '--url', currentGatewayWsUrl(state), '--token', state.settings.gatewayToken]);
      sendJson(res, 200, { success: true });
      return;
    }

    if (url.pathname === '/api/cron/trigger' && req.method === 'POST') {
      const body = await readBody(req);
      const state = await loadState();
      await runOpenClaw(['cron', 'run', body.id, '--json', '--url', currentGatewayWsUrl(state), '--token', state.settings.gatewayToken]);
      sendJson(res, 200, { success: true });
      return;
    }

    if (url.pathname === '/api/usage/recent-token-history' && req.method === 'GET') {
      const { stdout } = await runOpenClaw(['gateway', 'usage-cost', '--json']).catch(() => ({ stdout: '[]' }));
      const parsed = parseCliJson(stdout);
      const entries = Array.isArray(parsed.sessions)
        ? parsed.sessions.map((entry) => ({
          timestamp: entry.updatedAt || new Date().toISOString(),
          sessionId: entry.sessionId || crypto.randomUUID(),
          agentId: entry.agentId || 'main',
          model: entry.model,
          provider: entry.provider,
          inputTokens: entry.inputTokens || 0,
          outputTokens: entry.outputTokens || 0,
          cacheReadTokens: entry.cacheReadTokens || 0,
          cacheWriteTokens: entry.cacheWriteTokens || 0,
          totalTokens: entry.totalTokens || 0,
          costUsd: entry.costUsd,
        }))
        : [];
      sendJson(res, 200, entries);
      return;
    }

    if (url.pathname === '/api/logs' && req.method === 'GET') {
      sendJson(res, 200, {
        content: [
          `[bridge] gateway ${gatewayStatus.state}`,
          `[bridge] openclaw bin ${OPENCLAW_BIN}`,
          `[bridge] config ${OPENCLAW_CONFIG}`,
        ].join('\n'),
      });
      return;
    }

    if (url.pathname === '/api/app/openclaw-doctor' && req.method === 'POST') {
      const { stdout } = await runOpenClaw(['doctor']).catch((error) => ({ stdout: String(error.message || error) }));
      sendJson(res, 200, { success: true, output: stdout.trim() });
      return;
    }

    if (url.pathname === '/api/files/stage-buffer' && req.method === 'POST') {
      const body = await readBody(req);
      sendJson(res, 200, await stageBuffer(body.base64, body.fileName, body.mimeType));
      return;
    }

    if (url.pathname === '/api/chat/send-with-media' && req.method === 'POST') {
      const body = await readBody(req);
      const result = await sendChatMessage(body);
      sendJson(res, 200, { success: true, result });
      return;
    }

    if (url.pathname === '/api/sessions/delete' && req.method === 'POST') {
      const body = await readBody(req);
      await deleteSessionByKey(body.sessionKey);
      sendJson(res, 200, { success: true });
      return;
    }

    await serveStatic(req, res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { success: false, error: String(error.message || error) });
  }
});

import http from 'node:http';

server.on('upgrade', async (req, socket, head) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  if (url.pathname === '/ws') {
    const state = await loadState();
    const proxyHeaders = { ...req.headers };
    proxyHeaders.origin = `http://127.0.0.1:5177`;
    proxyHeaders.host = `127.0.0.1:${state.settings.gatewayPort}`;

    const proxyReq = http.request({
      port: state.settings.gatewayPort,
      host: '127.0.0.1',
      path: '/ws',
      headers: proxyHeaders,
    });

    proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
      let headers = `HTTP/${req.httpVersion} 101 Switching Protocols\r\n`;
      for (const key of Object.keys(proxyRes.headers)) {
        headers += `${key}: ${proxyRes.headers[key]}\r\n`;
      }
      headers += '\r\n';
      socket.write(headers);
      if (proxyHead && proxyHead.length) socket.write(proxyHead);
      proxySocket.pipe(socket);
      socket.pipe(proxySocket);
    });

    proxyReq.on('error', (err) => {
      console.error('[ws-proxy] error:', err.message);
      socket.destroy();
    });

    socket.on('error', () => {
      proxyReq.destroy();
    });

    proxyReq.end();
  } else {
    socket.destroy();
  }
});

await ensureOpenClawScaffold();
const state = await loadState();
if (!existsSync(STATE_FILE)) {
  await saveState(state);
}
updateGatewayStatus({ port: state.settings.gatewayPort });
if (state.settings.gatewayAutoStart) {
  await startGateway().catch((error) => {
    updateGatewayStatus({ state: 'error', error: String(error.message || error) });
  });
}

server.listen(PORT, HOST, () => {
  console.log(`[device-bridge] listening on:`);
  console.log(`  - Local:   http://localhost:${PORT}`);

  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  - Network: http://${net.address}:${PORT}`);
      }
    }
  }

  try {
    const bonjour = new Bonjour();
    bonjour.publish({ name: 'tjyk-claw', type: 'http', port: PORT });
    console.log(`  - mDNS:    http://tjyk-claw.local:${PORT}`);
  } catch (err) {
    console.warn(`[device-bridge] mDNS / Avahi setup failed: ${err.message}`);
  }

  console.log(`[device-bridge] openclaw bin: ${OPENCLAW_BIN}`);
});
