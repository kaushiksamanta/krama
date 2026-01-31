import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import httpNode from '../../src/nodes/http.v1.node.js';
import { createMockContext } from '../helpers/node-test-utils.js';

describe('http node', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has correct metadata', () => {
    expect(httpNode.name).toBe('http');
    expect(httpNode.version).toBe('1.0.0');
    expect(typeof httpNode.execute).toBe('function');
  });

  it('makes GET request successfully', async () => {
    const headersMap = new Map([['content-type', 'application/json']]);
    const mockResponse = {
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('{"data": "test"}'),
      headers: {
        forEach: (cb: (value: string, key: string) => void) => {
          headersMap.forEach((v, k) => cb(v, k));
        },
      },
    };

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

    const context = createMockContext();
    const result = await httpNode.execute(
      { url: 'https://api.example.com/data', method: 'GET', timeout: 5000, responseType: 'json' },
      context
    );

    expect(result.status).toBe(200);
    expect(result.data).toEqual({ data: 'test' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.example.com/data',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('makes POST request with body', async () => {
    const mockResponse = {
      ok: true,
      status: 201,
      text: vi.fn().mockResolvedValue('{"id": 123}'),
      headers: { forEach: vi.fn() },
    };

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

    const context = createMockContext();
    const result = await httpNode.execute(
      {
        url: 'https://api.example.com/users',
        method: 'POST',
        body: { name: 'John' },
        timeout: 5000,
        responseType: 'json',
      },
      context
    );

    expect(result.status).toBe(201);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.example.com/users',
      expect.objectContaining({
        method: 'POST',
        body: '{"name":"John"}',
      })
    );
  });

  it('throws error for non-2xx responses', async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: vi.fn().mockResolvedValue('{"error": "not found"}'),
      headers: { forEach: vi.fn() },
    };

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

    const context = createMockContext();

    await expect(
      httpNode.execute(
        { url: 'https://api.example.com/missing', method: 'GET', timeout: 5000, responseType: 'json' },
        context
      )
    ).rejects.toThrow('HTTP 404');
  });

  it('validates input schema', () => {
    expect(httpNode.inputSchema).toBeDefined();

    const validResult = httpNode.inputSchema?.safeParse({
      url: 'https://example.com',
      method: 'GET',
    });
    expect(validResult?.success).toBe(true);

    const invalidUrl = httpNode.inputSchema?.safeParse({
      url: 'not-a-url',
      method: 'GET',
    });
    expect(invalidUrl?.success).toBe(false);

    const invalidMethod = httpNode.inputSchema?.safeParse({
      url: 'https://example.com',
      method: 'INVALID',
    });
    expect(invalidMethod?.success).toBe(false);
  });
});
