import { defineSignal, setHandler, condition } from '@temporalio/workflow';
import { WorkflowDAG } from '../toposort.js';
import { StepExecutor } from './StepExecutor.js';
import { buildTemplateContext } from './utils.js';
import type { ExecutorWorkflowDefinition, StepResult, WorkflowContext } from '../types/index.js';

/**
 * Signal to cancel workflow execution.
 */
export const cancelSignal = defineSignal('cancel');

/**
 * Signal to deliver payloads to signal-type steps.
 */
export const stepSignal = defineSignal<[stepId: string, payload: unknown]>('step');

/**
 * Orchestrates the execution of a workflow DAG.
 */
export class WorkflowExecutor {
  private readonly dag: WorkflowDAG;
  private readonly stepExecutor: StepExecutor;
  private readonly results: Record<string, StepResult> = {};
  private readonly context: WorkflowContext;
  private readonly signalResults: Record<string, unknown> = {};
  private isCancelled = false;

  constructor(definition: ExecutorWorkflowDefinition) {
    this.dag = new WorkflowDAG(definition.steps);
    this.context = {
      inputs: definition.inputs ?? {},
      results: {},
    };
    this.stepExecutor = new StepExecutor({
      taskQueue: definition.taskQueue,
      workflowId: definition.workflowId,
      workflowName: definition.workflowName ?? 'Workflow',
    });

    this.setupSignalHandlers();
  }

  /**
   * Set up signal handlers for cancellation and step signals.
   */
  private setupSignalHandlers(): void {
    setHandler(cancelSignal, () => {
      this.isCancelled = true;
    });

    setHandler(stepSignal, (stepId: string, payload: unknown) => {
      this.signalResults[stepId] = payload;
    });
  }

  /**
   * Execute the workflow and return results.
   */
  async execute(): Promise<Record<string, StepResult>> {
    const executionOrder = this.dag.getExecutionOrder();

    for (const stepId of executionOrder) {
      if (this.isCancelled) {
        break;
      }

      await this.executeStep(stepId);
    }

    return this.results;
  }

  /**
   * Execute a single step.
   */
  private async executeStep(stepId: string): Promise<void> {
    const step = this.dag.getStep(stepId);
    if (!step) return;

    const stepResult: StepResult = {
      id: stepId,
      status: 'completed',
      attempt: 0,
    };

    try {
      const dependencies = this.dag.getDependencies(stepId);
      const depCheck = this.stepExecutor.checkDependencies(dependencies, this.context.results);
      if (depCheck.shouldSkip) {
        this.skipStep(stepResult, depCheck.reason!);
        this.saveResult(stepId, stepResult);
        return;
      }

      const templateContext = buildTemplateContext(this.context.inputs, this.context.results);

      const conditionCheck = this.stepExecutor.checkCondition(step, templateContext);
      if (conditionCheck.shouldSkip) {
        this.skipStep(stepResult, conditionCheck.reason!);
        this.saveResult(stepId, stepResult);
        return;
      }

      const activityInput = this.stepExecutor.prepareInput(step, templateContext);

      if (step.type === 'signal') {
        await this.executeSignalStep(stepId, stepResult);
      } else if (step.type === 'code') {
        const nodeContext = this.stepExecutor.buildNodeContext(
          stepId, this.context.inputs, this.context.results, activityInput
        );
        stepResult.output = await this.stepExecutor.executeCodeStep(step, stepId, nodeContext);
      } else {
        const nodeContext = this.stepExecutor.buildNodeContext(
          stepId, this.context.inputs, this.context.results
        );
        stepResult.output = await this.stepExecutor.executeActivityStep(
          step, stepId, activityInput, nodeContext
        );
      }
    } catch (error) {
      stepResult.status = 'failed';
      stepResult.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.saveResult(stepId, stepResult);
    }
  }

  /**
   * Execute a signal-type step.
   */
  private async executeSignalStep(stepId: string, stepResult: StepResult): Promise<void> {
    await condition(() => this.isCancelled || stepId in this.signalResults);

    if (this.isCancelled && !(stepId in this.signalResults)) {
      stepResult.status = 'skipped';
      stepResult.error = 'Skipped because workflow was cancelled before signal was received';
    } else {
      stepResult.output = this.signalResults[stepId];
    }
  }

  /**
   * Mark a step as skipped.
   * Note: saveResult is called in the finally block of executeStep, not here.
   */
  private skipStep(stepResult: StepResult, reason: string): void {
    stepResult.status = 'skipped';
    stepResult.error = reason;
  }

  /**
   * Save step result to both results and context.
   */
  private saveResult(stepId: string, stepResult: StepResult): void {
    this.results[stepId] = stepResult;
    this.context.results[stepId] = stepResult;
  }
}
