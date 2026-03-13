import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  createProviderAccount,
  deleteProviderAccount,
  getProviderVendors,
  getProviders,
  getUsageHistory,
  setDefaultProviderAccount,
  updateProviderAccount,
} from '../lib/device-api';
import { formatCurrency, formatTime, formatTokens } from '../lib/format';
import { createId } from '../lib/id';
import type { ProviderAccount, ProviderVendor, UsageHistoryEntry } from '../lib/types';

function applyVendorDefaults(input: ProviderAccount, vendors: ProviderVendor[]): ProviderAccount {
  const vendor = vendors.find((entry) => entry.id === input.vendorId);
  return {
    ...input,
    label: input.label || vendor?.name || '新提供商',
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
    label: vendor?.name || '新提供商',
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

export function ProvidersPage() {
  const [vendors, setVendors] = useState<ProviderVendor[]>([]);
  const [accounts, setAccounts] = useState<ProviderAccount[]>([]);
  const [draft, setDraft] = useState<ProviderAccount | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [usageEntries, setUsageEntries] = useState<UsageHistoryEntry[]>([]);

  const load = async () => {
    try {
      const [nextVendors, nextAccounts] = await Promise.all([getProviderVendors(), getProviders()]);
      const vendorList = Array.isArray(nextVendors) ? nextVendors : [];
      const accountList = Array.isArray(nextAccounts) ? nextAccounts : [];
      setVendors(vendorList);
      setAccounts(accountList);
      setDraft((current) => current || createDraft(vendorList));
      setLoadingError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLoadingError(message);
      setVendors([]);
      setAccounts([]);
      setDraft((current) => current || createDraft([]));
      toast.error(`加载提供商失败：${message}`);
    }
  };

  useEffect(() => {
    void load();
    void getUsageHistory().then(setUsageEntries);
  }, []);

  const usageGrouped = useMemo(() => {
    const map = new Map<string, { tokens: number; cost: number; calls: number }>();
    usageEntries.forEach((entry) => {
      const key = `${entry.provider || '未知提供商'} / ${entry.model || '未知模型'}`;
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

  const handleSave = async () => {
    if (!draft) return;
    const payload = applyVendorDefaults({
      ...draft,
      updatedAt: new Date().toISOString(),
    }, vendors);
    if (editingId) {
      await updateProviderAccount(editingId, payload, apiKey || undefined);
      toast.success('提供商账号已更新');
    } else {
      await createProviderAccount(payload, apiKey || undefined);
      toast.success('提供商账号已创建');
    }
    setApiKey('');
    setEditingId(null);
    setDraft(createDraft(vendors));
    await load();
  };

  return (
    <>
      <section className="grid-2">
        <div className="list-card panel">
          <div className="section-title">
            <div>
              <h2>账号列表</h2>
              <p>设备当前已配置的提供商账号。</p>
            </div>
          </div>
          <div className="chat-list">
            {loadingError ? <div className="notice danger">{loadingError}</div> : null}
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
                  <button
                    className="button ghost"
                    onClick={() => {
                      setDraft(account);
                      setEditingId(account.id);
                      setApiKey('');
                    }}
                  >
                    编辑
                  </button>
                  {!account.isDefault ? (
                    <button className="button subtle" onClick={() => void setDefaultProviderAccount(account.id).then(load)}>
                      设为默认
                    </button>
                  ) : null}
                  <button className="button danger" onClick={() => void deleteProviderAccount(account.id).then(load)}>
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="form-card panel">
          <div className="section-title">
            <div>
              <h2>{editingId ? '编辑账号' : '创建账号'}</h2>
              <p>最小输入模式：提供商、显示名、模型名、API Key。</p>
            </div>
          </div>
          {draft ? (
            <>
              <div className="grid-2">
                <div className="field">
                  <label>提供商</label>
                  <select
                    value={draft.vendorId}
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
                    {vendors.map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>显示名称</label>
                  <input
                    value={draft.label}
                    onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                  />
                </div>
              </div>

              <div className="grid-2">
                <div className="field">
                  <label>模型名</label>
                  <input
                    value={draft.model || ''}
                    onChange={(event) => setDraft({ ...draft, model: event.target.value })}
                    placeholder="例如：gpt-4.1-mini"
                  />
                </div>
                <div className="field">
                  <label>API Key</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={editingId ? '留空表示不修改' : '输入提供商密钥'}
                  />
                </div>
              </div>

              {selectedVendor ? (
                <div className="notice">
                  自动配置：
                  提供商类型为 {selectedVendor.name}，
                  默认地址 {selectedVendor.defaultBaseUrl || '由运行时决定'}，
                  认证方式和协议按推荐值自动设置。
                </div>
              ) : null}

              <div className="cluster">
                <button className="button primary" onClick={() => void handleSave()}>
                  {editingId ? '更新账号' : '创建账号'}
                </button>
                <button
                  className="button ghost"
                  onClick={() => {
                    setEditingId(null);
                    setApiKey('');
                    setDraft(createDraft(vendors));
                  }}
                >
                  重置
                </button>
              </div>
            </>
          ) : (
            <div className="empty">正在加载提供商信息…</div>
          )}
        </div>
      </section>

      <section className="grid-2">
        <div className="list-card panel">
          <div className="section-title">
            <div>
              <h2>模型用量汇总</h2>
              <p>把原来的模型页合并到这里，账号和成本放在一起看。</p>
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
                {usageGrouped.map(([label, summary]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td>{summary.calls}</td>
                    <td>{formatTokens(summary.tokens)}</td>
                    <td>{formatCurrency(summary.cost)}</td>
                  </tr>
                ))}
                {usageGrouped.length === 0 ? (
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
              <p>保留最近调用时间线，方便核对账号和模型是否命中。</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>智能体</th>
                  <th>模型</th>
                  <th>Token</th>
                </tr>
              </thead>
              <tbody>
                {usageEntries.slice(0, 16).map((entry) => (
                  <tr key={`${entry.sessionId}-${entry.timestamp}`}>
                    <td>{formatTime(entry.timestamp)}</td>
                    <td>{entry.agentId}</td>
                    <td>{entry.model || '暂无'}</td>
                    <td>{formatTokens(entry.totalTokens)}</td>
                  </tr>
                ))}
                {usageEntries.length === 0 ? (
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
