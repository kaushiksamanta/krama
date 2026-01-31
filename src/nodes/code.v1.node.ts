import { z } from 'zod';
import vm from 'vm';
import { NodeDefinition, NodeContext } from '../types/node.js';

// ============================================================
// Code Node v1
// ============================================================

// Define input schema with Zod
const CodeInputSchema = z.object({
  code: z.string().min(1, 'Code is required'),
  timeout: z.number().min(0).max(300000).default(30000),
});

// Infer TypeScript type from schema
type CodeInput = z.infer<typeof CodeInputSchema>;

// Define output schema with Zod
const CodeOutputSchema = z.object({
  result: z.unknown(),
  logs: z.array(z.string()),
  executionTime: z.number(),
});

type CodeOutput = z.infer<typeof CodeOutputSchema>;

/**
 * Built-in modules available to code steps.
 */
const ALLOWED_MODULES: Record<string, unknown> = {};

const codeNode: NodeDefinition<CodeInput, CodeOutput> = {
  name: 'code',
  description: 'Execute inline JavaScript code in a sandboxed environment',
  version: '1.0.0',
  inputSchema: CodeInputSchema,
  outputSchema: CodeOutputSchema,
  retryPolicy: {
    maxAttempts: 1, // No retry by default for code execution
  },

  async execute(input: CodeInput, context: NodeContext): Promise<CodeOutput> {
    const { code, timeout } = input;
    const { logger, workflowInputs, stepResults } = context;
    const logs: string[] = [];
    const startTime = Date.now();

    logger.info('Starting code execution');

    // Create a custom console that captures logs
    const customConsole = {
      log: (...args: unknown[]) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
      info: (...args: unknown[]) => logs.push(`[INFO] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`),
      warn: (...args: unknown[]) => logs.push(`[WARN] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`),
      error: (...args: unknown[]) => logs.push(`[ERROR] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`),
      debug: (...args: unknown[]) => logs.push(`[DEBUG] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`),
    };

    // Create a limited require function
    const limitedRequire = (moduleName: string) => {
      if (ALLOWED_MODULES[moduleName]) {
        return ALLOWED_MODULES[moduleName];
      }
      throw new Error(`Module '${moduleName}' is not available. Allowed modules: ${Object.keys(ALLOWED_MODULES).join(', ') || 'none'}`);
    };

    // Extract step input from workflowInputs (passed as __stepInput__)
    const stepInput = (workflowInputs as Record<string, unknown>).__stepInput__ ?? {};
    
    // Build context for code execution (aliases for convenience)
    const codeContext = {
      inputs: workflowInputs,
      steps: stepResults,
      workflowInputs,
      stepResults,
    };

    // Create the sandbox context with available utilities
    const sandbox = {
      input: stepInput, // Step input data available as `input` in code
      context: codeContext,
      console: customConsole,
      require: limitedRequire,
      // Built-in JavaScript globals
      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Error,
      Map,
      Set,
      Promise,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      encodeURI,
      decodeURI,
      crypto: globalThis.crypto,
      // Async utilities
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      // Result placeholder
      __result__: undefined as unknown,
      __error__: undefined as unknown,
      __completed__: false,
    };

    // Wrap the code in an async IIFE to support await and return
    const wrappedCode = `
      (async () => {
        ${code}
      })().then(r => { __result__ = r; __completed__ = true; }).catch(e => { __error__ = e; __completed__ = true; });
    `;

    try {
      // Create VM context
      const vmContext = vm.createContext(sandbox);
      
      // Compile and run the script
      const script = new vm.Script(wrappedCode, {
        filename: 'workflow-code-step.js',
      });

      // Run the script with timeout
      script.runInContext(vmContext, { timeout });

      // Wait for async execution to complete
      const maxWait = timeout;
      const pollInterval = 10;
      let waited = 0;

      while (!sandbox.__completed__ && waited < maxWait) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        waited += pollInterval;
      }

      // Check for errors that occurred during async execution
      if (sandbox.__error__) {
        const errorMessage = sandbox.__error__ instanceof Error 
          ? sandbox.__error__.message 
          : String(sandbox.__error__);
        logs.push(`[EXECUTION ERROR] ${errorMessage}`);
        throw new Error(`Code execution failed: ${errorMessage}`);
      }

      const executionTime = Date.now() - startTime;
      logger.info(`Code execution completed in ${executionTime}ms`);

      return {
        result: sandbox.__result__,
        logs,
        executionTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Add error to logs if not already added
      if (!logs.some(log => log.includes('[EXECUTION ERROR]'))) {
        logs.push(`[EXECUTION ERROR] ${errorMessage}`);
      }
      
      logger.error(`Code execution failed: ${errorMessage}`);
      throw new Error(`Code execution failed: ${errorMessage}`);
    }
  },
};

export default codeNode;
