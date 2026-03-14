import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  getGatewayStatus,
  getLobsterDocument,
  getLobsterDocuments,
  getLogs,
  restartGateway,
  runDoctor,
  saveLobsterDocument,
  startGateway,
  stopGateway,
} from '../lib/device-api';
import { formatGatewayState, formatTime, safePretty } from '../lib/format';
import type { DeviceProfile, GatewayStatus, LobsterDocumentSummary } from '../lib/types';

export function DevicePage(props: {
  device: DeviceProfile;
  onForgetDevice: () => void;
}) {
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(null);
  const [logs, setLogs] = useState('');
  const [doctorOutput, setDoctorOutput] = useState('');
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [documents, setDocuments] = useState<LobsterDocumentSummary[]>([]);
  const [currentDocumentId, setCurrentDocumentId] = useState('soul');
  const [documentContent, setDocumentContent] = useState('');
  const [loadingDocument, setLoadingDocument] = useState(true);

  const loadStatus = async () => {
    const nextGateway = await getGatewayStatus();
    setGatewayStatus(nextGateway);
    setLoadingStatus(false);
  };

  const loadLogsOnly = async () => {
    const nextLogs = await getLogs();
    setLogs(nextLogs.content);
    setLoadingLogs(false);
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const nextGateway = await getGatewayStatus();
        if (!cancelled) {
          setGatewayStatus(nextGateway);
          setLoadingStatus(false);
        }
      } catch {
        if (!cancelled) setLoadingStatus(false);
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const items = await getLobsterDocuments();
      if (cancelled) return;
      setDocuments(items);
      if (!items.find((item) => item.id === currentDocumentId)) {
        setCurrentDocumentId(items[0]?.id || 'soul');
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoadingDocument(true);
      const next = await getLobsterDocument(currentDocumentId);
      if (cancelled) return;
      setDocumentContent(next.content);
      setLoadingDocument(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [currentDocumentId]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const nextLogs = await getLogs();
        if (!cancelled) {
          setLogs(nextLogs.content);
          setLoadingLogs(false);
        }
      } catch {
        if (!cancelled) setLoadingLogs(false);
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 12000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
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
            <span className={`chip ${gatewayStatus?.state === 'running' ? 'ok' : 'warn'}`}>
              {loadingStatus ? '读取中' : formatGatewayState(gatewayStatus?.state)}
            </span>
            <span className="chip">端口 {gatewayStatus?.port || '暂无'}</span>
            <span className="chip">PID {gatewayStatus?.pid || '暂无'}</span>
          </div>
          <div className="cluster">
            <button className="button subtle" onClick={() => void startGateway().then(loadStatus)}>启动</button>
            <button className="button ghost" onClick={() => void restartGateway().then(loadStatus)}>重启</button>
            <button className="button danger" onClick={() => void stopGateway().then(loadStatus)}>停止</button>
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
          <button className="button ghost" onClick={() => void loadLogsOnly()}>
            刷新日志
          </button>
        </div>
        <div className="field">
          <textarea value={loadingLogs ? '正在拉取设备日志…' : logs} readOnly style={{ minHeight: 320 }} />
        </div>
      </section>

      <section className="list-card panel">
        <div className="section-title">
          <div>
            <h2>龙虾文档</h2>
            <p>这里直接编辑龙虾工作区文档，保存后就是直接修改 `~/.openclaw/workspace`。</p>
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>文档</label>
            <select value={currentDocumentId} onChange={(event) => setCurrentDocumentId(event.target.value)}>
              {documents.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>说明</label>
            <input
              value={documents.find((item) => item.id === currentDocumentId)?.description || '直接绑定龙虾当前文档'}
              readOnly
            />
          </div>
        </div>
        <div className="field">
          <label>文档内容</label>
          <textarea
            value={loadingDocument ? '正在读取龙虾文档…' : documentContent}
            onChange={(event) => setDocumentContent(event.target.value)}
            style={{ minHeight: 360 }}
            readOnly={loadingDocument}
          />
        </div>
        <div className="cluster">
          <button
            className="button primary"
            onClick={() =>
              void saveLobsterDocument(currentDocumentId, documentContent).then((next) => {
                setDocumentContent(next.content);
                toast.success('龙虾文档已保存');
              })
            }
          >
            保存到龙虾
          </button>
          <button
            className="button ghost"
            onClick={() =>
              void getLobsterDocument(currentDocumentId).then((next) => {
                setDocumentContent(next.content);
                toast.success('已重新读取龙虾文档');
              })
            }
          >
            重新读取
          </button>
        </div>
      </section>
    </>
  );
}
