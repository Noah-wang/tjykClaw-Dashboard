import { useEffect, useMemo, useState } from 'react';
import { getUsageHistory } from '../lib/device-api';
import { formatCurrency, formatTime, formatTokens } from '../lib/format';
import type { UsageHistoryEntry } from '../lib/types';

export function ModelsPage() {
  const [entries, setEntries] = useState<UsageHistoryEntry[]>([]);

  useEffect(() => {
    void getUsageHistory().then(setEntries);
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, { tokens: number; cost: number; calls: number }>();
    entries.forEach((entry) => {
      const key = `${entry.provider || '未知提供商'} / ${entry.model || '未知模型'}`;
      const current = map.get(key) || { tokens: 0, cost: 0, calls: 0 };
      current.tokens += entry.totalTokens;
      current.cost += entry.costUsd || 0;
      current.calls += 1;
      map.set(key, current);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].tokens - a[1].tokens);
  }, [entries]);

  return (
    <>
      <section className="grid-2">
        <div className="list-card panel">
          <div className="section-title">
            <div>
              <h2>按模型汇总</h2>
              <p>基于最近历史接口做聚合统计。</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>模型</th>
                  <th>调用次数</th>
                  <th>Token</th>
                  <th>费用</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map(([label, summary]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td>{summary.calls}</td>
                    <td>{formatTokens(summary.tokens)}</td>
                    <td>{formatCurrency(summary.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="list-card panel">
          <div className="section-title">
            <div>
              <h2>最近记录</h2>
              <p>保留原始时间线，方便排查突增问题。</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>智能体</th>
                  <th>模型</th>
                  <th>Token</th>
                </tr>
              </thead>
              <tbody>
                {entries.slice(0, 16).map((entry) => (
                  <tr key={`${entry.sessionId}-${entry.timestamp}`}>
                    <td>{formatTime(entry.timestamp)}</td>
                    <td>{entry.agentId}</td>
                    <td>{entry.model || '暂无'}</td>
                    <td>{formatTokens(entry.totalTokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
