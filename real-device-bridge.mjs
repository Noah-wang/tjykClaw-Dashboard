import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import { createReadStream, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { Bonjour } from 'bonjour-service';

function getClientIdFromIp(ip) {
  const value = String(ip || '');
  const isLocalhost =
    value === '127.0.0.1' ||
    value === '::1' ||
    value.includes('127.0.0.1') ||
    value.includes('localhost');
  if (isLocalhost) return 'local';
  return value.replace(/^.*:/, '').replace(/[^a-zA-Z0-9]/g, '_') || 'unknown';
}


const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3210);
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || 'openclaw';
const SERVE_STATIC = process.env.SERVE_STATIC !== '0';
const DIST_DIR = path.join(process.cwd(), 'dist');
const STATE_DIR = path.join(os.homedir(), '.tjykclaw-dashboard-bridge');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const OPENCLAW_DIR = path.join(os.homedir(), '.openclaw');
const WORKSPACE_DIR = path.join(OPENCLAW_DIR, 'workspace');
const OPENCLAW_CONFIG = path.join(OPENCLAW_DIR, 'openclaw.json');
const MAIN_AGENT_DIR = path.join(OPENCLAW_DIR, 'agents', 'main', 'agent');
const AUTH_PROFILES_PATH = path.join(MAIN_AGENT_DIR, 'auth-profiles.json');
const MAIN_AGENT_MODELS_PATH = path.join(MAIN_AGENT_DIR, 'models.json');
const STORAGE_DIR = path.join(os.homedir(), '.tjykclaw-storage');
const FILE_LIBRARY_DIR = path.join(STORAGE_DIR, 'files');
const LEGACY_UPLOADS_DIR = path.join(STORAGE_DIR, 'uploads');
const LEGACY_BRIDGE_STAGED_DIR = path.join(STATE_DIR, 'staged');
const BACKUP_ROOT_DIR = path.join(os.homedir(), '.tjykclaw-backups');

const LOBSTER_DOCUMENTS = [
  { id: 'soul', name: 'SOUL.md', path: path.join(WORKSPACE_DIR, 'SOUL.md'), description: '龙虾的行为原则和性格设定。' },
  { id: 'identity', name: 'IDENTITY.md', path: path.join(WORKSPACE_DIR, 'IDENTITY.md'), description: '龙虾的自我身份和定位。' },
  { id: 'user', name: 'USER.md', path: path.join(WORKSPACE_DIR, 'USER.md'), description: '关于当前用户的记忆和偏好。' },
  { id: 'agents', name: 'AGENTS.md', path: path.join(WORKSPACE_DIR, 'AGENTS.md'), description: '工作流和协作约束。' },
  { id: 'bootstrap', name: 'BOOTSTRAP.md', path: path.join(WORKSPACE_DIR, 'BOOTSTRAP.md'), description: '启动时需要读取的上下文。' },
  { id: 'tools', name: 'TOOLS.md', path: path.join(WORKSPACE_DIR, 'TOOLS.md'), description: '龙虾可用工具和约束说明。' },
  { id: 'heartbeat', name: 'HEARTBEAT.md', path: path.join(WORKSPACE_DIR, 'HEARTBEAT.md'), description: '运行节奏与检查点。' },
];

const DEFAULT_LOBSTER_DOCUMENT_CONTENT = {
  soul: `# SOUL.md

你是龙虾，运行在本地硬件上的 AI 助手。

## 行为原则

- 先解决问题，再解释过程。
- 能直接执行的事情，不让用户重复劳动。
- 对设备、本地文件和自动化场景保持敏感。
- 输出尽量简洁，必要时再展开。
`,
  identity: `# IDENTITY.md

- 名称：龙虾
- 角色：本地 AI 助手 / 设备中控 / 文件与知识助手
- 部署形态：运行在用户自己的硬件上，通过网页控制台访问
`,
  user: `# USER.md

记录当前用户的偏好、习惯、常用任务和注意事项。
`,
  agents: `# AGENTS.md

默认主智能体负责日常问答、文件操作、设备控制和自动化任务。
`,
  bootstrap: `# BOOTSTRAP.md

启动后优先检查：

1. 网关状态
2. 模型是否已配置
3. 设备文档是否可读取
4. 是否存在待处理的定时任务
`,
  tools: `# TOOLS.md

可用能力：

- OpenClaw 运行时
- 网页控制台
- 本地文件读写
- 定时任务
- 备份与恢复
`,
  heartbeat: `# HEARTBEAT.md

系统应保持：

- 网关在线
- 模型可用
- 备份状态正常
- 关键文档可读
`,
};

const DEFAULT_GATEWAY_PORT = Number(process.env.GATEWAY_PORT || 18789);
const DEFAULT_BACKUP_CONFIG = {
  enabled: false,
  schedule: 'daily',
  retentionCount: 7,
  includeSessions: true,
  includeStorage: true,
  rootDir: BACKUP_ROOT_DIR,
  preRestoreSnapshot: true,
};
const DEFAULT_BACKUP_STATUS = {
  currentOperation: 'idle',
  currentSnapshotId: null,
  message: '',
  lastBackupAt: null,
  lastRestoreAt: null,
  lastVerifiedAt: null,
  lastBackupResult: null,
  lastRestoreResult: null,
  lastVerificationResult: null,
};

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
  backups: {
    config: DEFAULT_BACKUP_CONFIG,
    status: DEFAULT_BACKUP_STATUS,
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
let backupOperationInFlight = false;
let gatewayStatus = {
  state: 'stopped',
  port: DEFAULT_STATE.settings.gatewayPort,
  pid: undefined,
  connectedAt: undefined,
  error: undefined,
};
let backupScheduler = null;
let backupTickInFlight = false;
const sseClients = new Set();
const responseCache = new Map();

function cloneCacheValue(value) {
  if (typeof value === 'undefined') return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

async function readCachedResponse(key, ttlMs, loader) {
  const hit = responseCache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return cloneCacheValue(hit.value);
  }
  const value = await loader();
  responseCache.set(key, {
    expiresAt: Date.now() + ttlMs,
    value: cloneCacheValue(value),
  });
  return cloneCacheValue(value);
}

function invalidateResponseCache(prefixes = []) {
  if (!prefixes.length) {
    responseCache.clear();
    return;
  }
  for (const key of Array.from(responseCache.keys())) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      responseCache.delete(key);
    }
  }
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    const defaultSettings = structuredClone(fallback); // Use fallback here
    if (defaultSettings?.settings && existsSync(OPENCLAW_CONFIG)) {
      try {
        const ocfgRaw = await fs.readFile(OPENCLAW_CONFIG, 'utf8');
        const ocfg = JSON.parse(ocfgRaw);
        if (ocfg?.gateway?.auth?.token) {
          defaultSettings.settings.gatewayToken = ocfg.gateway.auth.token;
          defaultSettings.settings.gatewayPort = ocfg.gateway.port || DEFAULT_GATEWAY_PORT;
        }
      } catch (err) {
        console.warn('[device-bridge] Failed to read bottom OpenClaw config for token:', err.message);
      }
    }
    return defaultSettings;
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
    backups: {
      config: {
        ...DEFAULT_BACKUP_CONFIG,
        ...(raw.backups?.config || {}),
      },
      status: {
        ...DEFAULT_BACKUP_STATUS,
        ...(raw.backups?.status || {}),
      },
    },
  };
}

async function saveState(next) {
  await writeJson(STATE_FILE, next);
}

function getBackupConfig(state) {
  return {
    ...DEFAULT_BACKUP_CONFIG,
    ...(state?.backups?.config || {}),
  };
}

function getBackupStatus(state) {
  return {
    ...DEFAULT_BACKUP_STATUS,
    ...(state?.backups?.status || {}),
  };
}

async function updateBackupState(update) {
  const state = await loadState();
  state.backups ||= { config: structuredClone(DEFAULT_BACKUP_CONFIG), status: structuredClone(DEFAULT_BACKUP_STATUS) };
  state.backups.config = getBackupConfig(state);
  state.backups.status = {
    ...getBackupStatus(state),
    ...(update || {}),
  };
  await saveState(state);
  return state.backups.status;
}

async function resetBackupStatusIfStale(state) {
  const currentStatus = getBackupStatus(state);
  if (backupOperationInFlight || currentStatus.currentOperation === 'idle') {
    return currentStatus;
  }
  state.backups ||= { config: structuredClone(DEFAULT_BACKUP_CONFIG), status: structuredClone(DEFAULT_BACKUP_STATUS) };
  state.backups.status = {
    ...currentStatus,
    currentOperation: 'idle',
    currentSnapshotId: null,
    message: '',
  };
  await saveState(state);
  return state.backups.status;
}

function buildSnapshotId(type) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${type}-${stamp}`;
}

function getBackupSourceDefinitions(config) {
  return [
    { id: 'openclaw', relative: '.openclaw', path: OPENCLAW_DIR, required: true },
    { id: 'bridge', relative: '.tjykclaw-dashboard-bridge', path: STATE_DIR, required: true },
    { id: 'workspace', relative: '.openclaw/workspace', path: WORKSPACE_DIR, required: false, enabled: false },
    { id: 'storage', relative: '.tjykclaw-storage', path: STORAGE_DIR, required: false, enabled: Boolean(config.includeStorage) },
  ];
}

async function ensureBackupRoot(config) {
  const rootDir = String(config.rootDir || BACKUP_ROOT_DIR);
  const snapshotsDir = path.join(rootDir, 'snapshots');
  await ensureDir(snapshotsDir);
  return { rootDir, snapshotsDir };
}

function getManifestPath(snapshotDir) {
  return path.join(snapshotDir, 'manifest.json');
}

async function readSnapshotManifest(snapshotDir) {
  return readJson(getManifestPath(snapshotDir), null);
}

async function computeFileSha256(filePath) {
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => {
      hash.update(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });
  });
}

async function writeSnapshotManifest(snapshotDir, manifest) {
  await writeJson(getManifestPath(snapshotDir), manifest);
}

async function listSnapshots(state) {
  const config = getBackupConfig(state);
  const { snapshotsDir } = await ensureBackupRoot(config);
  const entries = await fs.readdir(snapshotsDir, { withFileTypes: true }).catch(() => []);
  const manifests = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      const snapshotDir = path.join(snapshotsDir, entry.name);
      const manifest = await readSnapshotManifest(snapshotDir);
      return manifest ? { ...manifest, directory: snapshotDir } : null;
    }));
  return manifests
    .filter(Boolean)
    .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
}

async function getSnapshotById(state, snapshotId) {
  const config = getBackupConfig(state);
  const { snapshotsDir } = await ensureBackupRoot(config);
  const snapshotDir = path.join(snapshotsDir, snapshotId);
  const manifest = await readSnapshotManifest(snapshotDir);
  if (!manifest) {
    throw new Error(`未找到备份快照：${snapshotId}`);
  }
  return { ...manifest, directory: snapshotDir };
}

async function pruneSnapshots(state) {
  const config = getBackupConfig(state);
  const retentionCount = Math.max(1, Number(config.retentionCount || DEFAULT_BACKUP_CONFIG.retentionCount));
  const snapshots = await listSnapshots(state);
  const stale = snapshots.slice(retentionCount);
  await Promise.all(stale.map(async (snapshot) => {
    if (snapshot?.directory) {
      await fs.rm(snapshot.directory, { recursive: true, force: true });
    }
  }));
}

function getBridgeVersion() {
  return process.env.npm_package_version || '0.1.0';
}

function getScheduleIntervalMs(schedule) {
  if (schedule === 'hourly') return 60 * 60 * 1000;
  if (schedule === 'daily') return 24 * 60 * 60 * 1000;
  return null;
}

async function createSnapshot(state, options = {}) {
  backupOperationInFlight = true;
  const config = getBackupConfig(state);
  const { rootDir, snapshotsDir } = await ensureBackupRoot(config);
  const snapshotId = buildSnapshotId(options.type || 'manual');
  const snapshotDir = path.join(snapshotsDir, snapshotId);
  const archiveName = 'snapshot.tar.gz';
  const archivePath = path.join(snapshotDir, archiveName);
  const requestedSourceIds = Array.isArray(options.sourceIds)
    ? new Set(options.sourceIds.map((item) => String(item)))
    : null;
  const sourceDefs = getBackupSourceDefinitions(config)
    .filter((entry) => !requestedSourceIds || requestedSourceIds.has(entry.id))
    .filter((entry) => requestedSourceIds ? true : (entry.required || entry.enabled))
    .filter((entry) => existsSync(entry.path));

  if (sourceDefs.length === 0) {
    throw new Error('没有可备份的数据目录。');
  }

  await ensureDir(snapshotDir);
  await updateBackupState({
    currentOperation: 'creating',
    currentSnapshotId: snapshotId,
    message: '正在创建备份快照…',
  });
  try {
    const tarArgs = ['-czf', archivePath, '-C', os.homedir()];
    if (!config.includeSessions) {
      tarArgs.push('--exclude=.openclaw/agents/*/sessions');
    }
    tarArgs.push(...sourceDefs.map((entry) => entry.relative));
    await runCommand('tar', tarArgs, { timeoutMs: 120_000 });

    const checksum = await computeFileSha256(archivePath);
    const stat = await fs.stat(archivePath);
    const manifest = {
      id: snapshotId,
      createdAt: new Date().toISOString(),
      type: options.type || 'manual',
      status: 'ready',
      restorable: true,
      includes: sourceDefs.map((entry) => entry.id),
      archiveName,
      archivePath,
      archiveSize: stat.size,
      checksum,
      rootDir,
      note: options.note || '',
      openclawVersion: null,
      bridgeVersion: getBridgeVersion(),
      verifiedAt: null,
      lastVerificationOk: null,
      lastVerificationMessage: '',
    };
    await writeSnapshotManifest(snapshotDir, manifest);
    await fs.writeFile(path.join(snapshotDir, 'sha256.txt'), `${checksum}  ${archiveName}\n`, 'utf8');

    const nextState = await loadState();
    await updateBackupState({
      currentOperation: 'idle',
      currentSnapshotId: null,
      message: '',
      lastBackupAt: manifest.createdAt,
      lastBackupResult: {
        success: true,
        snapshotId,
        message: '备份创建完成。',
      },
    });
    await pruneSnapshots(nextState);
    return manifest;
  } catch (error) {
    await updateBackupState({
      currentOperation: 'idle',
      currentSnapshotId: null,
      message: '',
      lastBackupResult: {
        success: false,
        snapshotId,
        message: String(error.message || error),
      },
    }).catch(() => { });
    await fs.rm(snapshotDir, { recursive: true, force: true }).catch(() => { });
    throw error;
  } finally {
    backupOperationInFlight = false;
  }
}

async function verifySnapshot(state, snapshotId) {
  backupOperationInFlight = true;
  try {
    const snapshot = await getSnapshotById(state, snapshotId);
    await updateBackupState({
      currentOperation: 'verifying',
      currentSnapshotId: snapshotId,
      message: '正在校验备份…',
    });

    const archivePath = path.join(snapshot.directory, snapshot.archiveName || 'snapshot.tar.gz');
    const actualChecksum = await computeFileSha256(archivePath);
    const ok = actualChecksum === snapshot.checksum;
    const nextManifest = {
      ...snapshot,
      verifiedAt: new Date().toISOString(),
      lastVerificationOk: ok,
      lastVerificationMessage: ok ? '校验通过。' : '校验失败，文件哈希不匹配。',
      restorable: ok,
      status: ok ? 'ready' : 'corrupt',
    };
    await writeSnapshotManifest(snapshot.directory, nextManifest);
    await updateBackupState({
      currentOperation: 'idle',
      currentSnapshotId: null,
      message: '',
      lastVerifiedAt: nextManifest.verifiedAt,
      lastVerificationResult: {
        success: ok,
        snapshotId,
        message: nextManifest.lastVerificationMessage,
      },
    });
    if (!ok) {
      throw new Error(nextManifest.lastVerificationMessage);
    }
    return nextManifest;
  } finally {
    backupOperationInFlight = false;
  }
}

async function restoreSnapshot(state, snapshotId) {
  backupOperationInFlight = true;
  try {
    const config = getBackupConfig(state);
    const snapshot = await verifySnapshot(state, snapshotId);
    const archivePath = path.join(snapshot.directory, snapshot.archiveName || 'snapshot.tar.gz');
    const restoreRoot = path.join(snapshot.directory, '_restore');
    const extractedRoot = path.join(restoreRoot, crypto.randomUUID());
    const rollbackRoot = path.join(restoreRoot, `rollback-${Date.now()}`);
    const shouldRestart = gatewayStatus.state === 'running' || state.settings.gatewayAutoStart;
    const sourceDefs = getBackupSourceDefinitions(config).filter((entry) => snapshot.includes?.includes(entry.id));
    const restoredTargets = [];

    await updateBackupState({
      currentOperation: 'restoring',
      currentSnapshotId: snapshotId,
      message: '正在恢复备份…',
    });

    if (config.preRestoreSnapshot) {
      await createSnapshot(state, {
        type: 'pre_restore',
        note: `Pre-restore safeguard before ${snapshotId}`,
      });
      await updateBackupState({
        currentOperation: 'restoring',
        currentSnapshotId: snapshotId,
        message: '正在恢复备份…',
      });
    }

    await stopGateway();
    await ensureDir(extractedRoot);
    await ensureDir(rollbackRoot);
    await runCommand('tar', ['-xzf', archivePath, '-C', extractedRoot], { timeoutMs: 120_000 });

    try {
      for (const source of sourceDefs) {
        const extractedPath = path.join(extractedRoot, source.relative);
        if (!existsSync(extractedPath)) continue;
        const rollbackPath = path.join(rollbackRoot, source.id);
        if (existsSync(source.path)) {
          await ensureDir(path.dirname(rollbackPath));
          await fs.rename(source.path, rollbackPath);
        }
        await ensureDir(path.dirname(source.path));
        await fs.rename(extractedPath, source.path);
        restoredTargets.push({ target: source.path, rollbackPath });
      }
    } catch (error) {
      for (const entry of restoredTargets.reverse()) {
        if (existsSync(entry.target)) {
          await fs.rm(entry.target, { recursive: true, force: true });
        }
        if (existsSync(entry.rollbackPath)) {
          await fs.rename(entry.rollbackPath, entry.target).catch(() => { });
        }
      }
      await updateBackupState({
        currentOperation: 'idle',
        currentSnapshotId: null,
        message: '',
        lastRestoreAt: new Date().toISOString(),
        lastRestoreResult: {
          success: false,
          snapshotId,
          message: String(error.message || error),
        },
      });
      throw error;
    } finally {
      await fs.rm(restoreRoot, { recursive: true, force: true }).catch(() => { });
    }

    const restoredState = await loadState();
    restoredState.backups ||= {};
    restoredState.backups.config = {
      ...getBackupConfig(restoredState),
      rootDir: config.rootDir,
    };
    restoredState.backups.status = {
      ...getBackupStatus(restoredState),
      currentOperation: 'idle',
      currentSnapshotId: null,
      message: '',
      lastRestoreAt: new Date().toISOString(),
      lastRestoreResult: {
        success: true,
        snapshotId,
        message: '备份恢复完成。',
      },
    };
    await saveState(restoredState);

    if (shouldRestart) {
      await startGateway();
    }
    return {
      success: true,
      snapshotId,
      restoredAt: restoredState.backups.status.lastRestoreAt,
    };
  } finally {
    backupOperationInFlight = false;
  }
}

async function deleteSnapshot(state, snapshotId) {
  backupOperationInFlight = true;
  try {
    const snapshot = await getSnapshotById(state, snapshotId);
    await fs.rm(snapshot.directory, { recursive: true, force: true });
  } finally {
    backupOperationInFlight = false;
  }
}

function backupIsDue(config, status, now = Date.now()) {
  if (!config.enabled) return false;
  const intervalMs = getScheduleIntervalMs(config.schedule);
  if (!intervalMs) return false;
  const lastBackupAt = status.lastBackupAt ? new Date(status.lastBackupAt).getTime() : 0;
  return !lastBackupAt || (now - lastBackupAt) >= intervalMs;
}

async function maybeRunScheduledBackup() {
  if (backupTickInFlight) return;
  backupTickInFlight = true;
  try {
    const state = await loadState();
    const config = getBackupConfig(state);
    const status = getBackupStatus(state);
    if (!backupIsDue(config, status)) return;
    await createSnapshot(state, {
      type: 'scheduled',
      note: `Scheduled ${config.schedule} backup`,
    });
  } catch (error) {
    await updateBackupState({
      currentOperation: 'idle',
      currentSnapshotId: null,
      message: '',
      lastBackupResult: {
        success: false,
        snapshotId: null,
        message: String(error.message || error),
      },
    }).catch(() => { });
  } finally {
    backupTickInFlight = false;
  }
}

function startBackupScheduler() {
  if (backupScheduler) {
    clearInterval(backupScheduler);
  }
  backupScheduler = setInterval(() => {
    void maybeRunScheduledBackup();
  }, 60_000);
}

async function ensureOpenClawScaffold() {
  await ensureDir(STATE_DIR);
  await ensureDir(STORAGE_DIR);
  await ensureDir(FILE_LIBRARY_DIR);
  await ensureDir(MAIN_AGENT_DIR);
  await ensureDir(WORKSPACE_DIR);
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
  await Promise.all(LOBSTER_DOCUMENTS.map(async (entry) => {
    if (existsSync(entry.path)) return;
    const content = DEFAULT_LOBSTER_DOCUMENT_CONTENT[entry.id] || `# ${entry.name}\n`;
    await fs.writeFile(entry.path, content, 'utf8');
  }));
  await migrateLegacyUploadedFiles();
}

async function migrateLegacyUploadedFiles() {
  const legacyDirs = [LEGACY_UPLOADS_DIR, LEGACY_BRIDGE_STAGED_DIR];
  await ensureDir(FILE_LIBRARY_DIR);

  for (const legacyDir of legacyDirs) {
    const entries = await fs.readdir(legacyDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const sourcePath = path.join(legacyDir, entry.name);
      const targetPath = path.join(FILE_LIBRARY_DIR, entry.name);
      try {
        await fs.access(targetPath);
      } catch {
        await fs.rename(sourcePath, targetPath).catch(async () => {
          await fs.copyFile(sourcePath, targetPath);
          await fs.rm(sourcePath, { force: true });
        });
      }
    }
  }
}

function getAgentRuntimeDir(agentId) {
  return path.join(OPENCLAW_DIR, 'agents', agentId, 'agent');
}

async function copyJsonIfNeeded(sourcePath, targetPath) {
  if (!existsSync(sourcePath)) return;
  if (!existsSync(targetPath)) {
    await ensureDir(path.dirname(targetPath));
    await fs.copyFile(sourcePath, targetPath);
    return;
  }

  const source = await readJson(sourcePath, null);
  const target = await readJson(targetPath, null);
  const sourceProfiles = source && typeof source === 'object' ? Object.keys(source.profiles || {}) : [];
  const targetProfiles = target && typeof target === 'object' ? Object.keys(target.profiles || {}) : [];
  if (sourceProfiles.length > 0 && targetProfiles.length === 0) {
    await fs.copyFile(sourcePath, targetPath);
  }
}

async function ensureAgentRuntimeFiles(agentId) {
  if (!agentId || agentId === 'main') return;
  const agentDir = getAgentRuntimeDir(agentId);
  await ensureDir(agentDir);
  await copyJsonIfNeeded(AUTH_PROFILES_PATH, path.join(agentDir, 'auth-profiles.json'));
  await copyJsonIfNeeded(MAIN_AGENT_MODELS_PATH, path.join(agentDir, 'models.json'));
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

async function runCommand(command, args, options = {}) {
  return await new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(command, args, {
      env: {
        ...process.env,
        ...options.env,
      },
      cwd: options.cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timeoutMs = Number(options.timeoutMs || 0);
    const timeoutId = timeoutMs > 0
      ? setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 1000);
        reject(new Error(`OpenClaw command timed out after ${timeoutMs}ms: ${args.join(' ')}`));
      }, timeoutMs)
      : null;

    const clearTimeoutSafe = () => {
      if (timeoutId) clearTimeout(timeoutId);
    };

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeoutSafe();
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeoutSafe();
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

async function runOpenClaw(args, options = {}) {
  return runCommand(OPENCLAW_BIN, args, options);
}

function currentGatewayWsUrl(state) {
  return `ws://127.0.0.1:${state.settings.gatewayPort}/ws`;
}

function extractGatewayResultError(result) {
  if (!result || typeof result !== 'object') return null;
  if ('success' in result && result.success === false) {
    return typeof result.error === 'string' && result.error.trim() ? result.error : 'OpenClaw 执行失败。';
  }
  if ('status' in result && result.status === 'error') {
    return typeof result.error === 'string' && result.error.trim() ? result.error : 'OpenClaw 执行失败。';
  }
  return null;
}

async function gatewayCall(state, method, params = {}) {
  const args = [
    'gateway',
    'call',
    method,
    '--json',
    '--url',
    currentGatewayWsUrl(state),
    ...(state.settings.gatewayToken ? ['--token', state.settings.gatewayToken] : []),
    '--params',
    JSON.stringify(params),
  ];
  const timeoutMs = method === 'chat.send' ? 120_000 : 30_000;
  const { stdout } = await runOpenClaw(args, { timeoutMs });
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

async function buildOverviewSnapshot(state) {
  const [agentsSnapshot, channels, installedSkills, providers, cronJobs, usage] = await Promise.all([
    listAgentsSnapshot(state),
    listConfiguredChannelsFromConfig(),
    runOpenClaw(['skills', 'list', '--json'])
      .then(({ stdout }) => {
        const parsed = parseCliJson(stdout);
        return Array.isArray(parsed.skills) ? parsed.skills : [];
      })
      .catch(() => []),
    hydrateProviderAccountsFromOpenClaw(state).then((nextState) => loadProviderAccounts(nextState)),
    gatewayCall(state, 'cron.list', { includeDisabled: true })
      .then((jobs) => (Array.isArray(jobs.items) ? jobs.items : []))
      .catch(() => []),
    runOpenClaw(['gateway', 'usage-cost', '--json'])
      .then(({ stdout }) => {
        const parsed = parseCliJson(stdout);
        return Array.isArray(parsed.sessions)
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
      })
      .catch(() => []),
  ]);

  return {
    agents: agentsSnapshot.agents.length,
    channels: channels.length,
    skills: installedSkills.length,
    providers: providers.length,
    jobs: cronJobs.length,
    usage,
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
  const raw = await readJson(AUTH_PROFILES_PATH, { version: 1, profiles: {}, order: {}, lastGood: {} });
  return {
    version: Number(raw?.version || 1),
    profiles: raw?.profiles && typeof raw.profiles === 'object' ? raw.profiles : {},
    order: raw?.order && typeof raw.order === 'object' ? raw.order : {},
    lastGood: raw?.lastGood && typeof raw.lastGood === 'object' ? raw.lastGood : {},
  };
}

async function writeAuthProfiles(store) {
  await writeJson(AUTH_PROFILES_PATH, {
    version: Number(store?.version || 1),
    profiles: store?.profiles && typeof store.profiles === 'object' ? store.profiles : {},
    order: store?.order && typeof store.order === 'object' ? store.order : {},
    lastGood: store?.lastGood && typeof store.lastGood === 'object' ? store.lastGood : {},
  });
}

function defaultProtocolForVendor(vendorId) {
  if (vendorId === 'anthropic') return 'anthropic-messages';
  return 'openai-responses';
}

function inferVendorId(providerKey) {
  const value = String(providerKey || '').trim();
  if (!value) return 'openai';
  if (PROVIDER_VENDORS.some((vendor) => vendor.id === value)) return value;
  if (value === 'gemini') return 'google';
  if (value.startsWith('ollama-')) return 'ollama';
  if (value.startsWith('openai')) return 'openai';
  if (value.startsWith('anthropic')) return 'anthropic';
  if (value.startsWith('openrouter')) return 'openrouter';
  if (value.startsWith('google') || value.startsWith('gemini')) return 'google';
  return value;
}

function inferRuntimeProviderKeyFromAccount(account) {
  const metadata = account?.metadata && typeof account.metadata === 'object' ? account.metadata : {};
  const explicit = String(metadata.runtimeProviderKey || metadata.profileProvider || '').trim();
  const baseUrl = String(account?.baseUrl || '').trim().toLowerCase();
  if (baseUrl.includes('openrouter.ai')) return 'openrouter';
  if (baseUrl.includes('generativelanguage.googleapis.com')) return 'google';
  if (baseUrl.includes('api.anthropic.com')) return 'anthropic';
  if (baseUrl.includes('api.openai.com')) return 'openai';
  if (baseUrl.includes('127.0.0.1:11434') || baseUrl.includes('localhost:11434')) return 'ollama';
  if (explicit) return explicit;

  const vendorId = String(account?.vendorId || '').trim();
  if (vendorId === 'google') return 'google';
  if (vendorId === 'ollama') return 'ollama';
  if (vendorId === 'openrouter') return 'openrouter';
  if (vendorId === 'anthropic') return 'anthropic';
  return vendorId || 'openai';
}

function normalizeModelIdForAccount(model, runtimeProviderKey, vendorId) {
  let value = String(model || '').trim();
  if (!value) return '';
  const removablePrefixes = [runtimeProviderKey, vendorId]
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of removablePrefixes) {
      if (value.startsWith(`${prefix}/`)) {
        value = value.slice(prefix.length + 1).trim();
        changed = true;
      }
    }
  }
  return value;
}

function parseModelRef(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed || trimmed === 'Unconfigured') {
    return { providerKey: undefined, modelId: undefined, raw: undefined };
  }
  const slashIndex = trimmed.indexOf('/');
  if (slashIndex === -1) {
    return { providerKey: undefined, modelId: trimmed, raw: trimmed };
  }
  return {
    providerKey: trimmed.slice(0, slashIndex),
    modelId: trimmed.slice(slashIndex + 1),
    raw: trimmed,
  };
}

function providerKeyMatches(account, runtimeProviderKey) {
  const current = String(runtimeProviderKey || '').trim();
  if (!current) return false;
  const metadata = account.metadata && typeof account.metadata === 'object' ? account.metadata : {};
  const knownKeys = new Set(
    [metadata.runtimeProviderKey, metadata.profileProvider, account.vendorId]
      .map((entry) => String(entry || '').trim())
      .filter(Boolean),
  );
  if (knownKeys.has(current)) return true;
  if (account.vendorId === 'google' && current === 'gemini') return true;
  if (account.vendorId === 'ollama' && current.startsWith('ollama')) return true;
  return false;
}

function getRuntimeProviderKey(account) {
  return inferRuntimeProviderKeyFromAccount(account);
}

async function getCurrentDefaultModelRef(state) {
  try {
    const snapshot = await listAgentsSnapshot(state);
    const defaultAgent = snapshot.agents.find((agent) => agent.id === snapshot.defaultAgentId) || snapshot.agents[0];
    if (defaultAgent?.modelDisplay && defaultAgent.modelDisplay !== 'Unconfigured') {
      return defaultAgent.modelDisplay;
    }
  } catch {
    // Fall back to config if the CLI is temporarily unavailable.
  }

  const config = await readOpenClawConfig();
  return config?.agents?.defaults?.model
    || config?.session?.model
    || config?.model
    || undefined;
}

async function hydrateProviderAccountsFromOpenClaw(state) {
  const authStore = await readAuthProfiles();
  const currentModel = parseModelRef(await getCurrentDefaultModelRef(state));
  const now = new Date().toISOString();
  const existingByProfileId = new Map();

  for (const account of state.providerAccounts || []) {
    const metadata = account.metadata && typeof account.metadata === 'object' ? account.metadata : {};
    const profileId = String(metadata.profileId || account.id || '');
    if (profileId) existingByProfileId.set(profileId, account);
  }

  const nextAccounts = [];
  for (const [profileId, profile] of Object.entries(authStore.profiles || {})) {
    if (!profile || typeof profile !== 'object') continue;
    const runtimeProviderKey = String(profile.provider || profileId.split(':')[0] || '');
    const vendorId = inferVendorId(runtimeProviderKey);
    const vendor = PROVIDER_VENDORS.find((entry) => entry.id === vendorId);
    const existing = existingByProfileId.get(profileId);

    const nextAccount = {
      id: profileId,
      vendorId,
      label: existing?.label || vendor?.name || titleCase(vendorId),
      authMode: profile.type === 'oauth' ? 'oauth_browser' : (existing?.authMode || vendor?.defaultAuthMode || 'api_key'),
      baseUrl: existing?.baseUrl || vendor?.defaultBaseUrl,
      apiProtocol: existing?.apiProtocol || defaultProtocolForVendor(vendorId),
      model: providerKeyMatches(existing || { vendorId, metadata: { runtimeProviderKey } }, currentModel.providerKey)
        ? currentModel.modelId
        : existing?.model,
      enabled: existing?.enabled !== false,
      isDefault: false,
      secret: profile.type === 'api_key' ? profile.key : existing?.secret,
      metadata: {
        ...(existing?.metadata || {}),
        profileId,
        profileProvider: runtimeProviderKey,
        runtimeProviderKey,
      },
      createdAt: existing?.createdAt || now,
      updatedAt: existing?.updatedAt || now,
    };
    nextAccount.metadata.runtimeProviderKey = inferRuntimeProviderKeyFromAccount(nextAccount);
    nextAccount.model = normalizeModelIdForAccount(
      nextAccount.model,
      nextAccount.metadata.runtimeProviderKey,
      nextAccount.vendorId,
    );
    nextAccounts.push(nextAccount);
  }

  for (const account of state.providerAccounts || []) {
    const metadata = account.metadata && typeof account.metadata === 'object' ? account.metadata : {};
    const profileId = String(metadata.profileId || account.id || '');
    if (profileId && authStore.profiles?.[profileId]) continue;
    if (account.authMode === 'local' || account.vendorId === 'ollama') {
      const nextAccount = {
        ...account,
        metadata: {
          ...metadata,
          runtimeProviderKey: metadata.runtimeProviderKey || 'ollama',
        },
      };
      nextAccount.metadata.runtimeProviderKey = inferRuntimeProviderKeyFromAccount(nextAccount);
      nextAccount.model = normalizeModelIdForAccount(
        nextAccount.model,
        nextAccount.metadata.runtimeProviderKey,
        nextAccount.vendorId,
      );
      nextAccounts.push(nextAccount);
    }
  }

  const defaultAccount = nextAccounts.find((account) => providerKeyMatches(account, currentModel.providerKey))
    || nextAccounts.find((account) => account.id === state.defaultProviderAccountId)
    || nextAccounts[0];
  const nextDefaultProviderAccountId = defaultAccount?.id || null;

  const changed = JSON.stringify({
    providerAccounts: state.providerAccounts,
    defaultProviderAccountId: state.defaultProviderAccountId,
  }) !== JSON.stringify({
    providerAccounts: nextAccounts,
    defaultProviderAccountId: nextDefaultProviderAccountId,
  });

  state.providerAccounts = nextAccounts;
  state.defaultProviderAccountId = nextDefaultProviderAccountId;

  if (changed) {
    await saveState(state);
  }

  return state;
}

async function syncProviderAccountsToAuth(state) {
  const authStore = await readAuthProfiles();
  const profiles = {};
  const order = {};
  const lastGood = {};

  for (const account of state.providerAccounts) {
    const runtimeProviderKey = getRuntimeProviderKey(account);
    const metadata = account.metadata && typeof account.metadata === 'object' ? account.metadata : {};
    const profileId = String(metadata.profileId || `${runtimeProviderKey}:${account.id}`);
    account.metadata = {
      ...metadata,
      profileId,
      profileProvider: runtimeProviderKey,
      runtimeProviderKey,
    };

    if (account.authMode === 'local') {
      continue;
    }

    const existingProfile = authStore.profiles?.[profileId];
    if ((account.authMode === 'oauth_browser' || account.authMode === 'oauth_device') && existingProfile?.type === 'oauth') {
      profiles[profileId] = existingProfile;
    } else {
      profiles[profileId] = {
        type: 'api_key',
        provider: runtimeProviderKey,
        key: account.secret || '',
      };
    }

    order[runtimeProviderKey] ||= [];
    order[runtimeProviderKey].push(profileId);
    if (account.id === state.defaultProviderAccountId || account.isDefault) {
      lastGood[runtimeProviderKey] = profileId;
    }
  }

  await writeAuthProfiles({ version: authStore.version || 1, profiles, order, lastGood });

  const defaultAccount = state.providerAccounts.find((item) => item.id === state.defaultProviderAccountId)
    || state.providerAccounts.find((item) => item.isDefault);
  if (defaultAccount?.model) {
    const runtimeProviderKey = getRuntimeProviderKey(defaultAccount);
    const modelId = normalizeModelIdForAccount(defaultAccount.model, runtimeProviderKey, defaultAccount.vendorId);
    await runOpenClaw(['models', 'set', `${runtimeProviderKey}/${modelId}`]).catch(() => { });
  }
}

async function loadProviderAccounts(state) {
  const hydrated = await hydrateProviderAccountsFromOpenClaw(state);
  return hydrated.providerAccounts.map((account) => ({
    id: account.id,
    vendorId: account.vendorId,
    label: account.label,
    authMode: account.authMode,
    baseUrl: account.baseUrl,
    apiProtocol: account.apiProtocol,
    model: account.model,
    enabled: account.enabled !== false,
    isDefault: account.id === hydrated.defaultProviderAccountId,
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

function isIgnorableGatewayWarning(message) {
  const text = String(message || '').toLowerCase();
  return (
    text.includes('chrome extension relay init failed') ||
    (text.includes('eaddrinuse') && text.includes('127.0.0.1:18792'))
  );
}

async function startGateway() {
  const state = await loadState();
  if (gatewayProcess && !gatewayProcess.killed) return;

  try {
    const res = await fetch(`http://127.0.0.1:${state.settings.gatewayPort}/`);
    // If we get any HTTP response (even 404), the underlying gateway HTTP server is alive
    updateGatewayStatus({ state: 'running', error: undefined });
    return;
  } catch (err) {
    // Expected if not running, will proceed to start
  }

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
    if (isIgnorableGatewayWarning(message)) {
      return;
    }
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
  await ensureDir(FILE_LIBRARY_DIR);
  const id = crypto.randomUUID();
  const filePath = path.join(FILE_LIBRARY_DIR, `${id}-${fileName}`);
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

function restoreStoredFileName(value) {
  const base = path.basename(String(value || ''));
  if (/^[0-9a-fA-F-]{36}-/.test(base)) {
    return base.slice(37);
  }
  return base;
}

async function listUploadedFiles() {
  await migrateLegacyUploadedFiles();
  await ensureDir(FILE_LIBRARY_DIR);
  const entries = await fs.readdir(FILE_LIBRARY_DIR, { withFileTypes: true }).catch(() => []);
  const items = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const storedPath = path.join(FILE_LIBRARY_DIR, entry.name);
        const stat = await fs.stat(storedPath);
        return {
          id: entry.name,
          fileName: restoreStoredFileName(entry.name),
          storedPath,
          fileSize: stat.size,
          updatedAt: stat.mtime.toISOString(),
        };
      }),
  );
  return items.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
}

async function deleteUploadedFile(fileId) {
  const safeName = path.basename(String(fileId || ''));
  if (!safeName) {
    throw new Error('Missing uploaded file id.');
  }
  const targetPath = path.join(FILE_LIBRARY_DIR, safeName);
  if (!targetPath.startsWith(FILE_LIBRARY_DIR)) {
    throw new Error('Invalid uploaded file path.');
  }
  await fs.rm(targetPath, { force: true });
}

function getLobsterDocumentMeta(documentId) {
  return LOBSTER_DOCUMENTS.find((entry) => entry.id === documentId) || null;
}

async function readLobsterDocument(documentId) {
  const meta = getLobsterDocumentMeta(documentId);
  if (!meta) {
    throw new Error(`Unknown lobster document: ${documentId}`);
  }
  try {
    const content = await fs.readFile(meta.path, 'utf8');
    return { ...meta, content };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { ...meta, content: '' };
    }
    throw error;
  }
}

async function writeLobsterDocument(documentId, content) {
  const meta = getLobsterDocumentMeta(documentId);
  if (!meta) {
    throw new Error(`Unknown lobster document: ${documentId}`);
  }
  await ensureDir(path.dirname(meta.path));
  await fs.writeFile(meta.path, String(content || ''), 'utf8');
  return { ...meta, content: String(content || '') };
}

async function sendChatMessage(body) {
  const imageAttachments = [];
  const fileReferences = [];
  for (const media of body.media || []) {
    fileReferences.push(`[已附文件: ${media.fileName || path.basename(media.filePath)} | ${media.filePath}]`);
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
  const sessionParts = String(body.sessionKey || '').split(':');
  await ensureAgentRuntimeFiles(sessionParts[1] || 'main');
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
  if (!SERVE_STATIC) {
    sendJson(res, 404, {
      success: false,
      error: '前端网页未在这台设备上启用。请用独立网页包配对这个设备地址。',
    });
    return;
  }
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

    if (url.pathname === '/api/backups/config' && req.method === 'GET') {
      const state = await loadState();
      sendJson(res, 200, getBackupConfig(state));
      return;
    }

    if (url.pathname === '/api/backups/config' && req.method === 'PUT') {
      const patch = await readBody(req);
      const state = await loadState();
      state.backups ||= { config: structuredClone(DEFAULT_BACKUP_CONFIG), status: structuredClone(DEFAULT_BACKUP_STATUS) };
      state.backups.config = {
        ...getBackupConfig(state),
        ...patch,
        retentionCount: Math.max(1, Number(patch.retentionCount || state.backups.config.retentionCount || DEFAULT_BACKUP_CONFIG.retentionCount)),
      };
      await saveState(state);
      startBackupScheduler();
      invalidateResponseCache(['backups:']);
      sendJson(res, 200, { success: true, config: state.backups.config });
      return;
    }

    if (url.pathname === '/api/backups/status' && req.method === 'GET') {
      const state = await loadState();
      sendJson(res, 200, await readCachedResponse('backups:status', 4000, async () => resetBackupStatusIfStale(state)));
      return;
    }

    if (url.pathname === '/api/backups/snapshots' && req.method === 'GET') {
      const state = await loadState();
      await resetBackupStatusIfStale(state);
      sendJson(res, 200, await readCachedResponse('backups:snapshots', 4000, async () => ({ items: await listSnapshots(state) })));
      return;
    }

    if (url.pathname === '/api/backups/snapshots' && req.method === 'POST') {
      const body = await readBody(req);
      const state = await loadState();
      const snapshot = await createSnapshot(state, {
        type: String(body.type || 'manual'),
        note: String(body.note || ''),
        sourceIds: body.scope === 'files_only' ? ['workspace', 'storage'] : undefined,
      });
      invalidateResponseCache(['backups:']);
      sendJson(res, 200, { success: true, snapshot });
      return;
    }

    if (url.pathname.startsWith('/api/backups/snapshots/')) {
      const suffix = url.pathname.slice('/api/backups/snapshots/'.length);
      const parts = suffix.split('/').filter(Boolean);
      const snapshotId = decodeURIComponent(parts[0] || '');
      if (!snapshotId) {
        sendJson(res, 400, { success: false, error: 'Missing snapshot id.' });
        return;
      }
      const state = await loadState();

      if (parts.length === 1 && req.method === 'GET') {
        sendJson(res, 200, await getSnapshotById(state, snapshotId));
        return;
      }

      if (parts.length === 1 && req.method === 'DELETE') {
        await deleteSnapshot(state, snapshotId);
        invalidateResponseCache(['backups:']);
        sendJson(res, 200, { success: true });
        return;
      }

      if (parts.length === 2 && parts[1] === 'verify' && req.method === 'POST') {
        const snapshot = await verifySnapshot(state, snapshotId);
        invalidateResponseCache(['backups:']);
        sendJson(res, 200, { success: true, snapshot });
        return;
      }

      if (parts.length === 2 && parts[1] === 'restore' && req.method === 'POST') {
        const result = await restoreSnapshot(state, snapshotId);
        invalidateResponseCache(['backups:', 'agents:', 'providers:', 'channels:', 'lobster:', 'overview:', 'usage:']);
        sendJson(res, 200, result);
        return;
      }
    }

    if (url.pathname === '/api/gateway/status' && req.method === 'GET') {
      const state = await loadState();
      sendJson(res, 200, { ...gatewayStatus, port: state.settings.gatewayPort });
      return;
    }

    if (url.pathname === '/api/app/gateway-info' && req.method === 'GET') {
      const state = await loadState();
      const protocol = (req.headers['x-forwarded-proto'] || '').toString().includes('https') ? 'wss' : 'ws';
      const clientId = getClientIdFromIp(req.socket.remoteAddress);
      sendJson(res, 200, {
        wsUrl: `${protocol}://${url.hostname}:${PORT}/ws`,
        token: state.settings.gatewayToken,
        port: state.settings.gatewayPort,
        clientId,
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

    if (url.pathname === '/api/gateway/rpc' && req.method === 'POST') {
      const body = await readBody(req);
      const state = await loadState();
      const method = String(body.method || '');
      if (!method) {
        sendJson(res, 400, { success: false, error: 'Missing RPC method.' });
        return;
      }
      const result = await gatewayCall(state, method, body.params || {});
      sendJson(res, 200, result);
      return;
    }

    if (url.pathname === '/api/overview' && req.method === 'GET') {
      const state = await loadState();
      sendJson(res, 200, await readCachedResponse('overview:snapshot', 6000, () => buildOverviewSnapshot(state)));
      return;
    }

    if (url.pathname === '/api/agents' && req.method === 'GET') {
      const state = await loadState();
      sendJson(
        res,
        200,
        await readCachedResponse('agents:snapshot', 5000, async () => ({ success: true, ...(await listAgentsSnapshot(state)) })),
      );
      return;
    }

    if (url.pathname === '/api/agents' && req.method === 'POST') {
      const body = await readBody(req);
      const name = String(body.name || 'New Agent');
      const beforeState = await loadState();
      const beforeSnapshot = await listAgentsSnapshot(beforeState);
      const beforeIds = new Set(beforeSnapshot.agents.map((agent) => agent.id));
      const fallbackSlug = `agent-${Date.now()}`;
      await runOpenClaw(['agents', 'add', name, '--json', '--non-interactive', '--workspace', `~/.openclaw/workspace-${fallbackSlug}`]);
      const state = await loadState();
      const nextSnapshot = await listAgentsSnapshot(state);
      const createdAgent = nextSnapshot.agents.find((agent) => !beforeIds.has(agent.id))
        || nextSnapshot.agents.find((agent) => agent.name === name)
        || nextSnapshot.agents[nextSnapshot.agents.length - 1];

      if (createdAgent?.id) {
        await ensureAgentRuntimeFiles(createdAgent.id);
        state.agentNames[createdAgent.id] = name;
      }

      await saveState(state);
      invalidateResponseCache(['agents:', 'overview:']);
      sendJson(res, 200, { success: true, ...nextSnapshot });
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
        invalidateResponseCache(['agents:', 'overview:']);
        sendJson(res, 200, { success: true, ...(await listAgentsSnapshot(state)) });
        return;
      }
      if (parts.length === 3 && parts[1] === 'channels') {
        const channelType = decodeURIComponent(parts[2]);
        await runOpenClaw(['agents', 'bind', '--agent', agentId, '--bind', channelType, '--json']);
        const state = await loadState();
        invalidateResponseCache(['agents:', 'channels:', 'overview:']);
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
        invalidateResponseCache(['agents:', 'overview:']);
        sendJson(res, 200, { success: true, ...(await listAgentsSnapshot(state)) });
        return;
      }
      if (parts.length === 3 && parts[1] === 'channels') {
        const channelType = decodeURIComponent(parts[2]);
        await runOpenClaw(['agents', 'unbind', '--agent', agentId, '--bind', channelType, '--json']);
        const state = await loadState();
        invalidateResponseCache(['agents:', 'channels:', 'overview:']);
        sendJson(res, 200, { success: true, ...(await listAgentsSnapshot(state)) });
        return;
      }
    }

    if (url.pathname === '/api/channels/configured' && req.method === 'GET') {
      sendJson(
        res,
        200,
        await readCachedResponse(
          'channels:configured',
          10000,
          async () => ({ success: true, channels: await listConfiguredChannelsFromConfig() }),
        ),
      );
      return;
    }

    if (url.pathname === '/api/channels/config' && req.method === 'POST') {
      const body = await readBody(req);
      await saveChannelValues(body.channelType, body.config || {}, body.accountId);
      invalidateResponseCache(['channels:', 'overview:']);
      sendJson(res, 200, { success: true });
      return;
    }

    if (url.pathname === '/api/channels/config/enabled' && req.method === 'PUT') {
      const body = await readBody(req);
      await setChannelEnabled(body.channelType, Boolean(body.enabled));
      invalidateResponseCache(['channels:', 'overview:']);
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
      invalidateResponseCache(['channels:', 'overview:']);
      sendJson(res, 200, { success: true });
      return;
    }

    if (url.pathname === '/api/provider-vendors' && req.method === 'GET') {
      sendJson(res, 200, PROVIDER_VENDORS);
      return;
    }

    if (url.pathname === '/api/provider-accounts' && req.method === 'GET') {
      const state = await hydrateProviderAccountsFromOpenClaw(await loadState());
      sendJson(res, 200, await readCachedResponse('providers:accounts', 8000, () => loadProviderAccounts(state)));
      return;
    }

    if (url.pathname === '/api/provider-accounts' && req.method === 'POST') {
      const body = await readBody(req);
      const state = await hydrateProviderAccountsFromOpenClaw(await loadState());
      const runtimeProviderKey = inferRuntimeProviderKeyFromAccount(body.account);
      const account = {
        ...body.account,
        model: normalizeModelIdForAccount(body.account?.model, runtimeProviderKey, body.account?.vendorId),
        secret: body.apiKey || '',
        metadata: {
          ...(body.account?.metadata || {}),
          runtimeProviderKey,
        },
      };
      state.providerAccounts = state.providerAccounts.filter((item) => item.id !== account.id);
      state.providerAccounts.push(account);
      if (account.isDefault || !state.defaultProviderAccountId) {
        state.defaultProviderAccountId = account.id;
      }
      await syncProviderAccountsToAuth(state);
      await saveState(state);
      invalidateResponseCache(['providers:', 'overview:']);
      sendJson(res, 200, { success: true, account });
      return;
    }

    if (url.pathname === '/api/provider-accounts/default' && req.method === 'GET') {
      const state = await hydrateProviderAccountsFromOpenClaw(await loadState());
      sendJson(res, 200, await readCachedResponse('providers:default', 8000, async () => ({ accountId: state.defaultProviderAccountId })));
      return;
    }

    if (url.pathname === '/api/provider-accounts/default' && req.method === 'PUT') {
      const body = await readBody(req);
      const state = await hydrateProviderAccountsFromOpenClaw(await loadState());
      state.defaultProviderAccountId = body.accountId;
      await syncProviderAccountsToAuth(state);
      await saveState(state);
      invalidateResponseCache(['providers:', 'overview:']);
      sendJson(res, 200, { success: true });
      return;
    }

    if (url.pathname.startsWith('/api/provider-accounts/') && req.method === 'PUT') {
      const accountId = decodeURIComponent(url.pathname.slice('/api/provider-accounts/'.length));
      const body = await readBody(req);
      const state = await hydrateProviderAccountsFromOpenClaw(await loadState());
      const account = state.providerAccounts.find((item) => item.id === accountId);
      if (account) {
        Object.assign(account, body.updates || {});
        account.metadata = {
          ...(account.metadata && typeof account.metadata === 'object' ? account.metadata : {}),
          runtimeProviderKey: inferRuntimeProviderKeyFromAccount(account),
        };
        account.model = normalizeModelIdForAccount(
          account.model,
          account.metadata.runtimeProviderKey,
          account.vendorId,
        );
        if (body.apiKey) {
          account.secret = body.apiKey;
        }
        account.updatedAt = new Date().toISOString();
      }
      await syncProviderAccountsToAuth(state);
      await saveState(state);
      invalidateResponseCache(['providers:', 'overview:']);
      sendJson(res, 200, { success: true, account });
      return;
    }

    if (url.pathname.startsWith('/api/provider-accounts/') && req.method === 'DELETE') {
      const accountId = decodeURIComponent(url.pathname.slice('/api/provider-accounts/'.length));
      const state = await hydrateProviderAccountsFromOpenClaw(await loadState());
      state.providerAccounts = state.providerAccounts.filter((item) => item.id !== accountId);
      if (state.defaultProviderAccountId === accountId) {
        state.defaultProviderAccountId = state.providerAccounts[0]?.id || null;
      }
      await syncProviderAccountsToAuth(state);
      await saveState(state);
      invalidateResponseCache(['providers:', 'overview:']);
      sendJson(res, 200, { success: true });
      return;
    }

    if (url.pathname === '/api/clawhub/list' && req.method === 'GET') {
      sendJson(
        res,
        200,
        await readCachedResponse('skills:installed', 15000, async () => {
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
          return { success: true, results };
        }),
      );
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
      sendJson(
        res,
        200,
        await readCachedResponse('cron:jobs', 8000, async () => {
          const jobs = await gatewayCall(state, 'cron.list', { includeDisabled: true });
          return Array.isArray(jobs.items) ? jobs.items.map((job) => ({
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
          })) : [];
        }),
      );
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
      invalidateResponseCache(['cron:', 'overview:']);
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
      invalidateResponseCache(['cron:', 'overview:']);
      sendJson(res, 200, { success: true });
      return;
    }

    if (url.pathname.startsWith('/api/cron/jobs/') && req.method === 'DELETE') {
      const id = decodeURIComponent(url.pathname.slice('/api/cron/jobs/'.length));
      const state = await loadState();
      await runOpenClaw(['cron', 'rm', id, '--json', '--url', currentGatewayWsUrl(state), '--token', state.settings.gatewayToken]);
      invalidateResponseCache(['cron:', 'overview:']);
      sendJson(res, 200, { success: true });
      return;
    }

    if (url.pathname === '/api/cron/toggle' && req.method === 'POST') {
      const body = await readBody(req);
      const state = await loadState();
      await runOpenClaw(['cron', body.enabled ? 'enable' : 'disable', body.id, '--json', '--url', currentGatewayWsUrl(state), '--token', state.settings.gatewayToken]);
      invalidateResponseCache(['cron:', 'overview:']);
      sendJson(res, 200, { success: true });
      return;
    }

    if (url.pathname === '/api/cron/trigger' && req.method === 'POST') {
      const body = await readBody(req);
      const state = await loadState();
      await runOpenClaw(['cron', 'run', body.id, '--json', '--url', currentGatewayWsUrl(state), '--token', state.settings.gatewayToken]);
      invalidateResponseCache(['cron:', 'overview:']);
      sendJson(res, 200, { success: true });
      return;
    }

    if (url.pathname === '/api/usage/recent-token-history' && req.method === 'GET') {
      sendJson(
        res,
        200,
        await readCachedResponse('usage:recent', 12000, async () => {
          const { stdout } = await runOpenClaw(['gateway', 'usage-cost', '--json']).catch(() => ({ stdout: '[]' }));
          const parsed = parseCliJson(stdout);
          return Array.isArray(parsed.sessions)
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
        }),
      );
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

    if (url.pathname === '/api/lobster/documents' && req.method === 'GET') {
      sendJson(
        res,
        200,
        await readCachedResponse('lobster:documents', 10000, async () => ({
          items: await Promise.all(LOBSTER_DOCUMENTS.map(async (entry) => {
            const loaded = await readLobsterDocument(entry.id);
            return {
              id: entry.id,
              name: entry.name,
              description: entry.description,
              path: entry.path,
              updatedAt: existsSync(entry.path) ? (await fs.stat(entry.path)).mtime.toISOString() : null,
              size: loaded.content.length,
            };
          })),
        })),
      );
      return;
    }

    if (url.pathname.startsWith('/api/lobster/documents/') && req.method === 'GET') {
      const documentId = decodeURIComponent(url.pathname.slice('/api/lobster/documents/'.length));
      sendJson(res, 200, await readLobsterDocument(documentId));
      return;
    }

    if (url.pathname.startsWith('/api/lobster/documents/') && req.method === 'PUT') {
      const documentId = decodeURIComponent(url.pathname.slice('/api/lobster/documents/'.length));
      const body = await readBody(req);
      const result = await writeLobsterDocument(documentId, body.content);
      invalidateResponseCache(['lobster:']);
      sendJson(res, 200, { success: true, ...result });
      return;
    }

    if (url.pathname === '/api/app/openclaw-doctor' && req.method === 'POST') {
      const { stdout } = await runOpenClaw(['doctor']).catch((error) => ({ stdout: String(error.message || error) }));
      sendJson(res, 200, { success: true, output: stdout.trim() });
      return;
    }

    if (url.pathname === '/api/files/stage-buffer' && req.method === 'POST') {
      const body = await readBody(req);
      const staged = await stageBuffer(body.base64, body.fileName, body.mimeType);
      invalidateResponseCache(['files:uploaded']);
      sendJson(res, 200, staged);
      return;
    }

    if (url.pathname === '/api/files/uploaded' && req.method === 'GET') {
      sendJson(
        res,
        200,
        await readCachedResponse('files:uploaded', 5000, async () => ({ items: await listUploadedFiles() })),
      );
      return;
    }

    if (url.pathname.startsWith('/api/files/uploaded/') && req.method === 'DELETE') {
      const fileId = decodeURIComponent(url.pathname.slice('/api/files/uploaded/'.length));
      await deleteUploadedFile(fileId);
      invalidateResponseCache(['files:uploaded']);
      sendJson(res, 200, { success: true });
      return;
    }

    if (url.pathname === '/api/chat/send-with-media' && req.method === 'POST') {
      const body = await readBody(req);
      const result = await sendChatMessage(body);
      const embeddedError = extractGatewayResultError(result);
      if (embeddedError) {
        sendJson(res, 502, { success: false, error: embeddedError, result });
        return;
      }
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
startBackupScheduler();
void maybeRunScheduledBackup();
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
