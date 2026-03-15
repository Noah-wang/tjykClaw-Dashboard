import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  createBackupSnapshot,
  deleteBackupSnapshot,
  getBackupStatus,
  listBackupSnapshots,
  restoreBackupSnapshot,
  verifyBackupSnapshot,
} from '../lib/device-api';
import type { BackupSnapshot, BackupStatus } from '../lib/types';

function formatBytes(value?: number): string {
  const size = Number(value || 0);
  if (!size) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatBackupTime(value?: string | number | null): string {
  if (!value) return '暂无';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatBackupType(value?: string): string {
  switch (value) {
    case 'manual':
      return '完整';
    case 'files_only':
      return '仅文件';
    case 'pre_restore':
      return '恢复前保护';
    default:
      return value || '未知';
  }
}

function formatBackupScope(items?: string[]): string {
  if (!items?.length) return '无';
  const labels: Record<string, string> = {
    openclaw: '龙虾主程序',
    bridge: '控制台设置',
    workspace: '龙虾文档',
    storage: '文件库',
  };
  return items.map((item) => labels[item] || item).join('、');
}

function formatBackupOperation(value?: string | null): string {
  switch (value) {
    case 'creating':
      return '备份中';
    case 'verifying':
      return '检查中';
    case 'restoring':
      return '恢复中';
    case 'deleting':
      return '删除中';
    case 'idle':
      return '空闲';
    default:
      return value || '未知';
  }
}

function formatBackupSnapshotStatus(value?: string): string {
  switch (value) {
    case 'ready':
      return '可用';
    case 'corrupt':
      return '损坏';
    case 'creating':
      return '生成中';
    case 'deleted':
      return '已删除';
    default:
      return value || '未知';
  }
}

export function BackupsPage() {
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [snapshots, setSnapshots] = useState<BackupSnapshot[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(true);
  const [backupAction, setBackupAction] = useState<{
    type: 'create' | 'files_only' | 'verify' | 'restore' | 'delete';
    snapshotId?: string;
  } | null>(null);

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

  const recoverBackupUi = () => {
    void loadBackups();
  };

  return (
    <section className="list-card panel">
        <div className="section-title">
          <div>
            <h2>备份与恢复</h2>
            <p>这里可以保存整套内容，也可以只保存龙虾文档和文件库。当前共 {snapshots.length} 条记录。</p>
          </div>
        <div className="cluster">
          <button
            className="button primary"
            disabled={backupBusy || backupAction !== null}
            onClick={() => {
              setBackupAction({ type: 'create' });
              applyLocalBackupOperation('creating', '正在保存完整内容…');
              void createBackupSnapshot({ type: 'manual' })
                .then(async () => {
                  toast.success('内容已保存');
                  await loadBackups();
                })
                .catch((error) => {
                  const message = error instanceof Error ? error.message : String(error);
                  toast.error(message || '保存失败');
                  recoverBackupUi();
                })
                .finally(() => {
                  setBackupAction(null);
                  recoverBackupUi();
                });
            }}
          >
            {backupAction?.type === 'create' ? '保存中…' : '立即保存'}
          </button>
          <button
            className="button subtle"
            disabled={backupBusy || backupAction !== null}
            onClick={() => {
              setBackupAction({ type: 'files_only' });
              applyLocalBackupOperation('creating', '正在保存文件…');
              void createBackupSnapshot({ type: 'files_only', scope: 'files_only' })
                .then(async () => {
                  toast.success('龙虾文档和文件已保存');
                  await loadBackups();
                })
                .catch((error) => {
                  const message = error instanceof Error ? error.message : String(error);
                  toast.error(message || '保存失败');
                  recoverBackupUi();
                })
                .finally(() => {
                  setBackupAction(null);
                  recoverBackupUi();
                });
            }}
          >
            {backupAction?.type === 'files_only' ? '文件保存中…' : '仅保存文件'}
          </button>
          <button className="button ghost" disabled={backupBusy || backupAction !== null || loadingBackups} onClick={() => void loadBackups()}>
            {loadingBackups ? '正在加载...' : '刷新列表'}
          </button>
        </div>
      </div>

      <div className="chip-row">
        <span className={`chip ${backupBusy ? 'warn' : 'ok'}`}>
          {loadingBackups ? '读取中' : (backupBusy ? `处理中: ${formatBackupOperation(backupStatus?.currentOperation)}` : '空闲')}
        </span>
        <span className="chip">上次保存 {formatBackupTime(backupStatus?.lastBackupAt || undefined)}</span>
        <span className="chip">上次找回 {formatBackupTime(backupStatus?.lastRestoreAt || undefined)}</span>
      </div>

      {backupStatus?.message && !backupBusy ? (
        <div className="notice warn">
          {backupStatus.message}
        </div>
      ) : null}

      {backupStatus?.lastRestoreResult?.message ? (
        <div className={`notice ${backupStatus.lastRestoreResult.success ? 'warn' : 'danger'}`}>
          最近一次找回: {backupStatus.lastRestoreResult.message}
        </div>
      ) : null}

      <div className="notice">
        点“立即保存”时，会一起保存：
        <br />
        · 龙虾主程序
        <br />
        · 控制台设置
        <br />
        · 文件库
      </div>

      <div className="notice">
        点“仅保存文件”时，只会保存：
        <br />
        · 龙虾文档
        <br />
        · 文件库
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>类型</th>
              <th>会保存什么</th>
              <th>大小</th>
              <th>情况</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.length === 0 ? (
              <tr>
                <td colSpan={6}>{loadingBackups ? '正在读取保存记录…' : '还没有任何保存记录。'}</td>
              </tr>
            ) : snapshots.map((snapshot) => (
              <tr key={snapshot.id}>
                <td>{formatBackupTime(snapshot.createdAt)}</td>
                <td>{formatBackupType(snapshot.type)}</td>
                <td>{formatBackupScope(snapshot.includes)}</td>
                <td>{formatBytes(snapshot.archiveSize)}</td>
                <td>
                  <div className="stack">
                    <span>{formatBackupSnapshotStatus(snapshot.status)}</span>
                    {snapshot.lastVerificationMessage ? <small>{snapshot.lastVerificationMessage}</small> : null}
                  </div>
                </td>
                <td>
                  <div className="cluster">
                    <button
                      className="button subtle"
                      disabled={backupBusy || backupAction !== null}
                      onClick={() => {
                        setBackupAction({ type: 'verify', snapshotId: snapshot.id });
                        applyLocalBackupOperation('verifying', '正在检查保存内容…', snapshot.id);
                        void verifyBackupSnapshot(snapshot.id)
                          .then(async () => {
                            toast.success('检查已完成');
                            await loadBackups();
                          })
                          .catch((error) => {
                            const message = error instanceof Error ? error.message : String(error);
                            toast.error(message || '检查失败');
                            recoverBackupUi();
                          })
                          .finally(() => {
                            setBackupAction(null);
                            recoverBackupUi();
                          });
                      }}
                    >
                      {backupAction?.type === 'verify' && backupAction.snapshotId === snapshot.id ? '检查中...' : '检查'}
                    </button>
                    <button
                      className="button ghost"
                      disabled={backupBusy || backupAction !== null || !snapshot.restorable}
                      onClick={() => {
                        if (!window.confirm(`找回 ${snapshot.id} 会覆盖现在的龙虾内容，继续吗？`)) return;
                        setBackupAction({ type: 'restore', snapshotId: snapshot.id });
                        applyLocalBackupOperation('restoring', '正在找回内容…', snapshot.id);
                        void restoreBackupSnapshot(snapshot.id)
                          .then(async () => {
                            toast.success('找回已完成');
                            await loadBackups();
                          })
                          .catch((error) => {
                            const message = error instanceof Error ? error.message : String(error);
                            toast.error(message || '找回失败');
                            recoverBackupUi();
                          })
                          .finally(() => {
                            setBackupAction(null);
                            recoverBackupUi();
                          });
                      }}
                    >
                      {backupAction?.type === 'restore' && backupAction.snapshotId === snapshot.id ? '找回中...' : '找回'}
                    </button>
                    <button
                      className="button danger"
                      disabled={backupBusy || backupAction !== null}
                      onClick={() => {
                        if (!window.confirm(`确定删除这条保存记录 ${snapshot.id}？`)) return;
                        setBackupAction({ type: 'delete', snapshotId: snapshot.id });
                        void deleteBackupSnapshot(snapshot.id)
                          .then(async () => {
                            toast.success('保存记录已删除');
                            await loadBackups();
                          })
                          .catch((error) => {
                            const message = error instanceof Error ? error.message : String(error);
                            toast.error(message || '删除失败');
                            recoverBackupUi();
                          })
                          .finally(() => {
                            setBackupAction(null);
                            recoverBackupUi();
                          });
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
  );
}
