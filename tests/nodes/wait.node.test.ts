import { describe, it, expect } from 'vitest';
import waitNode from '../../src/nodes/wait.v1.node.js';
import { createMockContext } from '../helpers/node-test-utils.js';

describe('wait node', () => {
  it('has correct metadata', () => {
    expect(waitNode.name).toBe('wait');
    expect(waitNode.version).toBe('1.0.0');
    expect(typeof waitNode.execute).toBe('function');
  });

  it('waits for specified milliseconds', async () => {
    const context = createMockContext();
    const startTime = Date.now();

    const result = await waitNode.execute({ duration: 50 }, context);

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeGreaterThanOrEqual(45); // Allow small variance
    expect(result.waitedFor).toBeGreaterThanOrEqual(45);
    expect(result.resumedAt).toBeDefined();
  });

  it('parses duration strings', async () => {
    const context = createMockContext();

    // Test seconds
    const startTime = Date.now();
    await waitNode.execute({ duration: '1s' }, context);
    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeGreaterThanOrEqual(950);
    expect(elapsed).toBeLessThan(1500);
  }, 3000);

  it('validates input schema', () => {
    expect(waitNode.inputSchema).toBeDefined();

    // Valid - number
    const validNumber = waitNode.inputSchema?.safeParse({ duration: 1000 });
    expect(validNumber?.success).toBe(true);

    // Valid - string format
    const validString = waitNode.inputSchema?.safeParse({ duration: '5s' });
    expect(validString?.success).toBe(true);

    // Valid - minutes
    const validMinutes = waitNode.inputSchema?.safeParse({ duration: '1m' });
    expect(validMinutes?.success).toBe(true);

    // Valid - hours
    const validHours = waitNode.inputSchema?.safeParse({ duration: '2h' });
    expect(validHours?.success).toBe(true);

    // Valid - days
    const validDays = waitNode.inputSchema?.safeParse({ duration: '1d' });
    expect(validDays?.success).toBe(true);

    // Invalid - wrong format
    const invalidFormat = waitNode.inputSchema?.safeParse({ duration: '5x' });
    expect(invalidFormat?.success).toBe(false);

    // Invalid - negative number
    const invalidNegative = waitNode.inputSchema?.safeParse({ duration: -100 });
    expect(invalidNegative?.success).toBe(false);
  });

  it('returns ISO timestamp for resumedAt', async () => {
    const context = createMockContext();

    const result = await waitNode.execute({ duration: 10 }, context);

    // Check ISO format
    expect(() => new Date(result.resumedAt)).not.toThrow();
    expect(new Date(result.resumedAt).toISOString()).toBe(result.resumedAt);
  });
});
