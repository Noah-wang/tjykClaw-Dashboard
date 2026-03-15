export type DeviceProfile = {
  name: string;
  baseUrl: string;
  pairedAt: string;
};

export type LobsterDocumentSummary = {
  id: string;
  name: string;
  description: string;
  path: string;
  updatedAt?: string | null;
  size: number;
};

export type LobsterDocument = LobsterDocumentSummary & {
  content: string;
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

export type OverviewSnapshot = {
  agents: number;
  channels: number;
  skills: number;
  providers: number;
  jobs: number;
  usage: UsageHistoryEntry[];
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

export type UploadedFileRecord = {
  id: string;
  fileName: string;
  storedPath: string;
  fileSize: number;
  updatedAt: string;
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

export type BackupConfig = {
  enabled: boolean;
  schedule: 'manual' | 'hourly' | 'daily' | string;
  retentionCount: number;
  includeSessions: boolean;
  includeStorage: boolean;
  rootDir: string;
  preRestoreSnapshot: boolean;
};

export type BackupOperationResult = {
  success: boolean;
  snapshotId: string | null;
  message: string;
};

export type BackupStatus = {
  currentOperation: 'idle' | 'creating' | 'verifying' | 'restoring' | string;
  currentSnapshotId: string | null;
  message: string;
  lastBackupAt: string | null;
  lastRestoreAt: string | null;
  lastVerifiedAt: string | null;
  lastBackupResult: BackupOperationResult | null;
  lastRestoreResult: BackupOperationResult | null;
  lastVerificationResult: BackupOperationResult | null;
};

export type BackupSnapshot = {
  id: string;
  createdAt: string;
  type: 'manual' | 'scheduled' | 'pre_restore' | string;
  status: 'ready' | 'corrupt' | string;
  restorable: boolean;
  includes: string[];
  archiveName: string;
  archivePath: string;
  archiveSize: number;
  checksum: string;
  rootDir: string;
  note: string;
  openclawVersion: string | null;
  bridgeVersion: string | null;
  verifiedAt: string | null;
  lastVerificationOk: boolean | null;
  lastVerificationMessage: string;
  directory?: string;
};

export type RpcEnvelope<T> = {
  success: boolean;
  result?: T;
  error?: string;
};
