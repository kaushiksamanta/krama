import { describe, it, expect } from 'vitest';
import logNode from '../../src/nodes/log.v1.node.js';
import { createMockContext, createMockLogger } from '../helpers/node-test-utils.js';

describe('log node', () => {
  it('has correct metadata', () => {
    expect(logNode.name).toBe('log');
    expect(logNode.version).toBe('1.0.0');
    expect(typeof logNode.execute).toBe('function');
  });

  it('logs info message', async () => {
    const mockLogger = createMockLogger();
    const context = createMockContext({ logger: mockLogger });

    const result = await logNode.execute(
      { message: 'Test message', level: 'info' },
      context
    );

    expect(result.loggedAt).toBeDefined();
    expect(mockLogger.info).toHaveBeenCalled();
    // Verify the structured log entry contains expected fields
    const logArg = mockLogger.info.mock.calls[0][0];
    const logEntry = JSON.parse(logArg);
    expect(logEntry.message).toBe('Test message');
    expect(logEntry.level).toBe('info');
    expect(logEntry.workflowId).toBe('test-workflow');
  });

  it('logs with different levels', async () => {
    const levels = ['debug', 'info', 'warn', 'error'] as const;

    for (const level of levels) {
      const mockLogger = createMockLogger();
      const context = createMockContext({ logger: mockLogger });

      await logNode.execute({ message: `${level} message`, level }, context);

      expect(mockLogger[level]).toHaveBeenCalled();
    }
  });

  it('logs with additional data', async () => {
    const mockLogger = createMockLogger();
    const context = createMockContext({ logger: mockLogger });

    await logNode.execute(
      { message: 'Test with data', level: 'info', data: { userId: 123 } },
      context
    );

    expect(mockLogger.info).toHaveBeenCalled();
    // Verify the structured log entry contains the data
    const logArg = mockLogger.info.mock.calls[0][0];
    const logEntry = JSON.parse(logArg);
    expect(logEntry.message).toBe('Test with data');
    expect(logEntry.data).toEqual({ userId: 123 });
  });

  it('validates input schema', () => {
    expect(logNode.inputSchema).toBeDefined();

    // Valid input
    const validResult = logNode.inputSchema?.safeParse({
      message: 'Hello',
      level: 'info',
    });
    expect(validResult?.success).toBe(true);

    // Invalid - empty message
    const invalidMessage = logNode.inputSchema?.safeParse({
      message: '',
      level: 'info',
    });
    expect(invalidMessage?.success).toBe(false);

    // Invalid level
    const invalidLevel = logNode.inputSchema?.safeParse({
      message: 'Hello',
      level: 'invalid',
    });
    expect(invalidLevel?.success).toBe(false);
  });
});
