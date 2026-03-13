import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  getSettings,
  updateSettings,
} from '../lib/device-api';
import type { SettingsPayload } from '../lib/types';

export function SettingsPage(props: {
  children?: ReactNode;
}) {
  const [settings, setSettings] = useState<SettingsPayload>({});

  const load = async () => {
    const nextSettings = await getSettings();
    setSettings(nextSettings);
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <>
      <section className="grid-2">
        <div className="form-card panel">
          <div className="section-title">
            <div>
              <h2>通用设置</h2>
              <p>直接更新与当前桌面端一致的设置存储。</p>
            </div>
          </div>

          <div className="grid-2">
            <div className="field">
              <label>主题</label>
              <select
                value={settings.theme || 'system'}
                onChange={(event) => setSettings({ ...settings, theme: event.target.value as SettingsPayload['theme'] })}
              >
                <option value="system">跟随系统</option>
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
            </div>
            <div className="field">
              <label>语言</label>
              <input value={settings.language || 'zh'} onChange={(event) => setSettings({ ...settings, language: event.target.value })} />
            </div>
          </div>

          <div className="grid-2">
            <div className="field">
              <label>网关端口</label>
              <input
                type="number"
                value={settings.gatewayPort || 18789}
                onChange={(event) => setSettings({ ...settings, gatewayPort: Number(event.target.value) })}
              />
            </div>
            <div className="field">
              <label>代理服务器</label>
              <input
                value={settings.proxyServer || ''}
                onChange={(event) => setSettings({ ...settings, proxyServer: event.target.value })}
              />
            </div>
          </div>

          <div className="cluster">
            <button className="button primary" onClick={() => void updateSettings(settings).then(() => toast.success('设置已保存'))}>
              保存设置
            </button>
            <button className="button ghost" onClick={() => void load()}>
              重新读取
            </button>
          </div>
        </div>
      </section>

      {props.children}
    </>
  );
}
