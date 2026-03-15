import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  createProviderAccount,
  deleteProviderAccount,
  getProviderVendors,
  getProviders,
  getUsageHistory,
  setDefaultProviderAccount,
} from '../lib/device-api';
import { formatCurrency, formatTime, formatTokens } from '../lib/format';
import { createId } from '../lib/id';
import type { ProviderAccount, ProviderVendor, UsageHistoryEntry } from '../lib/types';

function applyVendorDefaults(input: ProviderAccount, vendors: ProviderVendor[]): ProviderAccount {
  const vendor = vendors.find((entry) => entry.id === input.vendorId);
  return {
    ...input,
    label: input.label || vendor?.name || '新模型来源',
    authMode: vendor?.defaultAuthMode || 'api_key',
    apiProtocol:
      vendor?.id === 'anthropic'
        ? 'anthropic-messages'
        : vendor?.id === 'openai'
          ? 'openai-responses'
          : input.apiProtocol || 'openai-responses',
    baseUrl: vendor?.defaultBaseUrl || input.baseUrl,
  };
}

function createDraft(vendors: ProviderVendor[]): ProviderAccount {
  const vendor = vendors[0];
  return {
    id: createId(),
    vendorId: vendor?.id || 'openai',
    label: vendor?.name || '新模型来源',
    authMode: vendor?.defaultAuthMode || 'api_key',
    apiProtocol: 'openai-responses',
    baseUrl: vendor?.defaultBaseUrl,
    model: '',
    enabled: true,
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function createOllamaDraft(vendors: ProviderVendor[]): ProviderAccount {
  const vendor = vendors.find((entry) => entry.id === 'ollama');
  return {
    id: createId(),
    vendorId: 'ollama',
    label: '本地 Ollama',
    authMode: 'local',
    apiProtocol: 'openai-responses',
    baseUrl: vendor?.defaultBaseUrl || 'http://127.0.0.1:11434',
    model: '',
    enabled: true,
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function ProvidersPage() {
  const [vendors, setVendors] = useState<ProviderVendor[]>([]);
  const [accounts, setAccounts] = useState<ProviderAccount[]>([]);
  const [draft, setDraft] = useState<ProviderAccount | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [usageEntries, setUsageEntries] = useState<UsageHistoryEntry[]>([]);
  const [setupMode, setSetupMode] = useState<'network' | 'local'>('network');
  const [loadingData, setLoadingData] = useState(true);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const load = async () => {
    setLoadingData(true);
    try {
      const [nextVendors, nextAccounts] = await Promise.all([getProviderVendors(), getProviders()]);
      const vendorList = Array.isArray(nextVendors) ? nextVendors : [];
      const accountList = Array.isArray(nextAccounts) ? nextAccounts : [];
      setVendors(vendorList);
      setAccounts(accountList);
      setDraft((current) => current || (setupMode === 'local' ? createOllamaDraft(vendorList) : createDraft(vendorList)));
      setLoadingError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLoadingError(message);
      setVendors([]);
      setAccounts([]);
      setDraft((current) => current || (setupMode === 'local' ? createOllamaDraft([]) : createDraft([])));
      toast.error(`读取模型来源失败：${message}`);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadUsage = async () => {
      setLoadingUsage(true);
      try {
        const next = await getUsageHistory();
        if (!cancelled) setUsageEntries(next);
      } finally {
        if (!cancelled) setLoadingUsage(false);
      }
    };

    void load();
    void loadUsage();
    const timer = window.setInterval(() => {
      void loadUsage();
    }, 8000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    setApiKey('');
    setDraft(setupMode === 'local' ? createOllamaDraft(vendors) : createDraft(vendors.filter((vendor) => vendor.id !== 'ollama')));
  }, [setupMode, vendors]);

  const usageGrouped = useMemo(() => {
    const map = new Map<string, { tokens: number; cost: number; calls: number }>();
    usageEntries.forEach((entry) => {
      const key = `${entry.provider || '未知来源'} / ${entry.model || '未知模型'}`;
      const current = map.get(key) || { tokens: 0, cost: 0, calls: 0 };
      current.tokens += entry.totalTokens;
      current.cost += entry.costUsd || 0;
      current.calls += 1;
      map.set(key, current);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].tokens - a[1].tokens);
  }, [usageEntries]);

  const selectedVendor = useMemo(
    () => vendors.find((vendor) => vendor.id === draft?.vendorId) || null,
    [draft?.vendorId, vendors],
  );
  const hasAccounts = accounts.length > 0;
  const isLocalMode = draft?.vendorId === 'ollama' || setupMode === 'local';
  const locked = busyAction !== null;

  const handleSave = async () => {
    if (!draft) return;
    const payload = applyVendorDefaults({
      ...draft,
      updatedAt: new Date().toISOString(),
    }, vendors);
    setBusyAction('create');
    try {
      await createProviderAccount(payload, apiKey || undefined);
      toast.success('模型已添加');
      setApiKey('');
      setDraft(setupMode === 'local' ? createOllamaDraft(vendors) : createDraft(vendors.filter((vendor) => vendor.id !== 'ollama')));
      await load();
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <>
      <section className="grid-2">
        <div className="list-card panel">
          <div className="section-title">
            <div>
              <h2>模型列表</h2>
              <p>这里显示当前已经能用的模型来源。当前共 {accounts.length} 个。</p>
            </div>
          </div>
          <div className="chat-list">
            {loadingError ? <div className="notice danger">{loadingError}</div> : null}
            {loadingData ? <div className="empty">正在加载模型...</div> : null}
            {accounts.map((account) => (
              <div className="selectable-row" key={account.id}>
                <strong>{account.label}</strong>
                <div className="muted">{account.vendorId}</div>
                <div className="chip-row">
                  {account.isDefault ? <span className="chip ok">默认</span> : null}
                  {account.model ? <span className="chip">{account.model}</span> : null}
                </div>
                <div className="muted">更新时间：{formatTime(account.updatedAt)}</div>
                <div className="cluster">
                  {!account.isDefault ? (
                    <button
                      className="button subtle"
                      disabled={locked}
                      onClick={() => {
                        setBusyAction(`default:${account.id}`);
                        void setDefaultProviderAccount(account.id)
                          .then(load)
                          .finally(() => setBusyAction(null));
                      }}
                    >
                      {busyAction === `default:${account.id}` ? '设置中...' : '设为默认'}
                    </button>
                  ) : null}
                  <button
                    className="button danger"
                    disabled={locked}
                    onClick={() => {
                      setBusyAction(`delete:${account.id}`);
                      void deleteProviderAccount(account.id)
                        .then(load)
                        .finally(() => setBusyAction(null));
                    }}
                  >
                    {busyAction === `delete:${account.id}` ? '删除中...' : '删除'}
                  </button>
                </div>
              </div>
            ))}
            {!loadingData && !loadingError && !hasAccounts ? <div className="empty">这里还没有模型。</div> : null}
          </div>
        </div>

        <div className="form-card panel">
          <div className="section-title">
            <div>
              <h2>创建账号</h2>
              <p>这里直接添加新模型。写错了就删除重建，不再提供编辑。</p>
            </div>
          </div>
          {draft ? (
            <>
              <div className="grid-2">
                <div className="field">
                  <label>使用方式</label>
                  <div className="cluster">
                    <button
                      className={`button ${setupMode === 'network' ? 'primary' : 'ghost'}`}
                      disabled={locked}
                      onClick={() => setSetupMode('network')}
                    >
                      联网模型
                    </button>
                    <button
                      className={`button ${setupMode === 'local' ? 'primary' : 'ghost'}`}
                      disabled={locked}
                      onClick={() => setSetupMode('local')}
                    >
                      本地 Ollama
                    </button>
                  </div>
                </div>
                <div className="field">
                  <label>显示名称</label>
                  <input
                    value={draft.label}
                    disabled={locked}
                    onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                  />
                </div>
              </div>

              <div className="grid-2">
                {!isLocalMode ? (
                  <div className="field">
                    <label>模型来源</label>
                    <select
                      value={draft.vendorId}
                      disabled={locked}
                      onChange={(event) => {
                        const next = applyVendorDefaults(
                          {
                            ...draft,
                            vendorId: event.target.value,
                          },
                          vendors,
                        );
                        setDraft(next);
                      }}
                    >
                      {vendors.filter((vendor) => vendor.id !== 'ollama').map((vendor) => (
                        <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <div className="field">
                  <label>{isLocalMode ? '本地模型名' : '模型名'}</label>
                  <input
                    value={draft.model || ''}
                    disabled={locked}
                    onChange={(event) => setDraft({ ...draft, model: event.target.value })}
                    placeholder={isLocalMode ? '例如：qwen2.5:7b' : '例如：gpt-4.1-mini'}
                  />
                </div>
                {isLocalMode ? (
                  <div className="field">
                    <label>本地服务地址</label>
                    <input
                      value={draft.baseUrl || ''}
                      disabled={locked}
                      onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
                      placeholder="http://127.0.0.1:11434"
                    />
                  </div>
                ) : (
                  <div className="field">
                    <label>API Key</label>
                    <input
                      type="password"
                      value={apiKey}
                      disabled={locked}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder="输入密钥"
                    />
                  </div>
                )}
              </div>

              {selectedVendor ? (
                <div className="notice">
                  {isLocalMode
                    ? '本地模式：填入当前设备上已经下载好的模型名就能使用，地址默认就是本机 Ollama。'
                    : `联网模式：选好模型来源、模型和密钥就能开始使用。默认地址 ${selectedVendor.defaultBaseUrl || '会自动处理'}。`}
                </div>
              ) : null}

              {!hasAccounts ? (
                <div className="notice">
                  当前设备还没有配置任何模型。完成上面任意一种配置后，聊天和自动任务就能直接使用。
                </div>
              ) : null}

              <div className="cluster">
                <button className="button primary" disabled={locked || !draft.model?.trim()} onClick={() => void handleSave()}>
                  {busyAction === 'create' ? '创建中...' : '创建账号'}
                </button>
                <button
                  className="button ghost"
                  disabled={locked}
                  onClick={() => {
                    setApiKey('');
                    setDraft(setupMode === 'local' ? createOllamaDraft(vendors) : createDraft(vendors.filter((vendor) => vendor.id !== 'ollama')));
                  }}
                >
                  重置
                </button>
              </div>
            </>
          ) : (
            <div className="empty">正在读取模型信息…</div>
          )}
        </div>
      </section>

      <section className="grid-2">
        <div className="list-card panel">
          <div className="section-title">
            <div>
              <h2>模型用量汇总</h2>
              <p>把原来的模型页合并到这里，账号和成本放在一起看。当前共 {usageGrouped.length} 项。</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>模型</th>
                  <th>调用次数</th>
                  <th>Token</th>
                  <th>费用</th>
                </tr>
              </thead>
              <tbody>
                {loadingUsage ? (
                  <tr>
                    <td colSpan={4} className="muted">正在加载用量...</td>
                  </tr>
                ) : null}
                {usageGrouped.map(([label, summary]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td>{summary.calls}</td>
                    <td>{formatTokens(summary.tokens)}</td>
                    <td>{formatCurrency(summary.cost)}</td>
                  </tr>
                ))}
                {!loadingUsage && usageGrouped.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted">暂时还没有模型用量记录。</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="list-card panel">
          <div className="section-title">
            <div>
              <h2>最近模型记录</h2>
              <p>保留最近调用时间线，方便核对账号和模型是否命中。当前显示 {usageEntries.slice(0, 16).length} 条。</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>角色</th>
                  <th>模型</th>
                  <th>Token</th>
                </tr>
              </thead>
              <tbody>
                {loadingUsage ? (
                  <tr>
                    <td colSpan={4} className="muted">正在加载记录...</td>
                  </tr>
                ) : null}
                {usageEntries.slice(0, 16).map((entry) => (
                  <tr key={`${entry.sessionId}-${entry.timestamp}`}>
                    <td>{formatTime(entry.timestamp)}</td>
                    <td>{entry.agentId}</td>
                    <td>{entry.model || '暂无'}</td>
                    <td>{formatTokens(entry.totalTokens)}</td>
                  </tr>
                ))}
                {!loadingUsage && usageEntries.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted">还没有可展示的近期记录。</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
