import { useEffect, useMemo, useState } from 'react';
import { getOverview } from '../lib/device-api';
import { formatCurrency, formatTime, formatTokens } from '../lib/format';
import type { OverviewSnapshot } from '../lib/types';

export function OverviewPage() {
  const [snapshot, setSnapshot] = useState<OverviewSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const next = await getOverview();
        if (cancelled) return;
        setSnapshot(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 8000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const usageSummary = useMemo(() => {
    const usage = snapshot?.usage || [];
    return usage.reduce(
      (acc, entry) => {
        acc.totalTokens += entry.totalTokens;
        acc.cost += entry.costUsd || 0;
        return acc;
      },
      { totalTokens: 0, cost: 0 },
    );
  }, [snapshot?.usage]);

  const latestRuns = useMemo(() => (snapshot?.usage || []).slice(0, 8), [snapshot?.usage]);

  return (
    <>
      <section className="grid-3">
        <div className="stat-card panel">
          <span>角色</span>
          <strong>{loading ? '...' : (snapshot?.agents ?? 0)}</strong>
          <div className="stat-note">已经创建好的角色数量</div>
        </div>
        <div className="stat-card panel">
          <span>外部接入</span>
          <strong>{loading ? '...' : (snapshot?.channels ?? 0)}</strong>
          <div className="stat-note">已经接上的外部消息方式</div>
        </div>
        <div className="stat-card panel">
          <span>技能</span>
          <strong>{loading ? '...' : (snapshot?.skills ?? 0)}</strong>
          <div className="stat-note">已经添加的能力</div>
        </div>
      </section>

      <section className="grid-3">
        <div className="stat-card panel">
          <span>模型账号</span>
          <strong>{loading ? '...' : (snapshot?.providers ?? 0)}</strong>
          <div className="stat-note">当前可以使用的模型来源</div>
        </div>
        <div className="stat-card panel">
          <span>自动任务</span>
          <strong>{loading ? '...' : (snapshot?.jobs ?? 0)}</strong>
          <div className="stat-note">已经设好的自动执行项目</div>
        </div>
        <div className="stat-card panel">
          <span>近期花费</span>
          <strong>{loading ? '...' : formatCurrency(usageSummary.cost)}</strong>
          <div className="stat-note">最近记录里一共用了 {formatTokens(usageSummary.totalTokens)}</div>
        </div>
      </section>

      <section className="list-card panel">
        <div className="section-title">
          <div>
            <h2>最近用量记录</h2>
            <p>这里显示最近的使用记录。</p>
          </div>
        </div>
        {latestRuns.length === 0 ? (
          <div className="empty">暂时还没有可用的用量记录。</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>角色</th>
                  <th>模型来源 / 模型</th>
                  <th>Token</th>
                  <th>费用</th>
                </tr>
              </thead>
              <tbody>
                {latestRuns.map((entry) => (
                  <tr key={`${entry.sessionId}-${entry.timestamp}`}>
                    <td>{formatTime(entry.timestamp)}</td>
                    <td>{entry.agentId}</td>
                    <td>{entry.provider || '暂无'} / {entry.model || '暂无'}</td>
                    <td>{formatTokens(entry.totalTokens)}</td>
                    <td>{formatCurrency(entry.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
