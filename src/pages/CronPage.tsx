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
import { CRON_PRESETS } from '../lib/cron-presets';
import type { CronJob } from '../lib/types';

type ScheduleMode = 'daily' | 'weekly' | 'hourly';

const WEEKDAY_OPTIONS = [
  { value: '1', label: '周一' },
  { value: '2', label: '周二' },
  { value: '3', label: '周三' },
  { value: '4', label: '周四' },
  { value: '5', label: '周五' },
  { value: '6', label: '周六' },
  { value: '0', label: '周日' },
];

function buildSchedule(mode: ScheduleMode, time: string, weekday: string, minuteOfHour: string): string {
  if (mode === 'hourly') {
    return `${Math.min(59, Math.max(0, Number(minuteOfHour) || 0))} * * * *`;
  }

  const [hourText, minuteText] = String(time || '09:00').split(':');
  const hour = Math.min(23, Math.max(0, Number(hourText) || 0));
  const minute = Math.min(59, Math.max(0, Number(minuteText) || 0));

  if (mode === 'weekly') {
    return `${minute} ${hour} * * ${weekday || '1'}`;
  }

  return `${minute} ${hour} * * *`;
}

function formatScheduleLabel(schedule: CronJob['schedule']): string {
  if (typeof schedule !== 'string') {
    if (schedule?.kind === 'interval' && schedule.everyMs) {
      return `每 ${(schedule.everyMs / 1000 / 60 / 60).toFixed(0)} 小时`;
    }
    return '按设定时间执行';
  }

  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return schedule;

  const [minute, hour, , , weekday] = parts;
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');

  if (hour === '*' && weekday === '*') {
    return `每小时 ${mm} 分`;
  }

  if (weekday === '*') {
    return `每天 ${hh}:${mm}`;
  }

  const weekdayLabel = WEEKDAY_OPTIONS.find((item) => item.value === weekday)?.label;
  if (weekdayLabel) {
    return `${weekdayLabel} ${hh}:${mm}`;
  }

  return schedule;
}

export function CronPage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('daily');
  const [dailyTime, setDailyTime] = useState('09:00');
  const [weeklyTime, setWeeklyTime] = useState('10:00');
  const [weeklyDay, setWeeklyDay] = useState('1');
  const [hourlyMinute, setHourlyMinute] = useState('0');
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const load = async () => {
    setLoadingJobs(true);
    try {
      setJobs(await getCronJobs());
    } finally {
      setLoadingJobs(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async () => {
    const schedule = buildSchedule(scheduleMode, scheduleMode === 'weekly' ? weeklyTime : dailyTime, weeklyDay, hourlyMinute);
    setBusyAction('create');
    try {
      await createCronJob({ name, schedule, message, enabled: true });
      setName('');
      setMessage('');
      setScheduleMode('daily');
      setDailyTime('09:00');
      setWeeklyTime('10:00');
      setWeeklyDay('1');
      setHourlyMinute('0');
      toast.success('自动任务已创建');
      await load();
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreatePreset = async (presetId: string) => {
    const preset = CRON_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setBusyAction(`preset:${presetId}`);
    try {
      await createCronJob({
        name: preset.name,
        schedule: preset.schedule,
        message: preset.message,
        enabled: true,
      });
      toast.success('预设任务已添加');
      await load();
    } finally {
      setBusyAction(null);
    }
  };

  const locked = busyAction !== null;

  return (
    <>
      <section className="form-card panel">
        <div className="section-title">
          <div>
            <h2>预设任务</h2>
            <p>先用常见模板快速加入，再按需要细改。</p>
          </div>
        </div>
        <div className="role-preset-grid">
          {CRON_PRESETS.map((preset) => (
            <article className="role-preset-card" key={preset.id}>
              <div className="role-avatar" aria-hidden="true">任</div>
              <div className="role-preset-copy">
                <strong>{preset.name}</strong>
                <p>{preset.description}</p>
                <div className="chip-row">
                  <span className="chip">{formatScheduleLabel(preset.schedule)}</span>
                </div>
              </div>
              <button className="button primary" disabled={locked} onClick={() => void handleCreatePreset(preset.id)}>
                {busyAction === `preset:${preset.id}` ? '添加中...' : '添加任务'}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="form-card panel">
        <div className="section-title">
          <div>
            <h2>创建定时任务</h2>
            <p>你可以自己设一个固定时间，让它按时执行。</p>
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>名称</label>
            <input disabled={locked} value={name} onChange={(event) => setName(event.target.value)} placeholder="早间简报" />
          </div>
          <div className="field">
            <label>执行方式</label>
            <select disabled={locked} value={scheduleMode} onChange={(event) => setScheduleMode(event.target.value as ScheduleMode)}>
              <option value="daily">每天一次</option>
              <option value="weekly">每周一次</option>
              <option value="hourly">每小时一次</option>
            </select>
          </div>
        </div>
        {scheduleMode === 'daily' ? (
          <div className="field">
            <label>每天几点</label>
            <input disabled={locked} type="time" value={dailyTime} onChange={(event) => setDailyTime(event.target.value)} />
          </div>
        ) : null}
        {scheduleMode === 'weekly' ? (
          <div className="grid-2">
            <div className="field">
              <label>每周哪一天</label>
              <select disabled={locked} value={weeklyDay} onChange={(event) => setWeeklyDay(event.target.value)}>
                {WEEKDAY_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>几点执行</label>
              <input disabled={locked} type="time" value={weeklyTime} onChange={(event) => setWeeklyTime(event.target.value)} />
            </div>
          </div>
        ) : null}
        {scheduleMode === 'hourly' ? (
          <div className="field">
            <label>每小时的第几分钟执行</label>
            <input
              type="number"
              min={0}
              max={59}
              disabled={locked}
              value={hourlyMinute}
              onChange={(event) => setHourlyMinute(event.target.value)}
              placeholder="0"
            />
          </div>
        ) : null}
        <div className="notice">
          当前会按“{formatScheduleLabel(buildSchedule(scheduleMode, scheduleMode === 'weekly' ? weeklyTime : dailyTime, weeklyDay, hourlyMinute))}”执行。
        </div>
        <div className="field">
          <label>执行内容</label>
          <textarea disabled={locked} value={message} onChange={(event) => setMessage(event.target.value)} />
        </div>
        <div className="cluster">
          <button className="button primary" disabled={locked || !name.trim() || !message.trim()} onClick={() => void handleCreate()}>
            {busyAction === 'create' ? '新增中...' : '新增任务'}
          </button>
        </div>
      </section>

      <section className="list-card panel">
        <div className="section-title">
            <div>
              <h2>当前任务</h2>
              <p>可以直接在这里暂停、执行或快速修改。当前共 {jobs.length} 个。</p>
            </div>
            <button className="button ghost" disabled={locked || loadingJobs} onClick={() => void load()}>
              {loadingJobs ? '正在加载...' : '刷新'}
            </button>
          </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>名称</th>
                <th>时间</th>
                <th>下次执行</th>
                <th>上次执行</th>
                <th>情况</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loadingJobs ? (
                <tr>
                  <td colSpan={6}>正在加载任务...</td>
                </tr>
              ) : null}
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <strong>{job.name}</strong>
                    <div className="muted">{job.message}</div>
                  </td>
                  <td>{formatScheduleLabel(job.schedule)}</td>
                  <td>{job.nextRun ? formatTime(job.nextRun) : '暂无'}</td>
                  <td>{job.lastRun?.time ? formatTime(job.lastRun.time) : '从未执行'}</td>
                  <td>
                    <span className={`chip ${job.enabled ? 'ok' : 'warn'}`}>{job.enabled ? '已启用' : '已暂停'}</span>
                  </td>
                  <td>
                    <div className="cluster">
                      <button
                        className="button subtle"
                        disabled={locked}
                        onClick={() => {
                          setBusyAction(`run:${job.id}`);
                          void runCronJob(job.id)
                            .then(() => toast.success('任务已触发'))
                            .finally(() => setBusyAction(null));
                        }}
                      >
                        {busyAction === `run:${job.id}` ? '执行中...' : '立即执行'}
                      </button>
                      <button
                        className="button ghost"
                        disabled={locked}
                        onClick={() => {
                          setBusyAction(`toggle:${job.id}`);
                          void toggleCronJob(job.id, !job.enabled)
                            .then(load)
                            .finally(() => setBusyAction(null));
                        }}
                      >
                        {busyAction === `toggle:${job.id}` ? (job.enabled ? '暂停中...' : '恢复中...') : (job.enabled ? '暂停' : '恢复')}
                      </button>
                      <button
                        className="button ghost"
                        disabled={locked}
                        onClick={() => {
                          setBusyAction(`update:${job.id}`);
                          void updateCronJob(job.id, { name: `${job.name}（已修改）` })
                            .then(load)
                            .finally(() => setBusyAction(null));
                        }}
                      >
                        {busyAction === `update:${job.id}` ? '修改中...' : '快速修改'}
                      </button>
                      <button
                        className="button danger"
                        disabled={locked}
                        onClick={() => {
                          setBusyAction(`delete:${job.id}`);
                          void deleteCronJob(job.id)
                            .then(load)
                            .finally(() => setBusyAction(null));
                        }}
                      >
                        {busyAction === `delete:${job.id}` ? '删除中...' : '删除'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loadingJobs && jobs.length === 0 ? (
                <tr>
                  <td colSpan={6}>这里还没有任务。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
