import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  getBackupConfig,
  getSettings,
  updateBackupConfig,
  updateSettings,
} from '../lib/device-api';
import type { BackupConfig, SettingsPayload } from '../lib/types';

export function SettingsPage(props: {
  children?: ReactNode;
}) {
  const [settings, setSettings] = useState<SettingsPayload>({});
  const [backupConfig, setBackupConfig] = useState<BackupConfig>({
    enabled: false,
    schedule: 'daily',
    retentionCount: 7,
    includeSessions: true,
    includeStorage: true,
    rootDir: '',
    preRestoreSnapshot: true,
  });

  const load = async () => {
    const [nextSettings, nextBackupConfig] = await Promise.all([
      getSettings(),
      getBackupConfig(),
    ]);
    setSettings(nextSettings);
    setBackupConfig(nextBackupConfig);
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

        <div className="form-card panel">
          <div className="section-title">
            <div>
              <h2>备份策略</h2>
              <p>这里控制自动备份和恢复前保护快照。完整业务数据默认覆盖 `~/.openclaw` 和 `~/.tjykclaw-dashboard-bridge`，文件库则来自 `~/.tjykclaw-storage`。</p>
            </div>
          </div>

          <div className="grid-2">
            <div className="field">
              <label>自动备份</label>
              <select
                value={backupConfig.enabled ? 'enabled' : 'disabled'}
                onChange={(event) => setBackupConfig({ ...backupConfig, enabled: event.target.value === 'enabled' })}
              >
                <option value="disabled">关闭</option>
                <option value="enabled">开启</option>
              </select>
            </div>
            <div className="field">
              <label>备份频率</label>
              <select
                value={backupConfig.schedule}
                onChange={(event) => setBackupConfig({ ...backupConfig, schedule: event.target.value })}
              >
                <option value="daily">每天</option>
                <option value="hourly">每小时</option>
                <option value="manual">仅手动</option>
              </select>
            </div>
          </div>

          <div className="grid-2">
            <div className="field">
              <label>保留份数</label>
              <input
                type="number"
                min={1}
                value={backupConfig.retentionCount}
                onChange={(event) => setBackupConfig({ ...backupConfig, retentionCount: Number(event.target.value) || 1 })}
              />
            </div>
            <div className="field">
              <label>恢复前保护快照</label>
              <select
                value={backupConfig.preRestoreSnapshot ? 'yes' : 'no'}
                onChange={(event) => setBackupConfig({ ...backupConfig, preRestoreSnapshot: event.target.value === 'yes' })}
              >
                <option value="yes">开启</option>
                <option value="no">关闭</option>
              </select>
            </div>
          </div>

          <div className="grid-2">
            <div className="field">
              <label>包含聊天记录</label>
              <select
                value={backupConfig.includeSessions ? 'yes' : 'no'}
                onChange={(event) => setBackupConfig({ ...backupConfig, includeSessions: event.target.value === 'yes' })}
              >
                <option value="yes">包含</option>
                <option value="no">不包含</option>
              </select>
            </div>
            <div className="field">
              <label>包含文件存储区</label>
              <select
                value={backupConfig.includeStorage ? 'yes' : 'no'}
                onChange={(event) => setBackupConfig({ ...backupConfig, includeStorage: event.target.value === 'yes' })}
              >
                <option value="yes">包含</option>
                <option value="no">不包含</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label>备份目录</label>
            <input
              value={backupConfig.rootDir}
              onChange={(event) => setBackupConfig({ ...backupConfig, rootDir: event.target.value })}
            />
          </div>

          <div className="notice">
            建议保持“包含文件存储区”为开启，这样上传文件和资料库内容都会跟随备份恢复。
            <br />
            <span className="mono">~/.openclaw</span>
            <br />
            <span className="mono">~/.tjykclaw-dashboard-bridge</span>
            <br />
            <span className="mono">~/.tjykclaw-storage</span>
          </div>

          <div className="cluster">
            <button
              className="button primary"
              onClick={() =>
                void updateBackupConfig(backupConfig).then((next) => {
                  setBackupConfig(next);
                  toast.success('备份策略已保存');
                })
              }
            >
              保存备份策略
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
