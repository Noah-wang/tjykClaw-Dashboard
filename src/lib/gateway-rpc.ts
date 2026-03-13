import { getGatewayInfo, readDeviceProfile } from './device-api';
import { createId } from './id';

type GatewayRequestFrame = {
  type: 'req';
  id: string;
  method: string;
  params?: unknown;
};

type GatewayResponseFrame<T> = {
  type?: string;
  id?: string;
  ok?: boolean;
  payload?: T;
  error?: { message?: string; code?: string } | string;
  event?: string;
  data?: unknown;
  payloadData?: unknown;
};

let activeSocket: WebSocket | null = null;
let activeBaseUrl = '';
let socketReady: Promise<WebSocket> | null = null;
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>();

function resolveGatewayWsUrl(wsUrl: string, baseUrl: string): string {
  const gatewayUrl = new URL(wsUrl);
  const deviceUrl = new URL(baseUrl);
  gatewayUrl.hostname = deviceUrl.hostname;
  gatewayUrl.protocol = deviceUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  if (deviceUrl.port && gatewayUrl.port === '3210') {
    gatewayUrl.port = deviceUrl.port;
  }
  return gatewayUrl.toString();
}

async function ensureSocket(): Promise<WebSocket> {
  const baseUrl = readDeviceProfile()?.baseUrl;
  if (!baseUrl) throw new Error('当前还没有已配对设备。');

  if (activeSocket && socketReady && activeBaseUrl === baseUrl && activeSocket.readyState === WebSocket.OPEN) {
    return socketReady;
  }

  if (socketReady && activeBaseUrl === baseUrl) {
    return socketReady;
  }

  activeBaseUrl = baseUrl;
  socketReady = (async () => {
    const gatewayInfo = await getGatewayInfo();
    const wsUrl = resolveGatewayWsUrl(gatewayInfo.wsUrl, baseUrl);
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(wsUrl);
      activeSocket = socket;
      const timeout = window.setTimeout(() => {
        socket.close();
        reject(new Error('连接网关超时。'));
      }, 8000);

      let connectRequestId: string | null = null;

      socket.addEventListener('open', () => {
        // Wait for protocol handshake.
      }, { once: true });

      socket.addEventListener('error', () => {
        window.clearTimeout(timeout);
        reject(new Error('网关连接发生错误。'));
      }, { once: true });

      socket.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as GatewayResponseFrame<unknown>;

          if (payload.type === 'event' && payload.event === 'connect.challenge') {
            const nonce = typeof (payload as { payload?: { nonce?: string } }).payload?.nonce === 'string'
              ? (payload as { payload?: { nonce?: string } }).payload!.nonce!
              : '';
            if (!nonce) {
              window.clearTimeout(timeout);
              reject(new Error('网关握手缺少挑战随机数。'));
              return;
            }
            connectRequestId = `connect-${Date.now()}`;
            const frame: GatewayRequestFrame = {
              type: 'req',
              id: connectRequestId,
              method: 'connect',
              params: {
                minProtocol: 3,
                maxProtocol: 3,
                client: {
                  id: 'openclaw-control-ui',
                  displayName: '天玑云科Claw',
                  version: '0.1.0',
                  platform: typeof navigator !== 'undefined' ? navigator.platform || 'web' : 'web',
                  mode: 'webchat',
                },
                auth: gatewayInfo.token ? { token: gatewayInfo.token } : undefined,
                caps: ['tool-events'],
                role: 'operator',
                scopes: ['operator.admin'],
                userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
                locale: typeof navigator !== 'undefined' ? navigator.language : 'en',
              },
            };
            socket.send(JSON.stringify(frame));
            return;
          }

          if (payload.type === 'res' && connectRequestId && payload.id === connectRequestId) {
            const ok = payload.ok !== false && !payload.error;
            window.clearTimeout(timeout);
            if (!ok) {
              const errorMessage = typeof payload.error === 'string'
                ? payload.error
                : payload.error?.message || '网关连接失败。';
              reject(new Error(errorMessage));
              return;
            }
            resolve();
            return;
          }

          if (payload.type !== 'res' || !payload.id) return;
          const waiter = pending.get(payload.id);
          if (!waiter) return;
          pending.delete(payload.id);
          const ok = payload.ok !== false && !payload.error;
          if (!ok) {
            const errorMessage = typeof payload.error === 'string'
              ? payload.error
              : payload.error?.message || '网关请求失败。';
            waiter.reject(new Error(errorMessage));
            return;
          }
          waiter.resolve(payload.payload);
        } catch {
          // Ignore malformed frames from unsolicited notifications.
        }
      });

      socket.addEventListener('close', () => {
        activeSocket = null;
        socketReady = null;
      });
    });

    return activeSocket as WebSocket;
  })();

  return socketReady;
}

export async function gatewayRpc<T>(method: string, params?: unknown): Promise<T> {
  const socket = await ensureSocket();
  const id = createId();
  const request: GatewayRequestFrame = {
    type: 'req',
    id,
    method,
    params,
  };

  const response = await new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    socket.send(JSON.stringify(request));
    window.setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      reject(new Error(`网关 RPC 请求超时：${method}`));
    }, 20000);
  });

  return response;
}
