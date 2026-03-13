import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  getGatewayStatus,
  getLogs,
  restartGateway,
  runDoctor,
  startGateway,
  stopGateway,
} from '../lib/device-api';
import { formatGatewayState, formatTime, safePretty } from '../lib/format';
import type { DeviceProfile, GatewayStatus } from '../lib/types';

export function DevicePage(props: {
  device: DeviceProfile;
  onForgetDevice: () => void;
}) {
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(null);
  const [logs, setLogs] = useState('');
  const [doctorOutput, setDoctorOutput] = useState('');

  const load = async () => {
    const [nextGateway, nextLogs] = await Promise.all([
      getGatewayStatus(),
      getLogs(),
    ]);
    setGatewayStatus(nextGateway);
    setLogs(nextLogs.content);
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
              <h2>当前设备</h2>
              <p>这里集中显示配对状态和设备入口，不再放在左侧导航底部。</p>
            </div>
          </div>
          <div className="field">
            <label>设备名称</label>
            <input value={props.device.name} readOnly />
          </div>
          <div className="field">
            <label>设备地址</label>
            <input value={props.device.baseUrl} readOnly />
          </div>
          <div className="field">
            <label>配对时间</label>
            <input value={formatTime(props.device.pairedAt)} readOnly />
          </div>
          <div className="cluster">
            <button className="button danger" onClick={props.onForgetDevice}>
              解除当前配对
            </button>
          </div>
        </div>

        <div className="form-card panel">
          <div className="section-title">
            <div>
              <h2>网关控制</h2>
              <p>管理 OpenClaw 网关进程和诊断能力。</p>
            </div>
          </div>
          <div className="chip-row">
            <span className={`chip ${gatewayStatus?.state === 'running' ? 'ok' : 'warn'}`}>{formatGatewayState(gatewayStatus?.state)}</span>
            <span className="chip">端口 {gatewayStatus?.port || '暂无'}</span>
            <span className="chip">PID {gatewayStatus?.pid || '暂无'}</span>
          </div>
          <div className="cluster">
            <button className="button subtle" onClick={() => void startGateway().then(load)}>启动</button>
            <button className="button ghost" onClick={() => void restartGateway().then(load)}>重启</button>
            <button className="button danger" onClick={() => void stopGateway().then(load)}>停止</button>
          </div>
          <div className="cluster">
            <button
              className="button subtle"
              onClick={() =>
                void runDoctor('diagnose').then((result) => {
                  setDoctorOutput(safePretty(result));
                  toast.success('诊断完成');
                })
              }
            >
              运行诊断
            </button>
            <button
              className="button ghost"
              onClick={() =>
                void runDoctor('fix').then((result) => {
                  setDoctorOutput(safePretty(result));
                  toast.success('自动修复已执行');
                })
              }
            >
              运行自动修复
            </button>
          </div>
          {doctorOutput ? (
            <div className="field">
              <label>诊断输出</label>
              <textarea value={doctorOutput} readOnly />
            </div>
          ) : null}
        </div>
      </section>

      <section className="list-card panel">
        <div className="section-title">
          <div>
            <h2>最近日志</h2>
            <p>查看设备桥接层和网关的近期输出。</p>
          </div>
          <button className="button ghost" onClick={() => void load()}>
            刷新日志
          </button>
        </div>
        <div className="field">
          <textarea value={logs} readOnly style={{ minHeight: 320 }} />
        </div>
      </section>
    </>
  );
}
