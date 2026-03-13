export function formatTime(value?: string | number | null): string {
  if (!value) return '暂无';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatRelativeTime(value?: string | number | null): string {
  if (!value) return '暂无';
  const target = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(target)) return String(value);
  const deltaMs = Number(target) - Date.now();
  const minutes = Math.round(deltaMs / 60000);
  if (Math.abs(minutes) < 60) return `${minutes} 分钟`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return `${hours} 小时`;
  const days = Math.round(hours / 24);
  return `${days} 天`;
}

export function formatTokens(value: number): string {
  return new Intl.NumberFormat().format(value);
}

export function formatCurrency(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '暂无';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

export function safePretty(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function formatGatewayState(value?: string | null): string {
  switch (value) {
    case 'running':
      return '运行中';
    case 'stopped':
      return '已停止';
    case 'starting':
      return '启动中';
    case 'connecting':
      return '连接中';
    case 'connected':
      return '已连接';
    case 'disconnected':
      return '未连接';
    case 'error':
      return '异常';
    case 'paused':
      return '已暂停';
    default:
      return value || '未知';
  }
}

export function formatMessageRole(role?: string): string {
  switch (role) {
    case 'user':
      return '用户';
    case 'assistant':
      return '助手';
    case 'system':
      return '系统';
    case 'toolresult':
      return '工具结果';
    default:
      return role || '消息';
  }
}
