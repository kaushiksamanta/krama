import { describe, it, expect } from 'vitest';
import { WorkflowDAG, validateWorkflow } from '../src/toposort.js';
import type { StepDefinition } from '../src/types.js';

const makeSteps = (partial: Partial<StepDefinition>[]): StepDefinition[] => {
  return partial.map((p, idx) => ({
    id: p.id ?? `step-${idx}`,
    activity: p.activity ?? 'noop',
    input: p.input,
    dependsOn: p.dependsOn,
    retry: p.retry,
  }));
};

describe('WorkflowDAG', () => {
  it('computes a valid topological order for a simple DAG', () => {
    const steps = makeSteps([
      { id: 'a' },
      { id: 'b', dependsOn: ['a'] },
      { id: 'c', dependsOn: ['b'] },
    ]);

    const dag = new WorkflowDAG(steps);
    const order = dag.getExecutionOrder();

    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
  });

  it('allows parallel branches in the DAG', () => {
    const steps = makeSteps([
      { id: 'root' },
      { id: 'left', dependsOn: ['root'] },
      { id: 'right', dependsOn: ['root'] },
    ]);

    const dag = new WorkflowDAG(steps);
    const order = dag.getExecutionOrder();

    expect(order[0]).toBe('root');
    expect(new Set(order.slice(1))).toEqual(new Set(['left', 'right']));
  });

  it('exposes dependents and dependencies correctly', () => {
    const steps = makeSteps([
      { id: 'a' },
      { id: 'b', dependsOn: ['a'] },
      { id: 'c', dependsOn: ['b'] },
    ]);

    const dag = new WorkflowDAG(steps);

    expect(dag.getDependencies('c')).toEqual(new Set(['a', 'b']));
    expect(dag.getDependents('a')).toEqual(new Set(['b', 'c']));
  });

  it('returns undefined for unknown step in getStep', () => {
    const steps = makeSteps([{ id: 'only' }]);
    const dag = new WorkflowDAG(steps);
    expect(dag.getStep('missing')).toBeUndefined();
  });
});

describe('validateWorkflow', () => {
  it('does not throw for a valid DAG', () => {
    const steps = makeSteps([
      { id: 'a' },
      { id: 'b', dependsOn: ['a'] },
    ]);

    expect(() => validateWorkflow(steps)).not.toThrow();
  });

  it('throws for duplicate step IDs', () => {
    const steps = makeSteps([
      { id: 'dup' },
      { id: 'dup' },
    ]);

    expect(() => new WorkflowDAG(steps)).toThrow(/Duplicate step ID/);
    expect(() => validateWorkflow(steps)).toThrow(/Duplicate step ID/);
  });

  it('throws for undefined dependency', () => {
    const steps = makeSteps([
      { id: 'a', dependsOn: ['missing'] },
    ]);

    expect(() => validateWorkflow(steps)).toThrow(/depends on undefined step 'missing'/);
  });

  it('throws for cycles in the workflow', () => {
    const steps = makeSteps([
      { id: 'a', dependsOn: ['c'] },
      { id: 'b', dependsOn: ['a'] },
      { id: 'c', dependsOn: ['b'] },
    ]);

    expect(() => validateWorkflow(steps)).toThrow(/Invalid workflow/);
  });
});
