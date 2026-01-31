import { proxyActivities } from '@temporalio/workflow';
import type { StepDefinition, StepResult, ExecutorNodeContext, NodeActivityResult, CodeNodeResult, TemplateContext } from '../types/index.js';
import { parseDurationToMs, renderValue, evaluateCondition } from './utils.js';

/**
 * Configuration for step execution.
 */
interface StepExecutorConfig {
  taskQueue: string;
  workflowId: string;
  workflowName: string;
}

/**
 * Handles execution of individual workflow steps.
 */
export class StepExecutor {
  private readonly config: StepExecutorConfig;

  constructor(config: StepExecutorConfig) {
    this.config = config;
  }

  /**
   * Check if a step should be skipped due to failed/skipped dependencies.
   */
  checkDependencies(
    dependencies: Set<string>,
    results: Record<string, StepResult>
  ): { shouldSkip: boolean; reason?: string } {
    const failedOrSkippedDep = Array.from(dependencies).find(depId => {
      const depStatus = results[depId]?.status;
      return depStatus === 'failed' || depStatus === 'skipped';
    });

    if (failedOrSkippedDep) {
      const depStatus = results[failedOrSkippedDep]?.status;
      return {
        shouldSkip: true,
        reason: `Skipped due to ${depStatus} dependency: ${failedOrSkippedDep}`
      };
    }

    return { shouldSkip: false };
  }

  /**
   * Check if a step should be skipped due to unmet 'when' condition.
   */
  checkCondition(
    step: StepDefinition,
    templateContext: TemplateContext
  ): { shouldSkip: boolean; reason?: string } {
    if (!step.when) {
      return { shouldSkip: false };
    }

    if (!evaluateCondition(step.when, templateContext)) {
      return {
        shouldSkip: true,
        reason: `Skipped due to unmet condition: ${step.when}`
      };
    }

    return { shouldSkip: false };
  }

  /**
   * Prepare the input for an activity by rendering templates.
   */
  prepareInput(
    step: StepDefinition,
    templateContext: TemplateContext
  ): Record<string, unknown> {
    if (!step.input) {
      return {};
    }
    return renderValue(step.input, templateContext) as Record<string, unknown>;
  }

  /**
   * Build the NodeContext for activity execution.
   */
  buildNodeContext(
    stepId: string,
    inputs: Record<string, unknown>,
    results: Record<string, StepResult>,
    stepInput?: Record<string, unknown>
  ): ExecutorNodeContext {
    return {
      workflowInputs: stepInput ? { ...inputs, __stepInput__: stepInput } : inputs,
      stepResults: Object.entries(results).reduce((acc, [id, result]) => ({
        ...acc,
        [id]: result?.output
      }), {} as Record<string, unknown>),
      workflow: { id: this.config.workflowId, name: this.config.workflowName },
      step: { id: stepId, attempt: 1 },
    };
  }

  /**
   * Create an activity proxy with the configured retry policy.
   */
  createActivityProxy(step: StepDefinition): Record<string, (input: unknown) => Promise<unknown>> {
    return proxyActivities<Record<string, (input: unknown) => Promise<unknown>>>({
      startToCloseTimeout: parseDurationToMs(step.timeout?.startToClose ?? '1 hour'),
      taskQueue: this.config.taskQueue,
      retry: {
        initialInterval: parseDurationToMs(step.retry?.initialInterval ?? '1s'),
        backoffCoefficient: step.retry?.backoffCoefficient ?? 2.0,
        maximumAttempts: step.retry?.maximumAttempts ?? 
          (step.retry?.count !== undefined ? step.retry.count + 1 : 2),
        maximumInterval: parseDurationToMs('5 minutes'),
      },
    });
  }

  /**
   * Execute a code-type step.
   */
  async executeCodeStep(
    step: StepDefinition,
    stepId: string,
    nodeContext: ExecutorNodeContext
  ): Promise<unknown> {
    if (!step.code) {
      throw new Error(`Step '${stepId}' is of type 'code' but missing 'code' field`);
    }

    const proxy = this.createActivityProxy(step);
    const codeResult = await proxy.code({
      input: {
        code: step.code,
        timeout: step.timeout?.startToClose ? parseDurationToMs(step.timeout.startToClose) : 30000,
      },
      context: nodeContext,
    }) as CodeNodeResult;

    return codeResult.result.result;
  }

  /**
   * Execute an activity-type step.
   */
  async executeActivityStep(
    step: StepDefinition,
    stepId: string,
    activityInput: Record<string, unknown>,
    nodeContext: ExecutorNodeContext
  ): Promise<unknown> {
    const activityName = step.activity;
    if (!activityName || typeof activityName !== 'string') {
      throw new Error(`Invalid activity name for step '${stepId}'`);
    }

    const proxy = this.createActivityProxy(step);
    const nodeResult = await proxy[activityName]({
      input: activityInput,
      context: nodeContext,
    }) as NodeActivityResult;

    return nodeResult.result;
  }
}
