import type {
  AgentsSnapshot,
  ChannelRecord,
  ChatSession,
  CronJob,
  DeviceProfile,
  GatewayStatus,
  MarketplaceSkill,
  ProviderAccount,
  ProviderVendor,
  RawMessage,
  SettingsPayload,
  SkillRecord,
  StagedFile,
  UsageHistoryEntry,
} from './types';
import { createId } from './id';

const DEVICE_KEY = 'tjykclaw-dashboard.device';
const LEGACY_DEVICE_KEY = 'clawx-web-lan.device';

type DeviceResponse<T> = T & { success?: boolean; error?: string };

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withProtocol.replace(/\/+$/, '');
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
    return {
      ...parsed,
      baseUrl: normalizeUrl(parsed.baseUrl),
    };
  } catch {
    return null;
  }
}

export function saveDeviceProfile(profile: DeviceProfile): void {
  const serialized = JSON.stringify({
    ...profile,
    baseUrl: normalizeUrl(profile.baseUrl),
  });
  window.localStorage.setItem(DEVICE_KEY, serialized);
  window.localStorage.removeItem(LEGACY_DEVICE_KEY);
}

export function clearDeviceProfile(): void {
  window.localStorage.removeItem(DEVICE_KEY);
  window.localStorage.removeItem(LEGACY_DEVICE_KEY);
}

function ensureDeviceBase(baseUrl?: string): string {
  const resolved = normalizeUrl(baseUrl || readDeviceProfile()?.baseUrl || '');
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

export async function probeDevice(baseUrl: string): Promise<GatewayStatus> {
  return deviceFetch<GatewayStatus>('/api/gateway/status', undefined, baseUrl);
}

export async function getGatewayStatus(): Promise<GatewayStatus> {
  return deviceFetch<GatewayStatus>('/api/gateway/status');
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
}

export async function getAgents(): Promise<AgentsSnapshot> {
  return deviceFetch<DeviceResponse<AgentsSnapshot>>('/api/agents');
}

export async function createAgent(name: string): Promise<AgentsSnapshot> {
  return deviceFetch<DeviceResponse<AgentsSnapshot>>('/api/agents', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function renameAgent(agentId: string, name: string): Promise<AgentsSnapshot> {
  return deviceFetch<DeviceResponse<AgentsSnapshot>>(`/api/agents/${encodeURIComponent(agentId)}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
}

export async function deleteAgent(agentId: string): Promise<AgentsSnapshot> {
  return deviceFetch<DeviceResponse<AgentsSnapshot>>(`/api/agents/${encodeURIComponent(agentId)}`, {
    method: 'DELETE',
  });
}

export async function assignAgentChannel(agentId: string, channelType: string): Promise<AgentsSnapshot> {
  return deviceFetch<DeviceResponse<AgentsSnapshot>>(
    `/api/agents/${encodeURIComponent(agentId)}/channels/${encodeURIComponent(channelType)}`,
    { method: 'PUT' },
  );
}

export async function removeAgentChannel(agentId: string, channelType: string): Promise<AgentsSnapshot> {
  return deviceFetch<DeviceResponse<AgentsSnapshot>>(
    `/api/agents/${encodeURIComponent(agentId)}/channels/${encodeURIComponent(channelType)}`,
    { method: 'DELETE' },
  );
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
}

export async function setChannelEnabled(channelType: string, enabled: boolean): Promise<void> {
  await deviceFetch('/api/channels/config/enabled', {
    method: 'PUT',
    body: JSON.stringify({ channelType, enabled }),
  });
}

export async function deleteChannel(channelType: string): Promise<void> {
  await deviceFetch(`/api/channels/config/${encodeURIComponent(channelType)}`, {
    method: 'DELETE',
  });
}

export async function getProviders(): Promise<ProviderAccount[]> {
  return deviceFetch('/api/provider-accounts');
}

export async function getProviderVendors(): Promise<ProviderVendor[]> {
  return deviceFetch('/api/provider-vendors');
}

export async function createProviderAccount(account: ProviderAccount, apiKey?: string): Promise<void> {
  await deviceFetch('/api/provider-accounts', {
    method: 'POST',
    body: JSON.stringify({ account, apiKey }),
  });
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
}

export async function deleteProviderAccount(accountId: string): Promise<void> {
  await deviceFetch(`/api/provider-accounts/${encodeURIComponent(accountId)}`, {
    method: 'DELETE',
  });
}

export async function setDefaultProviderAccount(accountId: string): Promise<void> {
  await deviceFetch('/api/provider-accounts/default', {
    method: 'PUT',
    body: JSON.stringify({ accountId }),
  });
}

export async function getInstalledSkills(): Promise<SkillRecord[]> {
  const [installed, configs] = await Promise.all([
    deviceFetch<{ success?: boolean; results?: Array<Record<string, unknown>> }>('/api/clawhub/list'),
    deviceFetch<Record<string, { apiKey?: string; env?: Record<string, string> }>>('/api/skills/configs'),
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
}

export async function uninstallSkill(slug: string): Promise<void> {
  await deviceFetch('/api/clawhub/uninstall', {
    method: 'POST',
    body: JSON.stringify({ slug }),
  });
}

export async function getCronJobs(): Promise<CronJob[]> {
  return deviceFetch('/api/cron/jobs');
}

export async function createCronJob(input: { name: string; message: string; schedule: string; enabled?: boolean }): Promise<void> {
  await deviceFetch('/api/cron/jobs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateCronJob(
  id: string,
  patch: { name?: string; message?: string; schedule?: string; enabled?: boolean },
): Promise<void> {
  await deviceFetch(`/api/cron/jobs/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export async function deleteCronJob(id: string): Promise<void> {
  await deviceFetch(`/api/cron/jobs/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function toggleCronJob(id: string, enabled: boolean): Promise<void> {
  await deviceFetch('/api/cron/toggle', {
    method: 'POST',
    body: JSON.stringify({ id, enabled }),
  });
}

export async function runCronJob(id: string): Promise<void> {
  await deviceFetch('/api/cron/trigger', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}

export async function getUsageHistory(): Promise<UsageHistoryEntry[]> {
  return deviceFetch('/api/usage/recent-token-history');
}

export async function getLogs(): Promise<{ content: string }> {
  return deviceFetch('/api/logs?tailLines=180');
}

export async function runDoctor(mode: 'diagnose' | 'fix' = 'diagnose'): Promise<Record<string, unknown>> {
  return deviceFetch('/api/app/openclaw-doctor', {
    method: 'POST',
    body: JSON.stringify({ mode }),
  });
}

export async function stageFileBuffer(file: File): Promise<StagedFile> {
  const base64 = await fileToBase64(file);
  return deviceFetch('/api/files/stage-buffer', {
    method: 'POST',
    body: JSON.stringify({
      base64,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
    }),
  });
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
  await deviceFetch('/api/chat/send-with-media', {
    method: 'POST',
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
    .filter((session) => session.key);
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
