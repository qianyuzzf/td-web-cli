import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { normalizeError } from '../utils/index.js';

// GET 请求封装
export const getData = async <T>(
  url: string,
  params: Record<string, unknown> = {},
  headers: Record<string, string> = {}
): Promise<T> => {
  const res = await axios.get<T>(url, { params, headers });
  return res.data;
};

// POST 请求封装
export const postData = async <T, R>(
  url: string,
  params: T,
  headers: Record<string, string> = {}
): Promise<R> => {
  const res = await axios.post<T, AxiosResponse<R>>(url, params, {
    headers,
  });
  return res.data;
};

// 流式传输 POST 请求（带取消功能）
export const postStream = async <T>(
  url: string,
  params: T,
  headers: Record<string, string> = {},
  onData: (chunk: string) => void,
  onError?: (error: Error) => void,
  onComplete?: () => void,
  signal?: AbortSignal
): Promise<void> => {
  const config: AxiosRequestConfig = {
    headers,
    responseType: 'stream',
    signal, // 添加 AbortSignal 支持
  };

  try {
    const response = await axios.post(url, params, config);

    // 处理流数据
    const stream = response.data;
    let buffer = '';

    // 监听 abort 事件
    const onAbort = (): void => {
      stream.destroy(new Error('请求已中止'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    stream.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();

      // 处理可能的多个消息在一个chunk中
      const parts = buffer.split('\n');
      buffer = parts.pop() || ''; // 保留未完成的部分

      parts.forEach((part) => {
        if (part.trim()) {
          onData(part.trim());
        }
      });
    });

    stream.on('end', () => {
      signal?.removeEventListener('abort', onAbort);
      if (buffer.trim()) {
        onData(buffer.trim());
      }
      onComplete?.();
    });

    stream.on('error', (err: Error) => {
      signal?.removeEventListener('abort', onAbort);
      // 如果是主动取消的请求，不触发 onError
      if (err.message !== '请求已中止') {
        onError?.(err);
      }
    });
  } catch (error) {
    // 如果是取消的请求，不触发 onError
    if (!axios.isCancel(error)) {
      onError?.(normalizeError(error));
    }
  }
};

// SSE 传输 POST 请求（带取消功能）
export const postSSE = async <T>(
  url: string,
  params: T,
  headers: Record<string, string> = {},
  onMessage: (event: string, data: string) => void,
  onError?: (error: Error) => void,
  signal?: AbortSignal
): Promise<void> => {
  const config: AxiosRequestConfig = {
    headers: {
      ...headers,
      Accept: 'text/event-stream',
    },
    responseType: 'stream',
    signal, // 添加 AbortSignal 支持
  };

  try {
    const response = await axios.post(url, params, config);
    const stream = response.data;
    let buffer = '';

    // 监听 abort 事件
    const onAbort = (): void => {
      stream.destroy(new Error('请求已中止'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    stream.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();

      // 处理SSE格式（以\n\n分隔的多个事件）
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      events.forEach((eventStr) => {
        if (eventStr.trim()) {
          const event: Record<string, string> = {};
          eventStr.split('\n').forEach((line) => {
            const sepIndex = line.indexOf(':');
            if (sepIndex !== -1) {
              const key = line.slice(0, sepIndex).trim();
              // 注意 trimStart 保留 value 中的空格
              event[key] = line.slice(sepIndex + 1).trimStart();
            }
          });

          if (event.event || event.data) {
            onMessage(event.event || 'message', event.data || '');
          }
        }
      });
    });

    stream.on('error', (err: Error) => {
      signal?.removeEventListener('abort', onAbort);
      // 如果是主动取消的请求，不触发 onError
      if (err.message !== '请求已中止') {
        onError?.(err);
      }
    });

    stream.on('end', () => {
      signal?.removeEventListener('abort', onAbort);
    });
  } catch (error) {
    // 如果是取消的请求，不触发 onError
    if (!axios.isCancel(error)) {
      onError?.(normalizeError(error));
    }
  }
};

// PUT 请求封装
export const putData = async <T, R>(
  url: string,
  params: T,
  headers: Record<string, string> = {}
): Promise<R> => {
  const res = await axios.put<T, AxiosResponse<R>>(url, params, {
    headers,
  });
  return res.data;
};

// DELETE 请求封装
export const deleteData = async <T>(
  url: string,
  params: Record<string, unknown> = {},
  headers: Record<string, string> = {}
): Promise<T> => {
  const res = await axios.delete<T>(url, { params, headers });
  return res.data;
};
