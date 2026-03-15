import type {
  AgentsSnapshot,
  BackupConfig,
  BackupSnapshot,
  BackupStatus,
  ChannelRecord,
  ChatSession,
  CronJob,
  DeviceProfile,
  GatewayStatus,
  LobsterDocument,
  LobsterDocumentSummary,
  MarketplaceSkill,
  OverviewSnapshot,
  ProviderAccount,
  ProviderVendor,
  RawMessage,
  SettingsPayload,
  SkillRecord,
  StagedFile,
  UploadedFileRecord,
  UsageHistoryEntry,
} from './types';
import { createId } from './id';

const DEVICE_KEY = 'tjykclaw-dashboard.device';
const LEGACY_DEVICE_KEY = 'clawx-web-lan.device';
const CHAT_CLIENT_KEY = 'tjykclaw-dashboard.chat-client';
const GET_CACHE = new Map<string, { expiresAt: number; value: unknown }>();

type DeviceResponse<T> = T & { success?: boolean; error?: string };

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withProtocol.replace(/\/+$/, '');
}

function isLoopbackHostname(hostname: string): boolean {
  const value = String(hostname || '').toLowerCase();
  return value === 'localhost' || value === '127.0.0.1' || value === '::1';
}

function normalizeLocalLoopback(baseUrl: string): string {
  if (typeof window === 'undefined') return baseUrl;
  try {
    const target = new URL(baseUrl);
    const current = new URL(window.location.origin);
    if (
      isLoopbackHostname(target.hostname) &&
      isLoopbackHostname(current.hostname) &&
      target.port === current.port &&
      target.protocol === current.protocol
    ) {
      return current.origin;
    }
  } catch {
    return baseUrl;
  }
  return baseUrl;
}

function buildCacheKey(baseUrl: string, path: string): string {
  return `${baseUrl}${path}`;
}

function readCachedValue<T>(key: string): T | null {
  const hit = GET_CACHE.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    GET_CACHE.delete(key);
    return null;
  }
  return hit.value as T;
}

function writeCachedValue<T>(key: string, value: T, ttlMs: number): T {
  GET_CACHE.set(key, {
    expiresAt: Date.now() + ttlMs,
    value,
  });
  return value;
}

function clearApiCache(prefixes?: string[]): void {
  if (!prefixes?.length) {
    GET_CACHE.clear();
    return;
  }
  for (const key of Array.from(GET_CACHE.keys())) {
    if (prefixes.some((prefix) => key.includes(prefix))) {
      GET_CACHE.delete(key);
    }
  }
}

export function listKnownChannelTypes(): string[] {
  return [
    'whatsapp',
    'telegram',
    'discord',
    'feishu',
    'wecom',
    'dingtalk',
    'signal',
    'matrix',
    'line',
    'msteams',
    'googlechat',
    'mattermost',
    'qqbot',
  ];
}

export function readDeviceProfile(): DeviceProfile | null {
  try {
    const raw = window.localStorage.getItem(DEVICE_KEY) || window.localStorage.getItem(LEGACY_DEVICE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeviceProfile;
    if (!parsed?.baseUrl) return null;
    const normalizedBaseUrl = normalizeLocalLoopback(normalizeUrl(parsed.baseUrl));
    return {
      ...parsed,
      baseUrl: normalizedBaseUrl,
    };
  } catch {
    return null;
  }
}

export function saveDeviceProfile(profile: DeviceProfile): void {
  const normalizedBaseUrl = normalizeLocalLoopback(normalizeUrl(profile.baseUrl));
  const serialized = JSON.stringify({
    ...profile,
    baseUrl: normalizedBaseUrl,
  });
  window.localStorage.setItem(DEVICE_KEY, serialized);
  window.localStorage.removeItem(LEGACY_DEVICE_KEY);
}

export function clearDeviceProfile(): void {
  window.localStorage.removeItem(DEVICE_KEY);
  window.localStorage.removeItem(LEGACY_DEVICE_KEY);
}

export function getChatClientId(): string {
  const existing = window.localStorage.getItem(CHAT_CLIENT_KEY);
  if (existing) return existing;
  const next = createId();
  window.localStorage.setItem(CHAT_CLIENT_KEY, next);
  return next;
}

export function buildMainSessionKey(agentId: string): string {
  return `agent:${agentId}:main`;
}

export function buildNewSessionKey(agentId: string): string {
  return `agent:${agentId}:session-${Date.now()}`;
}

export function isCurrentClientSession(sessionKey: string): boolean {
  void sessionKey;
  return true;
}

function ensureDeviceBase(baseUrl?: string): string {
  const resolved = normalizeLocalLoopback(normalizeUrl(baseUrl || readDeviceProfile()?.baseUrl || ''));
  if (!resolved) {
    throw new Error('当前还没有已配对设备。');
  }
  return resolved;
}

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { success?: boolean; error?: string };
  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'error' in payload
      ? String(payload.error)
      : `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  if (typeof payload === 'object' && payload && 'success' in payload && payload.success === false) {
    throw new Error(payload.error || '设备请求失败。');
  }
  return payload;
}

export async function deviceFetch<T>(path: string, init?: RequestInit, baseUrl?: string): Promise<T> {
  const target = ensureDeviceBase(baseUrl);
  let response: Response;
  try {
    response = await fetch(`${target}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`无法连接设备地址 ${target}。${message}`);
  }
  return parseJson<T>(response);
}

async function cachedDeviceFetch<T>(path: string, ttlMs: number, baseUrl?: string): Promise<T> {
  const target = ensureDeviceBase(baseUrl);
  const key = buildCacheKey(target, path);
  const cached = readCachedValue<T>(key);
  if (cached !== null) return cached;
  const value = await deviceFetch<T>(path, undefined, target);
  return writeCachedValue(key, value, ttlMs);
}

export async function probeDevice(baseUrl: string): Promise<GatewayStatus> {
  return deviceFetch<GatewayStatus>('/api/gateway/status', undefined, baseUrl);
}

export async function getGatewayStatus(): Promise<GatewayStatus> {
  return deviceFetch<GatewayStatus>('/api/gateway/status');
}

export async function getOverview(): Promise<OverviewSnapshot> {
  return cachedDeviceFetch<OverviewSnapshot>('/api/overview', 6000);
}

export async function startGateway(): Promise<void> {
  await deviceFetch('/api/gateway/start', { method: 'POST' });
}

export async function stopGateway(): Promise<void> {
  await deviceFetch('/api/gateway/stop', { method: 'POST' });
}

export async function restartGateway(): Promise<void> {
  await deviceFetch('/api/gateway/restart', { method: 'POST' });
}

export async function getGatewayInfo(): Promise<{ wsUrl: string; token?: string; port: number }> {
  return deviceFetch('/api/app/gateway-info');
}

export async function getSettings(): Promise<SettingsPayload> {
  return deviceFetch('/api/settings');
}

export async function updateSettings(patch: Partial<SettingsPayload>): Promise<void> {
  await deviceFetch('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
  clearApiCache(['/api/settings']);
}

export async function getBackupConfig(): Promise<BackupConfig> {
  return deviceFetch('/api/backups/config');
}

export async function updateBackupConfig(patch: Partial<BackupConfig>): Promise<BackupConfig> {
  const response = await deviceFetch<{ config: BackupConfig }>('/api/backups/config', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
  return response.config;
}

export async function getBackupStatus(): Promise<BackupStatus> {
  return cachedDeviceFetch('/api/backups/status', 4000);
}

export async function listBackupSnapshots(): Promise<BackupSnapshot[]> {
  const response = await cachedDeviceFetch<{ items: BackupSnapshot[] }>('/api/backups/snapshots', 4000);
  return response.items || [];
}

export async function createBackupSnapshot(input?: {
  type?: string;
  note?: string;
  scope?: 'full' | 'files_only';
}): Promise<BackupSnapshot> {
  const response = await deviceFetch<{ snapshot: BackupSnapshot }>('/api/backups/snapshots', {
    method: 'POST',
    body: JSON.stringify(input || {}),
  });
  clearApiCache(['/api/backups/']);
  return response.snapshot;
}

export async function verifyBackupSnapshot(snapshotId: string): Promise<BackupSnapshot> {
  const response = await deviceFetch<{ snapshot: BackupSnapshot }>(`/api/backups/snapshots/${encodeURIComponent(snapshotId)}/verify`, {
    method: 'POST',
  });
  clearApiCache(['/api/backups/']);
  return response.snapshot;
}

export async function restoreBackupSnapshot(snapshotId: string): Promise<{ success: boolean; snapshotId: string; restoredAt?: string }> {
  const response = await deviceFetch<{ success: boolean; snapshotId: string; restoredAt?: string }>(
    `/api/backups/snapshots/${encodeURIComponent(snapshotId)}/restore`,
    {
    method: 'POST',
    },
  );
  clearApiCache(['/api/backups/', '/api/overview', '/api/agents', '/api/provider-accounts', '/api/channels/']);
  return response;
}

export async function deleteBackupSnapshot(snapshotId: string): Promise<void> {
  await deviceFetch(`/api/backups/snapshots/${encodeURIComponent(snapshotId)}`, {
    method: 'DELETE',
  });
  clearApiCache(['/api/backups/']);
}

export async function getAgents(): Promise<AgentsSnapshot> {
  return cachedDeviceFetch<DeviceResponse<AgentsSnapshot>>('/api/agents', 5000);
}

export async function createAgent(name: string): Promise<AgentsSnapshot> {
  const response = await deviceFetch<DeviceResponse<AgentsSnapshot>>('/api/agents', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  clearApiCache(['/api/agents', '/api/overview']);
  return response;
}

export async function renameAgent(agentId: string, name: string): Promise<AgentsSnapshot> {
  const response = await deviceFetch<DeviceResponse<AgentsSnapshot>>(`/api/agents/${encodeURIComponent(agentId)}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
  clearApiCache(['/api/agents', '/api/overview']);
  return response;
}

export async function deleteAgent(agentId: string): Promise<AgentsSnapshot> {
  const response = await deviceFetch<DeviceResponse<AgentsSnapshot>>(`/api/agents/${encodeURIComponent(agentId)}`, {
    method: 'DELETE',
  });
  clearApiCache(['/api/agents', '/api/overview']);
  return response;
}

export async function assignAgentChannel(agentId: string, channelType: string): Promise<AgentsSnapshot> {
  const response = await deviceFetch<DeviceResponse<AgentsSnapshot>>(
    `/api/agents/${encodeURIComponent(agentId)}/channels/${encodeURIComponent(channelType)}`,
    { method: 'PUT' },
  );
  clearApiCache(['/api/agents', '/api/channels/', '/api/overview']);
  return response;
}

export async function removeAgentChannel(agentId: string, channelType: string): Promise<AgentsSnapshot> {
  const response = await deviceFetch<DeviceResponse<AgentsSnapshot>>(
    `/api/agents/${encodeURIComponent(agentId)}/channels/${encodeURIComponent(channelType)}`,
    { method: 'DELETE' },
  );
  clearApiCache(['/api/agents', '/api/channels/', '/api/overview']);
  return response;
}

export async function getChannels(): Promise<ChannelRecord[]> {
  const rpc = await import('./gateway-rpc');
  try {
    const status = await rpc.gatewayRpc<{
      channelOrder?: string[];
      channels?: Record<string, unknown>;
      channelAccounts?: Record<string, Array<Record<string, unknown>>>;
      channelDefaultAccountId?: Record<string, string>;
    }>('channels.status', { probe: true });
    const order = status.channelOrder || Object.keys(status.channels || {});
    return order.map((channelType) => {
      const summary = (status.channels?.[channelType] ?? {}) as Record<string, unknown>;
      const accounts = status.channelAccounts?.[channelType] || [];
      const defaultAccountId = status.channelDefaultAccountId?.[channelType];
      const primary = defaultAccountId
        ? accounts.find((entry) => entry.accountId === defaultAccountId) || accounts[0]
        : accounts[0];
      const connected = accounts.some((entry) => entry.connected === true || entry.linked === true);
      const running = accounts.some((entry) => entry.running === true);
      const hasError = accounts.some((entry) => typeof entry.lastError === 'string' && entry.lastError);
      let recordStatus: ChannelRecord['status'] = 'disconnected';
      if (connected) recordStatus = 'connected';
      else if (hasError) recordStatus = 'error';
      else if (running) recordStatus = 'connecting';
      return {
        id: `${channelType}-${String(primary?.accountId || 'default')}`,
        type: channelType,
        name: String(primary?.name || channelType),
        status: recordStatus,
        accountId: primary?.accountId ? String(primary.accountId) : undefined,
        error: typeof summary.error === 'string' ? summary.error : undefined,
      };
    });
  } catch {
    const response = await deviceFetch<{ channels: ChannelRecord[] }>('/api/channels/configured');
    return response.channels || [];
  }
}

export async function getChannelConfig(channelType: string, accountId?: string): Promise<Record<string, unknown>> {
  const suffix = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';
  const response = await deviceFetch<{ values: Record<string, unknown> }>(
    `/api/channels/config/${encodeURIComponent(channelType)}${suffix}`,
  );
  return response.values || {};
}

export async function saveChannelConfig(
  channelType: string,
  config: Record<string, unknown>,
  accountId?: string,
): Promise<void> {
  await deviceFetch('/api/channels/config', {
    method: 'POST',
    body: JSON.stringify({ channelType, config, accountId }),
  });
  clearApiCache(['/api/channels/', '/api/overview']);
}

export async function setChannelEnabled(channelType: string, enabled: boolean): Promise<void> {
  await deviceFetch('/api/channels/config/enabled', {
    method: 'PUT',
    body: JSON.stringify({ channelType, enabled }),
  });
  clearApiCache(['/api/channels/', '/api/overview']);
}

export async function deleteChannel(channelType: string): Promise<void> {
  await deviceFetch(`/api/channels/config/${encodeURIComponent(channelType)}`, {
    method: 'DELETE',
  });
  clearApiCache(['/api/channels/', '/api/overview']);
}

export async function getProviders(): Promise<ProviderAccount[]> {
  return cachedDeviceFetch('/api/provider-accounts', 8000);
}

export async function getProviderVendors(): Promise<ProviderVendor[]> {
  return deviceFetch('/api/provider-vendors');
}

export async function createProviderAccount(account: ProviderAccount, apiKey?: string): Promise<void> {
  await deviceFetch('/api/provider-accounts', {
    method: 'POST',
    body: JSON.stringify({ account, apiKey }),
  });
  clearApiCache(['/api/provider-accounts', '/api/overview']);
}

export async function updateProviderAccount(
  accountId: string,
  updates: Partial<ProviderAccount>,
  apiKey?: string,
): Promise<void> {
  await deviceFetch(`/api/provider-accounts/${encodeURIComponent(accountId)}`, {
    method: 'PUT',
    body: JSON.stringify({ updates, apiKey }),
  });
  clearApiCache(['/api/provider-accounts', '/api/overview']);
}

export async function deleteProviderAccount(accountId: string): Promise<void> {
  await deviceFetch(`/api/provider-accounts/${encodeURIComponent(accountId)}`, {
    method: 'DELETE',
  });
  clearApiCache(['/api/provider-accounts', '/api/overview']);
}

export async function setDefaultProviderAccount(accountId: string): Promise<void> {
  await deviceFetch('/api/provider-accounts/default', {
    method: 'PUT',
    body: JSON.stringify({ accountId }),
  });
  clearApiCache(['/api/provider-accounts', '/api/overview']);
}

export async function getInstalledSkills(): Promise<SkillRecord[]> {
  const [installed, configs] = await Promise.all([
    cachedDeviceFetch<{ success?: boolean; results?: Array<Record<string, unknown>> }>('/api/clawhub/list', 15000),
    cachedDeviceFetch<Record<string, { apiKey?: string; env?: Record<string, string> }>>('/api/skills/configs', 15000),
  ]);
  return (installed.results || []).map((entry) => {
    const slug = typeof entry.slug === 'string' ? entry.slug : undefined;
    const sourceKey = typeof entry.baseDir === 'string' ? entry.baseDir : slug;
    const config = sourceKey ? configs[sourceKey] || configs[slug || ''] : undefined;
    return {
      id: slug || createId(),
      slug,
      name: slug || '未知技能',
      description: config?.apiKey ? '已配置设备密钥。' : '已从 ClawHub 安装。',
      enabled: true,
      version: typeof entry.version === 'string' ? entry.version : undefined,
      baseDir: typeof entry.baseDir === 'string' ? entry.baseDir : undefined,
      source: typeof entry.source === 'string' ? entry.source : undefined,
      filePath: typeof entry.baseDir === 'string' ? entry.baseDir : undefined,
    };
  });
}

export async function searchMarketplace(query: string): Promise<MarketplaceSkill[]> {
  const response = await deviceFetch<{ success?: boolean; results?: MarketplaceSkill[] }>('/api/clawhub/search', {
    method: 'POST',
    body: JSON.stringify({ query, limit: 18 }),
  });
  return response.results || [];
}

export async function installSkill(slug: string): Promise<void> {
  await deviceFetch('/api/clawhub/install', {
    method: 'POST',
    body: JSON.stringify({ slug }),
  });
  clearApiCache(['/api/clawhub/', '/api/skills/', '/api/overview']);
}

export async function uninstallSkill(slug: string): Promise<void> {
  await deviceFetch('/api/clawhub/uninstall', {
    method: 'POST',
    body: JSON.stringify({ slug }),
  });
  clearApiCache(['/api/clawhub/', '/api/skills/', '/api/overview']);
}

export async function getCronJobs(): Promise<CronJob[]> {
  return cachedDeviceFetch('/api/cron/jobs', 8000);
}

export async function createCronJob(input: { name: string; message: string; schedule: string; enabled?: boolean }): Promise<void> {
  await deviceFetch('/api/cron/jobs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  clearApiCache(['/api/cron/', '/api/overview']);
}

export async function updateCronJob(
  id: string,
  patch: { name?: string; message?: string; schedule?: string; enabled?: boolean },
): Promise<void> {
  await deviceFetch(`/api/cron/jobs/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
  clearApiCache(['/api/cron/', '/api/overview']);
}

export async function deleteCronJob(id: string): Promise<void> {
  await deviceFetch(`/api/cron/jobs/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  clearApiCache(['/api/cron/', '/api/overview']);
}

export async function toggleCronJob(id: string, enabled: boolean): Promise<void> {
  await deviceFetch('/api/cron/toggle', {
    method: 'POST',
    body: JSON.stringify({ id, enabled }),
  });
  clearApiCache(['/api/cron/', '/api/overview']);
}

export async function runCronJob(id: string): Promise<void> {
  await deviceFetch('/api/cron/trigger', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
  clearApiCache(['/api/cron/', '/api/overview']);
}

export async function getUsageHistory(): Promise<UsageHistoryEntry[]> {
  return cachedDeviceFetch('/api/usage/recent-token-history', 12000);
}

export async function getLogs(): Promise<{ content: string }> {
  return deviceFetch('/api/logs?tailLines=180');
}

export async function getLobsterDocuments(): Promise<LobsterDocumentSummary[]> {
  const response = await cachedDeviceFetch<{ items: LobsterDocumentSummary[] }>('/api/lobster/documents', 10000);
  return response.items || [];
}

export async function getLobsterDocument(documentId: string): Promise<LobsterDocument> {
  return deviceFetch(`/api/lobster/documents/${encodeURIComponent(documentId)}`);
}

export async function saveLobsterDocument(documentId: string, content: string): Promise<LobsterDocument> {
  const response = await deviceFetch<LobsterDocument>(`/api/lobster/documents/${encodeURIComponent(documentId)}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
  clearApiCache(['/api/lobster/documents']);
  return response;
}

export async function runDoctor(mode: 'diagnose' | 'fix' = 'diagnose'): Promise<Record<string, unknown>> {
  return deviceFetch('/api/app/openclaw-doctor', {
    method: 'POST',
    body: JSON.stringify({ mode }),
  });
}

export async function stageFileBuffer(file: File): Promise<StagedFile> {
  const base64 = await fileToBase64(file);
  const response = await deviceFetch<StagedFile>('/api/files/stage-buffer', {
    method: 'POST',
    body: JSON.stringify({
      base64,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
    }),
  });
  clearApiCache(['/api/files/uploaded']);
  return response;
}

export async function getUploadedFiles(): Promise<UploadedFileRecord[]> {
  const response = await cachedDeviceFetch<{ items: UploadedFileRecord[] }>('/api/files/uploaded', 5000);
  return response.items || [];
}

export async function deleteUploadedFile(fileId: string): Promise<void> {
  await deviceFetch(`/api/files/uploaded/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
  });
  clearApiCache(['/api/files/uploaded']);
}

async function fileToBase64(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export async function sendChatMessage(
  sessionKey: string,
  message: string,
  media: StagedFile[],
): Promise<void> {
  const controller = new AbortController();
  const timeoutMs = 120_000;
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await deviceFetch<{ result?: { success?: boolean; error?: string } | null; error?: string }>('/api/chat/send-with-media', {
      method: 'POST',
      signal: controller.signal,
      body: JSON.stringify({
        sessionKey,
        message,
        idempotencyKey: createId(),
        media: media.map((file) => ({
          filePath: file.stagedPath,
          mimeType: file.mimeType,
          fileName: file.fileName,
        })),
      }),
    });

    if (response?.result && typeof response.result === 'object' && response.result.success === false) {
      throw new Error(response.result.error || '发送失败。');
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('发送超时，模型可能仍在后台运行。请等待几秒刷新会话，或点击“中止运行”。');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function deleteSession(sessionKey: string): Promise<void> {
  await deviceFetch('/api/sessions/delete', {
    method: 'POST',
    body: JSON.stringify({ sessionKey }),
  });
}

export async function getChatSessions(): Promise<ChatSession[]> {
  const rpc = await import('./gateway-rpc');
  const response = await rpc.gatewayRpc<{ sessions?: Array<Record<string, unknown>> }>('sessions.list', {});
  return (response.sessions || [])
    .map((session) => ({
      key: String(session.key || ''),
      label: typeof session.label === 'string' ? session.label : undefined,
      displayName: typeof session.displayName === 'string' ? session.displayName : undefined,
      model: typeof session.model === 'string' ? session.model : undefined,
      updatedAt: typeof session.updatedAt === 'number' ? session.updatedAt : undefined,
    }))
    .filter((session) => session.key && isCurrentClientSession(session.key));
}

export async function getChatHistory(sessionKey: string): Promise<RawMessage[]> {
  const rpc = await import('./gateway-rpc');
  const response = await rpc.gatewayRpc<RawMessage[] | { messages?: RawMessage[] }>('chat.history', { sessionKey, limit: 200 });
  if (Array.isArray(response)) return response;
  if (response && Array.isArray((response as any).messages)) return (response as any).messages;
  return [];
}

export async function abortChat(sessionKey: string): Promise<void> {
  const rpc = await import('./gateway-rpc');
  await rpc.gatewayRpc('chat.abort', { sessionKey });
}
