import { describe, it, expect } from 'vitest';
import codeNode from '../../src/nodes/code.v1.node.js';
import { createMockContext } from '../helpers/node-test-utils.js';

describe('code node', () => {
  it('has correct metadata', () => {
    expect(codeNode.name).toBe('code');
    expect(codeNode.version).toBe('1.0.0');
    expect(typeof codeNode.execute).toBe('function');
  });

  it('executes simple code and returns result', async () => {
    const context = createMockContext();
    const result = await codeNode.execute(
      { code: 'return 42;', timeout: 5000 },
      context
    );

    expect(result.result).toBe(42);
    expect(result.executionTime).toBeGreaterThanOrEqual(0);
  });

  it('captures console.log output', async () => {
    const context = createMockContext();
    const result = await codeNode.execute(
      { code: 'console.log("hello"); return "done";', timeout: 5000 },
      context
    );

    expect(result.result).toBe('done');
    expect(result.logs).toContain('hello');
  });

  it('has access to context.inputs and context.steps', async () => {
    const context = createMockContext({
      workflowInputs: { name: 'John' },
      stepResults: { step1: { value: 100 } },
    });

    const result = await codeNode.execute(
      {
        code: `
          const name = context.inputs.name;
          const stepValue = context.steps.step1.value;
          return { name, stepValue };
        `,
        timeout: 5000,
      },
      context
    );

    expect(result.result).toEqual({ name: 'John', stepValue: 100 });
  });

  it('supports async code with await', async () => {
    const context = createMockContext();
    const result = await codeNode.execute(
      {
        code: `
          const delay = ms => new Promise(r => setTimeout(r, ms));
          await delay(10);
          return 'async done';
        `,
        timeout: 5000,
      },
      context
    );

    expect(result.result).toBe('async done');
  });

  it('throws error for invalid code', async () => {
    const context = createMockContext();

    await expect(
      codeNode.execute({ code: 'throw new Error("test error");', timeout: 5000 }, context)
    ).rejects.toThrow('test error');
  });

  it('validates input schema', () => {
    expect(codeNode.inputSchema).toBeDefined();

    const validResult = codeNode.inputSchema?.safeParse({ code: 'return 1;' });
    expect(validResult?.success).toBe(true);

    const invalidResult = codeNode.inputSchema?.safeParse({ code: '' });
    expect(invalidResult?.success).toBe(false);
  });
});
