import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  assignAgentChannel,
  createAgent,
  deleteAgent,
  getAgents,
  listKnownChannelTypes,
  removeAgentChannel,
  renameAgent,
} from '../lib/device-api';
import { ROLE_PRESETS, findRolePreset } from '../lib/role-presets';
import type { AgentSummary, AgentsSnapshot } from '../lib/types';

function getRoleBadge(name: string): string {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '角';
  return Array.from(trimmed)[0].toUpperCase();
}

export function AgentsPage() {
  const [snapshot, setSnapshot] = useState<AgentsSnapshot | null>(null);
  const [newAgentName, setNewAgentName] = useState('');
  const [channelDrafts, setChannelDrafts] = useState<Record<string, string>>({});
  const [loadingSnapshot, setLoadingSnapshot] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const load = async () => {
    setLoadingSnapshot(true);
    try {
      const next = await getAgents();
      setSnapshot(next);
    } finally {
      setLoadingSnapshot(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async () => {
    if (!newAgentName.trim()) return;
    setBusyAction('create');
    try {
      const next = await createAgent(newAgentName.trim());
      setSnapshot(next);
      setNewAgentName('');
      toast.success('角色已创建');
    } finally {
      setBusyAction(null);
    }
  };

  const handleRename = async (agent: AgentSummary, name: string) => {
    setBusyAction(`rename:${agent.id}`);
    try {
      const next = await renameAgent(agent.id, name);
      setSnapshot(next);
      toast.success('角色名称已更新');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDelete = async (agentId: string) => {
    setBusyAction(`delete:${agentId}`);
    try {
      const next = await deleteAgent(agentId);
      setSnapshot(next);
      toast.success('角色已删除');
    } finally {
      setBusyAction(null);
    }
  };

  const handleAssign = async (agentId: string) => {
    const channelType = channelDrafts[agentId];
    if (!channelType) return;
    setBusyAction(`assign:${agentId}`);
    try {
      const next = await assignAgentChannel(agentId, channelType);
      setSnapshot(next);
      toast.success('外部接入已添加');
    } finally {
      setBusyAction(null);
    }
  };

  const handleRemoveBinding = async (agentId: string, channelType: string) => {
    setBusyAction(`unbind:${agentId}:${channelType}`);
    try {
      const next = await removeAgentChannel(agentId, channelType);
      setSnapshot(next);
      toast.success('外部接入已移除');
    } finally {
      setBusyAction(null);
    }
  };

  const existingRoleNames = new Set((snapshot?.agents || []).map((agent) => agent.name.trim()));
  const roleCount = snapshot?.agents.length || 0;
  const locked = busyAction !== null;

  return (
    <>
      <section className="form-card panel">
          <div className="section-title">
            <div>
              <h2>预设角色</h2>
              <p>先选一个常用角色模板，一键加入到当前设备。已添加 {existingRoleNames.size} / {ROLE_PRESETS.length} 个。</p>
            </div>
          </div>
        <div className="role-preset-grid">
          {ROLE_PRESETS.map((preset) => {
            const exists = existingRoleNames.has(preset.name);
            return (
              <article className="role-preset-card" key={preset.id}>
                <div className="role-avatar" aria-hidden="true">{getRoleBadge(preset.name)}</div>
                <div className="role-preset-copy">
                  <strong>{preset.name}</strong>
                  <p>{preset.description}</p>
                </div>
                <button
                  className={`button ${exists ? 'ghost' : 'primary'}`}
                  disabled={exists || locked}
                  onClick={() => {
                    setBusyAction(`preset:${preset.id}`);
                    void createAgent(preset.name)
                      .then((next) => {
                        setSnapshot(next);
                        toast.success('角色已加入');
                      })
                      .finally(() => setBusyAction(null));
                  }}
                >
                  {exists ? '已添加' : busyAction === `preset:${preset.id}` ? '添加中...' : '添加角色'}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="form-card panel">
          <div className="section-title">
            <div>
              <h2>创建角色</h2>
              <p>每个角色都会拥有自己的专属聊天、模型选择和资料空间。当前共 {roleCount} 个角色。</p>
            </div>
          </div>
        <div className="cluster">
          <input
            style={{ flex: 1, minWidth: 240 }}
            value={newAgentName}
            onChange={(event) => setNewAgentName(event.target.value)}
            placeholder="例如：资料助手"
            disabled={locked}
          />
          <button className="button primary" disabled={locked || !newAgentName.trim()} onClick={() => void handleCreate()}>
            {busyAction === 'create' ? '新增中...' : '新增角色'}
          </button>
          <button className="button ghost" disabled={locked || loadingSnapshot} onClick={() => void load()}>
            {loadingSnapshot ? '正在加载...' : '刷新'}
          </button>
        </div>
      </section>

      <section className="stack">
        {loadingSnapshot && !snapshot ? <div className="empty">正在加载角色...</div> : null}
        {(snapshot?.agents || []).map((agent) => (
          <div className="list-card panel" key={agent.id}>
            <div className="section-title">
              <div className="role-summary">
                <div className="role-avatar" aria-hidden="true">{getRoleBadge(agent.name)}</div>
                <div>
                  <h2>{agent.name}</h2>
                  <p>{findRolePreset(agent.name)?.description || `${agent.modelDisplay} · 资料空间 ${agent.workspace}`}</p>
                </div>
              </div>
              <div className="chip-row">
                {agent.isDefault ? <span className="chip ok">默认</span> : null}
                <span className="chip">专属聊天已准备好</span>
              </div>
            </div>

            <div className="grid-2">
              <div className="field">
                <label>角色名称</label>
                <input
                  defaultValue={agent.name}
                  disabled={locked}
                  onBlur={(event) => {
                    const value = event.target.value.trim();
                    if (value && value !== agent.name) {
                      void handleRename(agent, value);
                    }
                  }}
                />
              </div>

              <div className="field">
                <label>接收消息方式</label>
                <div className="cluster">
                  <select
                    value={channelDrafts[agent.id] || ''}
                    onChange={(event) => setChannelDrafts((current) => ({
                      ...current,
                      [agent.id]: event.target.value,
                    }))}
                  >
                    <option value="">请选择接收方式</option>
                    {listKnownChannelTypes().map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                  <button className="button subtle" disabled={locked || !channelDrafts[agent.id]} onClick={() => void handleAssign(agent.id)}>
                    {busyAction === `assign:${agent.id}` ? '添加中...' : '添加'}
                  </button>
                </div>
              </div>
            </div>

            <div className="chip-row">
              {agent.channelTypes.length === 0 ? <span className="chip">暂未添加外部消息入口</span> : null}
              {agent.channelTypes.map((channelType) => (
                <button
                  className="chip"
                  key={`${agent.id}-${channelType}`}
                  disabled={locked}
                  onClick={() => void handleRemoveBinding(agent.id, channelType)}
                >
                  {busyAction === `unbind:${agent.id}:${channelType}` ? `正在移除 ${channelType}...` : `${channelType} ×`}
                </button>
              ))}
            </div>

            {!agent.isDefault ? (
              <div className="cluster">
                <button className="button danger" disabled={locked} onClick={() => void handleDelete(agent.id)}>
                  {busyAction === `delete:${agent.id}` ? '删除中...' : '删除角色'}
                </button>
              </div>
            ) : null}
          </div>
        ))}
        {!loadingSnapshot && roleCount === 0 ? <div className="empty">这里还没有角色。</div> : null}
      </section>
    </>
  );
}
