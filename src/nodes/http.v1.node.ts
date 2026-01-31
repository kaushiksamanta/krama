import { z } from 'zod';
import { NodeDefinition, NodeContext, NodeExecutionError } from '../types/node.js';

const HttpInputSchema = z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).default('GET'),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  timeout: z.number().min(0).max(300000).default(30000),
  responseType: z.enum(['json', 'text']).default('json'),
});

type HttpInput = z.infer<typeof HttpInputSchema>;

const HttpOutputSchema = z.object({
  status: z.number(),
  headers: z.record(z.string(), z.string()),
  data: z.unknown(),
});

type HttpOutput = z.infer<typeof HttpOutputSchema>;

const httpNode: NodeDefinition<HttpInput, HttpOutput> = {
  name: 'http',
  description: 'Make HTTP requests to external APIs',
  version: '1.0.0',
  inputSchema: HttpInputSchema,
  outputSchema: HttpOutputSchema,
  retryPolicy: {
    maxAttempts: 3,
    initialInterval: 1000,
    backoffCoefficient: 2,
    nonRetryableErrorTypes: ['VALIDATION_ERROR'],
  },

  async execute(input: HttpInput, context: NodeContext): Promise<HttpOutput> {
    const { url, method, headers, body, timeout, responseType } = input;
    const { logger } = context;

    logger.info(`Making ${method} request to ${url}`);

    try {
      const fetchOptions: globalThis.RequestInit = {
        method,
        headers: headers as Record<string, string>,
        signal: AbortSignal.timeout(timeout),
      };

      if (body && method !== 'GET') {
        fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
        if (!headers?.['Content-Type'] && !headers?.['content-type']) {
          fetchOptions.headers = {
            ...fetchOptions.headers,
            'Content-Type': 'application/json',
          };
        }
      }

      const response = await fetch(url, fetchOptions);

      let data: unknown;
      if (responseType === 'json') {
        const text = await response.text();
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = text;
        }
      } else {
        data = await response.text();
      }

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      logger.info(`HTTP request completed with status ${response.status}`);

      if (!response.ok) {
        throw new NodeExecutionError(
          'http',
          `HTTP ${response.status}: ${response.statusText}`,
          'NETWORK_ERROR',
          { status: response.status, url, data }
        );
      }

      return {
        status: response.status,
        headers: responseHeaders,
        data,
      };
    } catch (error) {
      if (error instanceof NodeExecutionError) throw error;

      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new NodeExecutionError(
          'http',
          `Request timed out after ${timeout}ms`,
          'TIMEOUT_ERROR',
          { url, timeout }
        );
      }

      throw new NodeExecutionError(
        'http',
        error instanceof Error ? error.message : 'Unknown error',
        'EXECUTION_ERROR',
        { url }
      );
    }
  },
};

export default httpNode;
