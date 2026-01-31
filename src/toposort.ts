/**
 * DAG Validation and Topological Sorting
 * 
 * Validates workflow step dependencies and provides topological ordering
 * for execution. Detects cycles, duplicate IDs, and undefined dependencies.
 */

import { DepGraph } from 'dependency-graph';
import { StepDefinition } from './types.js';

/**
 * Workflow DAG manager that validates and orders workflow steps.
 * 
 * Uses the dependency-graph library to:
 * - Detect duplicate step IDs
 * - Validate all dependencies exist
 * - Detect circular dependencies
 * - Provide topological execution order
 */
export class WorkflowDAG {
  private readonly graph: DepGraph<StepDefinition>;

  constructor(steps: StepDefinition[]) {
    this.graph = new DepGraph<StepDefinition>();

    const ids = new Set<string>();
    for (const step of steps) {
      if (ids.has(step.id)) {
        throw new Error(`Duplicate step ID: ${step.id}`);
      }
      ids.add(step.id);
      this.graph.addNode(step.id, step);
    }

    for (const step of steps) {
      for (const depId of step.dependsOn ?? []) {
        if (!this.graph.hasNode(depId)) {
          throw new Error(`Step '${step.id}' depends on undefined step '${depId}'`);
        }
        this.graph.addDependency(step.id, depId);
      }
    }
  }

  /**
   * Perform a topological sort of the steps.
   * Throws if there is a cycle.
   */
  getExecutionOrder(): string[] {
    return this.graph.overallOrder();
  }

  /**
   * Get all steps that depend on the given step (direct + transitive).
   */
  getDependents(stepId: string): Set<string> {
    if (!this.graph.hasNode(stepId)) {
      return new Set();
    }
    return new Set(this.graph.dependantsOf(stepId));
  }

  /**
   * Get all steps that the given step depends on (direct + transitive).
   */
  getDependencies(stepId: string): Set<string> {
    if (!this.graph.hasNode(stepId)) {
      return new Set();
    }
    return new Set(this.graph.dependenciesOf(stepId));
  }

  /**
   * Get step by ID.
   */
  getStep(stepId: string): StepDefinition | undefined {
    if (!this.graph.hasNode(stepId)) {
      return undefined;
    }
    return this.graph.getNodeData(stepId);
  }
}

export function validateWorkflow(steps: StepDefinition[]): void {
  try {
    const dag = new WorkflowDAG(steps);
    // This will throw on cycles or undefined dependencies
    dag.getExecutionOrder();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Invalid workflow: ${error.message}`);
    }
    throw error;
  }
}
