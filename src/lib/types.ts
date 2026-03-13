export type DeviceProfile = {
  name: string;
  baseUrl: string;
  pairedAt: string;
};

export type GatewayStatus = {
  state: string;
  port: number;
  pid?: number;
  uptime?: number;
  error?: string;
  connectedAt?: number;
  version?: string;
};

export type AgentSummary = {
  id: string;
  name: string;
  isDefault: boolean;
  modelDisplay: string;
  inheritedModel: boolean;
  workspace: string;
  agentDir: string;
  mainSessionKey: string;
  channelTypes: string[];
};

export type AgentsSnapshot = {
  agents: AgentSummary[];
  defaultAgentId: string;
  configuredChannelTypes: string[];
  channelOwners: Record<string, string>;
  success?: boolean;
};

export type ProviderProtocol =
  | 'openai-completions'
  | 'openai-responses'
  | 'anthropic-messages';

export type ProviderAuthMode =
  | 'api_key'
  | 'oauth_device'
  | 'oauth_browser'
  | 'local';

export type ProviderAccount = {
  id: string;
  vendorId: string;
  label: string;
  authMode: ProviderAuthMode;
  baseUrl?: string;
  apiProtocol?: ProviderProtocol;
  model?: string;
  enabled: boolean;
  isDefault: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ProviderVendor = {
  id: string;
  name: string;
  category: string;
  defaultAuthMode: ProviderAuthMode;
  supportedAuthModes: ProviderAuthMode[];
  supportsMultipleAccounts: boolean;
  defaultBaseUrl?: string;
};

export type ChannelRecord = {
  id: string;
  type: string;
  name: string;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  accountId?: string;
  error?: string;
};

export type SkillRecord = {
  id: string;
  slug?: string;
  name: string;
  description: string;
  enabled: boolean;
  version?: string;
  author?: string;
  source?: string;
  baseDir?: string;
  filePath?: string;
};

export type MarketplaceSkill = {
  slug: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  downloads?: number;
  stars?: number;
};

export type CronJob = {
  id: string;
  name: string;
  message: string;
  schedule: string | { kind: string; expr?: string; everyMs?: number; at?: string; tz?: string };
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  nextRun?: string;
  lastRun?: {
    time: string;
    success: boolean;
    error?: string;
    duration?: number;
  };
};

export type UsageHistoryEntry = {
  timestamp: string;
  sessionId: string;
  agentId: string;
  model?: string;
  provider?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  costUsd?: number;
};

export type ChatSession = {
  key: string;
  label?: string;
  displayName?: string;
  model?: string;
  updatedAt?: number;
};

export type RawMessage = {
  role: 'user' | 'assistant' | 'system' | 'toolresult';
  content: unknown;
  timestamp?: number;
  id?: string;
  isError?: boolean;
  _attachedFiles?: Array<{
    fileName: string;
    mimeType: string;
    fileSize: number;
    stagedPath?: string;
    preview?: string | null;
  }>;
};

export type StagedFile = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  stagedPath: string;
  preview?: string | null;
};

export type SettingsPayload = {
  theme?: 'light' | 'dark' | 'system';
  language?: string;
  startMinimized?: boolean;
  launchAtStartup?: boolean;
  telemetryEnabled?: boolean;
  gatewayAutoStart?: boolean;
  gatewayPort?: number;
  proxyEnabled?: boolean;
  proxyServer?: string;
  proxyHttpServer?: string;
  proxyHttpsServer?: string;
  proxyAllServer?: string;
  proxyBypassRules?: string;
  updateChannel?: 'stable' | 'beta' | 'dev';
  autoCheckUpdate?: boolean;
  autoDownloadUpdate?: boolean;
  sidebarCollapsed?: boolean;
  devModeUnlocked?: boolean;
  setupComplete?: boolean;
};

export type RpcEnvelope<T> = {
  success: boolean;
  result?: T;
  error?: string;
};
