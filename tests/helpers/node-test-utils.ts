import { vi } from 'vitest';
import { NodeContext, NodeLogger } from '../../src/nodes/types.js';

/**
 * Create a mock NodeContext for testing nodes in isolation.
 */
export function createMockContext(overrides?: Partial<NodeContext>): NodeContext {
  return {
    workflowInputs: {},
    stepResults: {},
    workflow: { id: 'test-workflow', name: 'Test Workflow' },
    step: { id: 'test-step', attempt: 1 },
    logger: createMockLogger(),
    ...overrides,
  };
}

/**
 * Create a mock logger that captures log calls for assertions.
 */
export function createMockLogger(): NodeLogger & {
  calls: { level: string; message: string; args: unknown[] }[];
} {
  const calls: { level: string; message: string; args: unknown[] }[] = [];

  return {
    calls,
    debug: vi.fn((message: string, ...args: unknown[]) => {
      calls.push({ level: 'debug', message, args });
    }),
    info: vi.fn((message: string, ...args: unknown[]) => {
      calls.push({ level: 'info', message, args });
    }),
    warn: vi.fn((message: string, ...args: unknown[]) => {
      calls.push({ level: 'warn', message, args });
    }),
    error: vi.fn((message: string, ...args: unknown[]) => {
      calls.push({ level: 'error', message, args });
    }),
  };
}

/**
 * Create a mock context with specific workflow inputs.
 */
export function createMockContextWithInputs(
  inputs: Record<string, unknown>,
  overrides?: Partial<NodeContext>
): NodeContext {
  return createMockContext({
    workflowInputs: inputs,
    ...overrides,
  });
}

/**
 * Create a mock context with specific step results.
 */
export function createMockContextWithStepResults(
  stepResults: Record<string, unknown>,
  overrides?: Partial<NodeContext>
): NodeContext {
  return createMockContext({
    stepResults,
    ...overrides,
  });
}
