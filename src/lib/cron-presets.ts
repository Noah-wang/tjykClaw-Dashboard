export type CronPreset = {
  id: string;
  name: string;
  schedule: string;
  message: string;
  description: string;
};

export const CRON_PRESETS: CronPreset[] = [
  {
    id: 'morning-briefing',
    name: '早间简报',
    schedule: '0 9 * * *',
    message: '整理今天需要关注的重点事项，输出简洁的早间简报。',
    description: '每天上午 9 点生成一份今日重点摘要。',
  },
  {
    id: 'evening-summary',
    name: '晚间总结',
    schedule: '0 21 * * *',
    message: '总结今天的重要进展、未完成事项和明日建议。',
    description: '每天晚上 9 点生成一份收尾总结。',
  },
  {
    id: 'hourly-check',
    name: '整点巡检',
    schedule: '0 * * * *',
    message: '检查当前运行状态、关键告警和待处理异常，输出精简结果。',
    description: '每小时执行一次状态巡检。',
  },
  {
    id: 'weekly-review',
    name: '周报汇总',
    schedule: '0 10 * * 1',
    message: '整理最近一周的重要变化、问题和下周建议，输出周报。',
    description: '每周一上午 10 点生成一份周报。',
  },
];
