import { describe, it, expect } from 'vitest';
import codeNode from '../src/nodes/code.v1.node.js';
import { createMockContext } from './helpers/node-test-utils.js';
import { loadWorkflowDefinition, validateWorkflowSteps } from '../src/loader.js';
import type { StepDefinition } from '../src/types.js';

async function executeCode(params: {
  code: string;
  input: Record<string, unknown>;
  context: { inputs: Record<string, unknown>; steps: Record<string, unknown> };
  timeout?: number;
}) {
  const ctx = createMockContext({
    workflowInputs: { ...params.context.inputs, __stepInput__: params.input },
    stepResults: params.context.steps,
  });
  
  const result = await codeNode.execute(
    { code: params.code, timeout: params.timeout ?? 30000 },
    ctx
  );
  
  return result;
}

describe('executeCode activity', () => {
  it('executes simple JavaScript code and returns result', async () => {
    const result = await executeCode({
      code: 'return 1 + 2;',
      input: {},
      context: { inputs: {}, steps: {} },
    });

    expect(result.result).toBe(3);
    expect(result.executionTime).toBeGreaterThanOrEqual(0);
  });

  it('provides access to input data', async () => {
    const result = await executeCode({
      code: `
        const sum = input.numbers.reduce((a, b) => a + b, 0);
        return { sum, count: input.numbers.length };
      `,
      input: { numbers: [1, 2, 3, 4, 5] },
      context: { inputs: {}, steps: {} },
    });

    expect(result.result).toEqual({ sum: 15, count: 5 });
  });

  it('provides access to workflow context', async () => {
    const result = await executeCode({
      code: `
        return {
          workflowInput: context.inputs.userId,
          previousStepResult: context.steps.step1.value
        };
      `,
      input: {},
      context: {
        inputs: { userId: 'user-123' },
        steps: { step1: { value: 42 } },
      },
    });

    expect(result.result).toEqual({
      workflowInput: 'user-123',
      previousStepResult: 42,
    });
  });

  it('captures console.log output', async () => {
    const result = await executeCode({
      code: `
        console.log('Hello', 'World');
        console.info('Info message');
        console.warn('Warning message');
        console.error('Error message');
        return 'done';
      `,
      input: {},
      context: { inputs: {}, steps: {} },
    });

    expect(result.logs).toContain('Hello World');
    expect(result.logs).toContain('[INFO] Info message');
    expect(result.logs).toContain('[WARN] Warning message');
    expect(result.logs).toContain('[ERROR] Error message');
  });

  it('handles object transformation', async () => {
    const result = await executeCode({
      code: `
        const items = input.items.map(item => ({
          ...item,
          total: item.price * item.quantity,
          processed: true
        }));
        return { items, totalValue: items.reduce((sum, i) => sum + i.total, 0) };
      `,
      input: {
        items: [
          { name: 'A', price: 10, quantity: 2 },
          { name: 'B', price: 20, quantity: 3 },
        ],
      },
      context: { inputs: {}, steps: {} },
    });

    const res = result.result as { items: { total: number }[]; totalValue: number };
    expect(res.items).toHaveLength(2);
    expect(res.items[0].total).toBe(20);
    expect(res.items[1].total).toBe(60);
    expect(res.totalValue).toBe(80);
  });

  it('has access to built-in JavaScript globals', async () => {
    const result = await executeCode({
      code: `
        const obj = JSON.parse('{"a": 1}');
        const rounded = Math.round(3.7);
        const arr = Array.from([1, 2, 3]);
        const keys = Object.keys({ x: 1, y: 2 });
        return { obj, rounded, arr, keys };
      `,
      input: {},
      context: { inputs: {}, steps: {} },
    });

    const res = result.result as { obj: unknown; rounded: number; arr: number[]; keys: string[] };
    expect(res.obj).toEqual({ a: 1 });
    expect(res.rounded).toBe(4);
    expect(res.arr).toEqual([1, 2, 3]);
    expect(res.keys).toEqual(['x', 'y']);
  });

  it('throws error for invalid code', async () => {
    await expect(
      executeCode({
        code: 'throw new Error("Test error");',
        input: {},
        context: { inputs: {}, steps: {} },
      })
    ).rejects.toThrow('Code execution failed');
  });

  it('throws error for disallowed require', async () => {
    await expect(
      executeCode({
        code: 'const fs = require("fs"); return fs;',
        input: {},
        context: { inputs: {}, steps: {} },
      })
    ).rejects.toThrow("Module 'fs' is not available");
  });

  it('handles undefined return value', async () => {
    const result = await executeCode({
      code: 'const x = 1;', // No return statement
      input: {},
      context: { inputs: {}, steps: {} },
    });

    expect(result.result).toBeUndefined();
  });

  it('handles complex data structures', async () => {
    const result = await executeCode({
      code: `
        const map = new Map();
        map.set('key1', 'value1');
        const set = new Set([1, 2, 3]);
        return {
          mapSize: map.size,
          setSize: set.size,
          hasKey: map.has('key1'),
          hasValue: set.has(2)
        };
      `,
      input: {},
      context: { inputs: {}, steps: {} },
    });

    const res = result.result as { mapSize: number; setSize: number; hasKey: boolean; hasValue: boolean };
    expect(res.mapSize).toBe(1);
    expect(res.setSize).toBe(3);
    expect(res.hasKey).toBe(true);
    expect(res.hasValue).toBe(true);
  });
});

describe('Code step validation in loader', () => {
  it('validates code steps require code field', () => {
    const steps: StepDefinition[] = [
      {
        id: 'code_step',
        type: 'code',
        // Missing 'code' field
      },
    ];

    expect(() => validateWorkflowSteps(steps)).toThrow(
      "Step 'code_step' is of type 'code' but missing required 'code' field"
    );
  });

  it('validates activity steps require activity field', () => {
    const steps: StepDefinition[] = [
      {
        id: 'activity_step',
        type: 'activity',
        // Missing 'activity' field
      },
    ];

    expect(() => validateWorkflowSteps(steps)).toThrow(
      "Step 'activity_step' is missing required 'activity' field"
    );
  });

  it('accepts valid code step', () => {
    const steps: StepDefinition[] = [
      {
        id: 'valid_code_step',
        type: 'code',
        code: 'return 1 + 1;',
        input: { value: 10 },
      },
    ];

    expect(() => validateWorkflowSteps(steps)).not.toThrow();
  });

  it('accepts signal steps without activity or code', () => {
    const steps: StepDefinition[] = [
      {
        id: 'signal_step',
        type: 'signal',
      },
    ];

    expect(() => validateWorkflowSteps(steps)).not.toThrow();
  });

  it('accepts mixed step types in workflow', () => {
    const steps: StepDefinition[] = [
      {
        id: 'activity_step',
        activity: 'createUser',
        input: { name: 'Test' },
      },
      {
        id: 'code_step',
        type: 'code',
        code: 'return input.value * 2;',
        input: { value: 10 },
        dependsOn: ['activity_step'],
      },
      {
        id: 'signal_step',
        type: 'signal',
        dependsOn: ['code_step'],
      },
    ];

    expect(() => validateWorkflowSteps(steps)).not.toThrow();
  });
});

describe('DSL: data-processing.workflow.yaml (code steps)', () => {
  const dslPath = new URL('../dsl/data-processing.workflow.yaml', import.meta.url).pathname;

  it('loads and validates workflow with code steps', async () => {
    const def = await loadWorkflowDefinition(dslPath);

    expect(def.name).toBe('data-processing-pipeline');
    expect(def.steps.length).toBeGreaterThanOrEqual(4);
  });

  it('has code steps with proper structure', async () => {
    const def = await loadWorkflowDefinition(dslPath);

    const calculateTotals = def.steps.find(s => s.id === 'calculate_totals');
    const applyDiscounts = def.steps.find(s => s.id === 'apply_discounts');
    const generateReport = def.steps.find(s => s.id === 'generate_report');

    expect(calculateTotals).toBeDefined();
    expect(calculateTotals?.type).toBe('code');
    expect(calculateTotals?.code).toContain('processedOrders');

    expect(applyDiscounts).toBeDefined();
    expect(applyDiscounts?.type).toBe('code');
    expect(applyDiscounts?.dependsOn).toContain('calculate_totals');

    expect(generateReport).toBeDefined();
    expect(generateReport?.type).toBe('code');
    expect(generateReport?.dependsOn).toContain('apply_discounts');
  });

  it('has mixed step types (code + activity)', async () => {
    const def = await loadWorkflowDefinition(dslPath);

    const logResults = def.steps.find(s => s.id === 'log_results');

    expect(logResults).toBeDefined();
    expect(logResults?.activity).toBe('log');
    expect(logResults?.type).toBeUndefined(); // defaults to 'activity'
  });
});
