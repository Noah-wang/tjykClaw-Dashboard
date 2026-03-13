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
import type { AgentSummary, AgentsSnapshot } from '../lib/types';

export function AgentsPage() {
  const [snapshot, setSnapshot] = useState<AgentsSnapshot | null>(null);
  const [newAgentName, setNewAgentName] = useState('');
  const [channelDrafts, setChannelDrafts] = useState<Record<string, string>>({});

  const load = async () => {
    const next = await getAgents();
    setSnapshot(next);
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async () => {
    if (!newAgentName.trim()) return;
    const next = await createAgent(newAgentName.trim());
    setSnapshot(next);
    setNewAgentName('');
    toast.success('智能体已创建');
  };

  const handleRename = async (agent: AgentSummary, name: string) => {
    const next = await renameAgent(agent.id, name);
    setSnapshot(next);
    toast.success('智能体名称已更新');
  };

  const handleDelete = async (agentId: string) => {
    const next = await deleteAgent(agentId);
    setSnapshot(next);
    toast.success('智能体已删除');
  };

  const handleAssign = async (agentId: string) => {
    const channelType = channelDrafts[agentId];
    if (!channelType) return;
    const next = await assignAgentChannel(agentId, channelType);
    setSnapshot(next);
    toast.success('渠道已绑定');
  };

  const handleRemoveBinding = async (agentId: string, channelType: string) => {
    const next = await removeAgentChannel(agentId, channelType);
    setSnapshot(next);
    toast.success('渠道已解绑');
  };

  return (
    <>
      <section className="form-card panel">
        <div className="section-title">
          <div>
            <h2>创建智能体</h2>
            <p>每个新智能体都会拥有自己的工作目录和会话命名空间。</p>
          </div>
        </div>
        <div className="cluster">
          <input
            style={{ flex: 1, minWidth: 240 }}
            value={newAgentName}
            onChange={(event) => setNewAgentName(event.target.value)}
            placeholder="研究助手"
          />
          <button className="button primary" onClick={() => void handleCreate()}>
            新增智能体
          </button>
          <button className="button ghost" onClick={() => void load()}>
            刷新
          </button>
        </div>
      </section>

      <section className="stack">
        {(snapshot?.agents || []).map((agent) => (
          <div className="list-card panel" key={agent.id}>
            <div className="section-title">
              <div>
                <h2>{agent.name}</h2>
                <p>{agent.modelDisplay} · {agent.workspace}</p>
              </div>
              <div className="chip-row">
                {agent.isDefault ? <span className="chip ok">默认</span> : null}
                <span className="chip">会话 {agent.mainSessionKey}</span>
              </div>
            </div>

            <div className="grid-2">
              <div className="field">
                <label>重命名智能体</label>
                <input
                  defaultValue={agent.name}
                  onBlur={(event) => {
                    const value = event.target.value.trim();
                    if (value && value !== agent.name) {
                      void handleRename(agent, value);
                    }
                  }}
                />
              </div>

              <div className="field">
                <label>绑定渠道</label>
                <div className="cluster">
                  <select
                    value={channelDrafts[agent.id] || ''}
                    onChange={(event) => setChannelDrafts((current) => ({
                      ...current,
                      [agent.id]: event.target.value,
                    }))}
                  >
                    <option value="">请选择渠道类型</option>
                    {listKnownChannelTypes().map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                  <button className="button subtle" onClick={() => void handleAssign(agent.id)}>
                    绑定
                  </button>
                </div>
              </div>
            </div>

            <div className="chip-row">
              {agent.channelTypes.length === 0 ? <span className="chip">暂无渠道绑定</span> : null}
              {agent.channelTypes.map((channelType) => (
                <button
                  className="chip"
                  key={`${agent.id}-${channelType}`}
                  onClick={() => void handleRemoveBinding(agent.id, channelType)}
                >
                  {channelType} ×
                </button>
              ))}
            </div>

            {!agent.isDefault ? (
              <div className="cluster">
                <button className="button danger" onClick={() => void handleDelete(agent.id)}>
                  删除智能体
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </section>
    </>
  );
}
