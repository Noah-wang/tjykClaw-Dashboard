import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  createCronJob,
  deleteCronJob,
  getCronJobs,
  runCronJob,
  toggleCronJob,
  updateCronJob,
} from '../lib/device-api';
import { formatTime } from '../lib/format';
import type { CronJob } from '../lib/types';

export function CronPage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [name, setName] = useState('');
  const [schedule, setSchedule] = useState('0 9 * * *');
  const [message, setMessage] = useState('');

  const load = async () => setJobs(await getCronJobs());

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async () => {
    await createCronJob({ name, schedule, message, enabled: true });
    setName('');
    setMessage('');
    toast.success('定时任务已创建');
    await load();
  };

  return (
    <>
      <section className="form-card panel">
        <div className="section-title">
          <div>
            <h2>创建定时任务</h2>
            <p>沿用与桌面端一致的宿主 API 协议。</p>
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>名称</label>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="早间简报" />
          </div>
          <div className="field">
            <label>Cron 表达式</label>
            <input value={schedule} onChange={(event) => setSchedule(event.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>提示词</label>
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} />
        </div>
        <div className="cluster">
          <button className="button primary" onClick={() => void handleCreate()}>
            新增任务
          </button>
        </div>
      </section>

      <section className="list-card panel">
        <div className="section-title">
          <div>
            <h2>当前任务</h2>
            <p>可直接在表格中启停、执行或快速修改。</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>名称</th>
                <th>计划</th>
                <th>下次执行</th>
                <th>上次执行</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <strong>{job.name}</strong>
                    <div className="muted">{job.message}</div>
                  </td>
                  <td className="mono">{typeof job.schedule === 'string' ? job.schedule : JSON.stringify(job.schedule)}</td>
                  <td>{job.nextRun ? formatTime(job.nextRun) : '暂无'}</td>
                  <td>{job.lastRun?.time ? formatTime(job.lastRun.time) : '从未执行'}</td>
                  <td>
                    <span className={`chip ${job.enabled ? 'ok' : 'warn'}`}>{job.enabled ? '已启用' : '已暂停'}</span>
                  </td>
                  <td>
                    <div className="cluster">
                      <button className="button subtle" onClick={() => void runCronJob(job.id).then(() => toast.success('任务已触发'))}>
                        立即执行
                      </button>
                      <button className="button ghost" onClick={() => void toggleCronJob(job.id, !job.enabled).then(load)}>
                        {job.enabled ? '暂停' : '恢复'}
                      </button>
                      <button className="button ghost" onClick={() => void updateCronJob(job.id, { name: `${job.name}（已修改）` }).then(load)}>
                        快速修改
                      </button>
                      <button className="button danger" onClick={() => void deleteCronJob(job.id).then(load)}>
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
