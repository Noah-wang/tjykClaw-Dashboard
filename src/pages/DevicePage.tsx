import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  createBackupSnapshot,
  deleteBackupSnapshot,
  getBackupStatus,
  getGatewayStatus,
  getLobsterDocument,
  getLobsterDocuments,
  getLogs,
  listBackupSnapshots,
  restartGateway,
  restoreBackupSnapshot,
  runDoctor,
  saveLobsterDocument,
  startGateway,
  stopGateway,
  verifyBackupSnapshot,
} from '../lib/device-api';
import { formatGatewayState, formatTime, safePretty } from '../lib/format';
import type {
  BackupSnapshot,
  BackupStatus,
  DeviceProfile,
  GatewayStatus,
  LobsterDocumentSummary,
} from '../lib/types';

function formatBytes(value?: number): string {
  const size = Number(value || 0);
  if (!size) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function DevicePage(props: {
  device: DeviceProfile;
  onForgetDevice: () => void;
}) {
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(null);
  const [logs, setLogs] = useState('');
  const [doctorOutput, setDoctorOutput] = useState('');
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [documents, setDocuments] = useState<LobsterDocumentSummary[]>([]);
  const [currentDocumentId, setCurrentDocumentId] = useState('soul');
  const [documentContent, setDocumentContent] = useState('');
  const [loadingDocument, setLoadingDocument] = useState(true);
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [snapshots, setSnapshots] = useState<BackupSnapshot[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(true);
  const [backupAction, setBackupAction] = useState<{
    type: 'create' | 'files_only' | 'verify' | 'restore' | 'delete';
    snapshotId?: string;
  } | null>(null);

  const loadStatus = async () => {
    const nextGateway = await getGatewayStatus();
    setGatewayStatus(nextGateway);
    setLoadingStatus(false);
  };

  const loadBackups = async () => {
    try {
      const [nextStatus, nextSnapshots] = await Promise.all([
        getBackupStatus(),
        listBackupSnapshots(),
      ]);
      setBackupStatus(nextStatus);
      setSnapshots(nextSnapshots);
    } finally {
      setLoadingBackups(false);
    }
  };

  const loadLogsOnly = async () => {
    setLoadingLogs(true);
    try {
      const nextLogs = await getLogs();
      setLogs(nextLogs.content);
    } finally {
      setLoadingLogs(false);
    }
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
        const [nextStatus, nextSnapshots] = await Promise.all([
          getBackupStatus(),
          listBackupSnapshots(),
        ]);
        if (cancelled) return;
        setBackupStatus(nextStatus);
        setSnapshots(nextSnapshots);
        setLoadingBackups(false);
      } catch {
        if (!cancelled) setLoadingBackups(false);
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const backupBusy = Boolean(backupStatus && backupStatus.currentOperation !== 'idle');
  const restoreInFlight = backupAction?.type === 'restore';

  const applyLocalBackupOperation = (operation: BackupStatus['currentOperation'], message: string, snapshotId?: string) => {
    setBackupStatus((current) => {
      if (!current) return current;
      return {
        ...current,
        currentOperation: operation,
        currentSnapshotId: snapshotId || null,
        message,
      };
    });
  };

  const refreshAfterRestore = async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 1800));
    await Promise.allSettled([
      loadBackups(),
      loadStatus(),
      getLobsterDocument(currentDocumentId).then((next) => setDocumentContent(next.content)),
    ]);
  };

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
            <h2>备份与恢复</h2>
            <p>这里既可以做整套业务数据备份，也可以只备份文件库 `~/.tjykclaw-storage`，不带 OpenClaw 本体数据。</p>
          </div>
          <div className="cluster">
            <button
              className="button primary"
              disabled={backupBusy || backupAction !== null}
              onClick={() => {
                setBackupAction({ type: 'create' });
                applyLocalBackupOperation('creating', '正在创建完整备份…');
                void createBackupSnapshot({ type: 'manual' })
                  .then(async () => {
                    toast.success('备份已创建');
                    await loadBackups();
                  })
                  .catch((error) => {
                    const message = error instanceof Error ? error.message : String(error);
                    toast.error(message || '创建备份失败');
                  })
                  .finally(() => setBackupAction(null));
              }}
            >
              {backupAction?.type === 'create' ? '正在备份…' : '立即备份'}
            </button>
            <button
              className="button subtle"
              disabled={backupBusy || backupAction !== null}
              onClick={() => {
                setBackupAction({ type: 'files_only' });
                applyLocalBackupOperation('creating', '正在创建文件库备份…');
                void createBackupSnapshot({ type: 'files_only', scope: 'files_only' })
                  .then(async () => {
                    toast.success('文件库备份已创建');
                    await loadBackups();
                  })
                  .catch((error) => {
                    const message = error instanceof Error ? error.message : String(error);
                    toast.error(message || '创建文件库备份失败');
                  })
                  .finally(() => setBackupAction(null));
              }}
            >
              {backupAction?.type === 'files_only' ? '文件备份中…' : '仅备份文件'}
            </button>
            <button className="button ghost" onClick={() => void loadBackups()}>
              刷新备份
            </button>
          </div>
        </div>

        <div className="chip-row">
          <span className={`chip ${backupBusy ? 'warn' : 'ok'}`}>
            {loadingBackups ? '读取中' : (backupBusy ? `处理中: ${backupStatus?.currentOperation}` : '空闲')}
          </span>
          <span className="chip">上次备份 {formatTime(backupStatus?.lastBackupAt || undefined)}</span>
          <span className="chip">上次恢复 {formatTime(backupStatus?.lastRestoreAt || undefined)}</span>
        </div>

        {backupStatus?.message ? (
          <div className="notice warn">
            {backupStatus.message}
          </div>
        ) : null}

        {backupStatus?.lastRestoreResult?.message ? (
          <div className={`notice ${backupStatus.lastRestoreResult.success ? 'warn' : 'danger'}`}>
            最近一次恢复: {backupStatus.lastRestoreResult.message}
          </div>
        ) : null}

        <div className="notice">
          当前完整备份范围：
          <br />
          <span className="mono">~/.openclaw</span>
          <br />
          <span className="mono">~/.tjykclaw-dashboard-bridge</span>
          <br />
          <span className="mono">~/.tjykclaw-storage</span>
        </div>

        <div className="notice">
          只点“仅备份文件”时，只会打包：
          <br />
          <span className="mono">~/.tjykclaw-storage</span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>类型</th>
                <th>范围</th>
                <th>大小</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.length === 0 ? (
                <tr>
                  <td colSpan={6}>{loadingBackups ? '正在读取备份…' : '还没有任何备份。'}</td>
                </tr>
              ) : snapshots.map((snapshot) => (
                <tr key={snapshot.id}>
                  <td>{formatTime(snapshot.createdAt)}</td>
                  <td>{snapshot.type}</td>
                  <td>{snapshot.includes.join(', ') || '无'}</td>
                  <td>{formatBytes(snapshot.archiveSize)}</td>
                  <td>
                    <div className="stack">
                      <span>{snapshot.status}</span>
                      <small>{snapshot.lastVerificationMessage || (snapshot.restorable ? '可恢复' : '不可恢复')}</small>
                    </div>
                  </td>
                  <td>
                    <div className="cluster">
                      <button
                        className="button subtle"
                        disabled={backupBusy || backupAction !== null}
                        onClick={() => {
                          setBackupAction({ type: 'verify', snapshotId: snapshot.id });
                          applyLocalBackupOperation('verifying', '正在校验备份…', snapshot.id);
                          void verifyBackupSnapshot(snapshot.id)
                            .then(async () => {
                              toast.success('备份校验完成');
                              await loadBackups();
                            })
                            .catch((error) => {
                              const message = error instanceof Error ? error.message : String(error);
                              toast.error(message || '校验备份失败');
                            })
                            .finally(() => setBackupAction(null));
                        }}
                      >
                        {backupAction?.type === 'verify' && backupAction.snapshotId === snapshot.id ? '校验中...' : '校验'}
                      </button>
                      <button
                        className="button ghost"
                        disabled={backupBusy || backupAction !== null || !snapshot.restorable}
                        onClick={() => {
                          if (!window.confirm(`恢复 ${snapshot.id} 会覆盖当前 OpenClaw 数据，继续吗？`)) return;
                          setBackupAction({ type: 'restore', snapshotId: snapshot.id });
                          applyLocalBackupOperation('restoring', '正在恢复备份…', snapshot.id);
                          void restoreBackupSnapshot(snapshot.id)
                            .then(async () => {
                              toast.success('恢复已完成，正在重新连接设备状态');
                              await refreshAfterRestore();
                            })
                            .catch((error) => {
                              const message = error instanceof Error ? error.message : String(error);
                              toast.error(message || '恢复备份失败');
                              void loadBackups();
                            })
                            .finally(() => setBackupAction(null));
                        }}
                      >
                        {backupAction?.type === 'restore' && backupAction.snapshotId === snapshot.id ? '恢复中...' : '恢复'}
                      </button>
                      <button
                        className="button danger"
                        disabled={backupBusy || backupAction !== null}
                        onClick={() => {
                          if (!window.confirm(`确定删除备份 ${snapshot.id}？`)) return;
                          setBackupAction({ type: 'delete', snapshotId: snapshot.id });
                          void deleteBackupSnapshot(snapshot.id)
                            .then(async () => {
                              toast.success('备份已删除');
                              await loadBackups();
                            })
                            .catch((error) => {
                              const message = error instanceof Error ? error.message : String(error);
                              toast.error(message || '删除备份失败');
                            })
                            .finally(() => setBackupAction(null));
                        }}
                      >
                        {backupAction?.type === 'delete' && backupAction.snapshotId === snapshot.id ? '删除中...' : '删除'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="list-card panel">
        <div className="section-title">
          <div>
            <h2>最近日志</h2>
            <p>日志改成按需读取，避免一进页面就触发重请求。</p>
          </div>
          <button className="button ghost" onClick={() => void loadLogsOnly()}>
            {restoreInFlight ? '恢复中稍后再读日志' : logs ? '刷新日志' : '加载日志'}
          </button>
        </div>
        <div className="field">
          <textarea
            value={loadingLogs ? '正在拉取设备日志…' : (logs || '尚未加载日志，点击右上角“加载日志”后再查看。')}
            readOnly
            style={{ minHeight: 320 }}
          />
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
