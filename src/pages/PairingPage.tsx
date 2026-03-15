import { Cpu, Network, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { DeviceProfile } from '../lib/types';

function defaultDeviceUrl(): string {
  if (typeof window === 'undefined') return 'http://192.168.1.20:3210';
  if (!/^https?:$/i.test(window.location.protocol)) return 'http://192.168.1.20:3210';
  return window.location.origin;
}

export function PairingPage(props: {
  onPair: (profile: DeviceProfile) => Promise<void>;
}) {
  const [name, setName] = useState('天玑云科Claw 节点');
  const [baseUrl, setBaseUrl] = useState(() => defaultDeviceUrl());
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await props.onPair({
        name: name.trim() || '天玑云科Claw 节点',
        baseUrl,
        pairedAt: new Date().toISOString(),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pairing-screen">
      <div className="pairing-shell">
        <section className="pairing-hero panel">
          <div className="stack">
            <div className="eyebrow">配对一次，局域网内随时控制</div>
            <h1>让你的 AI 设备直接拥有网页控制台。</h1>
            <p>
              `tjykClaw-Dashboard` 面向同一 Wi‑Fi 下的独立设备。只要填入设备地址，
              就可以在浏览器里统一管理角色、外部接入、技能、自动任务和聊天内容。
            </p>
          </div>

          <div className="pairing-meta">
            <div className="panel">
              <div className="eyebrow"><Network size={14} /> 同一网络</div>
              <p className="stat-note">连接设备在局域网内暴露的 IP 或主机名。</p>
            </div>
            <div className="panel">
              <div className="eyebrow"><Cpu size={14} /> 设备承载</div>
              <p className="stat-note">核心能力都跑在硬件上，浏览器只负责查看和操作。</p>
            </div>
            <div className="panel">
              <div className="eyebrow"><ShieldCheck size={14} /> 配对记录</div>
              <p className="stat-note">本地会记住设备信息，下次可以直接连回去。</p>
            </div>
          </div>
        </section>

        <form className="pairing-card panel" onSubmit={handleSubmit}>
          <div className="section-title">
            <div>
              <h2>配对设备</h2>
              <p>填写设备地址，格式一般为 `http://设备IP:3210`。</p>
            </div>
          </div>

          <div className="field">
            <label htmlFor="device-name">设备名称</label>
            <input
              id="device-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="客厅设备"
            />
          </div>

          <div className="field">
            <label htmlFor="device-url">设备地址</label>
            <input
              id="device-url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="http://192.168.1.20:3210"
            />
          </div>

          <div className="notice warn">
            页面已经准备好。若要真正通过局域网访问，设备需要在上面的地址正常提供服务。
          </div>

          <div className="cluster">
            <button className="button primary" disabled={saving} type="submit">
              {saving ? '正在检查设备...' : '配对并进入控制台'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
