import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  deleteChannel,
  getChannelConfig,
  getChannels,
  listKnownChannelTypes,
  saveChannelConfig,
  setChannelEnabled,
} from '../lib/device-api';
import { formatGatewayState } from '../lib/format';
import type { ChannelRecord } from '../lib/types';

export function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelRecord[]>([]);
  const [selectedType, setSelectedType] = useState('telegram');
  const [configText, setConfigText] = useState('{\n  "botToken": "",\n  "allowedUsers": ""\n}');
  const [accountId, setAccountId] = useState('');

  const load = async () => {
    setChannels(await getChannels());
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const config = await getChannelConfig(selectedType, accountId || undefined);
        setConfigText(JSON.stringify(config, null, 2));
      } catch {
        setConfigText('{\n}');
      }
    })();
  }, [selectedType, accountId]);

  const knownTypes = useMemo(() => listKnownChannelTypes(), []);

  const handleSave = async () => {
    const parsed = JSON.parse(configText) as Record<string, unknown>;
    await saveChannelConfig(selectedType, parsed, accountId || undefined);
    toast.success('渠道配置已保存');
    await load();
  };

  return (
    <>
      <section className="split">
        <div className="list-card panel">
          <div className="section-title">
            <div>
              <h2>已配置渠道</h2>
              <p>有网关状态时会优先显示实时状态。</p>
            </div>
          </div>
          <div className="chat-list">
            {channels.map((channel) => (
              <button
                className={`selectable-row ${selectedType === channel.type ? 'active' : ''}`}
                key={channel.id}
                onClick={() => {
                  setSelectedType(channel.type);
                  setAccountId(channel.accountId || '');
                }}
              >
                <strong>{channel.name}</strong>
                <div className="chip-row">
                  <span className={`chip ${channel.status === 'connected' ? 'ok' : channel.status === 'error' ? 'danger' : 'warn'}`}>
                    {formatGatewayState(channel.status)}
                  </span>
                  <span className="chip">{channel.type}</span>
                </div>
                {channel.error ? <span className="muted">{channel.error}</span> : null}
              </button>
            ))}
          </div>
        </div>

        <div className="form-card panel">
          <div className="section-title">
            <div>
              <h2>渠道编辑器</h2>
              <p>读取现有配置，修改原始 JSON 后直接保存回设备。</p>
            </div>
          </div>

          <div className="grid-2">
            <div className="field">
              <label>渠道类型</label>
              <select value={selectedType} onChange={(event) => setSelectedType(event.target.value)}>
                {knownTypes.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>账号 ID（可选）</label>
              <input value={accountId} onChange={(event) => setAccountId(event.target.value)} />
            </div>
          </div>

          <div className="field">
              <label>配置 JSON</label>
            <textarea value={configText} onChange={(event) => setConfigText(event.target.value)} />
          </div>

          <div className="cluster">
            <button className="button primary" onClick={() => void handleSave()}>
              保存配置
            </button>
            <button className="button subtle" onClick={() => void setChannelEnabled(selectedType, true).then(load)}>
              启用
            </button>
            <button className="button ghost" onClick={() => void setChannelEnabled(selectedType, false).then(load)}>
              禁用
            </button>
            <button className="button danger" onClick={() => void deleteChannel(selectedType).then(load)}>
              删除
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
