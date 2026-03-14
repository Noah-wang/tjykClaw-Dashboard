import { useEffect, useMemo, useState } from 'react';
import {
  getAgents,
  getChannels,
  getCronJobs,
  getInstalledSkills,
  getProviders,
  getUsageHistory,
} from '../lib/device-api';
import { formatCurrency, formatGatewayState, formatTime, formatTokens } from '../lib/format';
import type { GatewayStatus, UsageHistoryEntry } from '../lib/types';

export function OverviewPage(props: {
  gatewayStatus: GatewayStatus | null;
  gatewayError: string | null;
}) {
  const [agents, setAgents] = useState(0);
  const [channels, setChannels] = useState(0);
  const [skills, setSkills] = useState(0);
  const [providers, setProviders] = useState(0);
  const [jobs, setJobs] = useState(0);
  const [usage, setUsage] = useState<UsageHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const results = await Promise.allSettled([
        getAgents(),
        getChannels(),
        getInstalledSkills(),
        getProviders(),
        getCronJobs(),
        getUsageHistory(),
      ]);
      if (cancelled) return;

      if (results[0].status === 'fulfilled') setAgents(results[0].value.agents.length);
      if (results[1].status === 'fulfilled') setChannels(results[1].value.length);
      if (results[2].status === 'fulfilled') setSkills(results[2].value.length);
      if (results[3].status === 'fulfilled') setProviders(results[3].value.length);
      if (results[4].status === 'fulfilled') setJobs(results[4].value.length);
      if (results[5].status === 'fulfilled') setUsage(results[5].value);
      setLoading(false);
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
    return usage.reduce(
      (acc, entry) => {
        acc.totalTokens += entry.totalTokens;
        acc.cost += entry.costUsd || 0;
        return acc;
      },
      { totalTokens: 0, cost: 0 },
    );
  }, [usage]);

  const latestRuns = useMemo(() => usage.slice(0, 8), [usage]);

  return (
    <>
      <section>
        <div className="content-card panel">
          <div className="section-title">
            <div>
              <h2>网关状态</h2>
              <p>以下运行状态直接来自已配对设备。</p>
            </div>
          </div>
          <div className="chip-row">
            <span className={`chip ${props.gatewayStatus?.state === 'running' ? 'ok' : 'warn'}`}>
              {formatGatewayState(props.gatewayStatus?.state)}
            </span>
            <span className="chip">端口 {props.gatewayStatus?.port || '暂无'}</span>
            <span className="chip">PID {props.gatewayStatus?.pid || '暂无'}</span>
          </div>
          {props.gatewayStatus?.error ? <div className="notice danger">{props.gatewayStatus.error}</div> : null}
          {props.gatewayError ? <div className="notice danger">{props.gatewayError}</div> : null}
          <div className="notice">
            连接时间：{props.gatewayStatus?.connectedAt ? formatTime(props.gatewayStatus.connectedAt) : '暂无'}
          </div>
        </div>
      </section>

      <section className="grid-3">
        <div className="stat-card panel">
          <span>智能体</span>
          <strong>{loading ? '...' : agents}</strong>
          <div className="stat-note">已配置的 OpenClaw 运行实例</div>
        </div>
        <div className="stat-card panel">
          <span>渠道</span>
          <strong>{loading ? '...' : channels}</strong>
          <div className="stat-note">已启用的消息集成</div>
        </div>
        <div className="stat-card panel">
          <span>技能</span>
          <strong>{loading ? '...' : skills}</strong>
          <div className="stat-note">已安装的能力包</div>
        </div>
      </section>

      <section className="grid-3">
        <div className="stat-card panel">
          <span>提供商</span>
          <strong>{loading ? '...' : providers}</strong>
          <div className="stat-note">可供运行时使用的账号条目</div>
        </div>
        <div className="stat-card panel">
          <span>定时任务</span>
          <strong>{loading ? '...' : jobs}</strong>
          <div className="stat-note">当前已注册的自动化任务</div>
        </div>
        <div className="stat-card panel">
          <span>近期花费</span>
          <strong>{loading ? '...' : formatCurrency(usageSummary.cost)}</strong>
          <div className="stat-note">已追踪历史中共 {formatTokens(usageSummary.totalTokens)} 个 Token</div>
        </div>
      </section>

      <section className="list-card panel">
        <div className="section-title">
          <div>
            <h2>最近用量记录</h2>
            <p>展示设备最近解析出的用量条目。</p>
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
                  <th>智能体</th>
                  <th>提供商 / 模型</th>
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
