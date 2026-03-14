import { deviceFetch } from './device-api';

export async function gatewayRpc<T>(method: string, params?: unknown): Promise<T> {
  return deviceFetch<T>('/api/gateway/rpc', {
    method: 'POST',
    body: JSON.stringify({ method, params }),
  });
}
