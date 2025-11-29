// Sample activities that can be used in workflows
/**
 * Activity Implementations
 * 
 * Collection of reusable activity functions for workflows.
 * These are demo/example activities - replace with your own business logic.
 * 
 * Activities run in the worker process and can:
 * - Make external API calls
 * - Access databases
 * - Perform I/O operations
 * - Use non-deterministic operations (random, Date.now(), etc.)
 */

import vm from 'vm';

/**
 * Built-in modules available to code steps.
 * These provide common utilities without requiring external dependencies.
 */
const ALLOWED_MODULES: Record<string, any> = {
  // Add commonly used modules here
  // Users can extend this by modifying the activities file
};

/**
 * Executes JavaScript code in a sandboxed environment.
 * Similar to n8n's code node functionality.
 */
export interface ExecuteCodeInput {
  /** The JavaScript code to execute */
  code: string;
  /** Input data available as `input` in the code */
  input: Record<string, any>;
  /** Workflow context available as `context` in the code */
  context: {
    inputs: Record<string, any>;
    steps: Record<string, any>;
  };
  /** Execution timeout in milliseconds (default: 30000) */
  timeout?: number;
}

export interface ExecuteCodeOutput {
  /** The return value from the code execution */
  result: any;
  /** Console logs captured during execution */
  logs: string[];
  /** Execution time in milliseconds */
  executionTime: number;
}

/**
 * Safely executes JavaScript code in a VM sandbox.
 * Provides access to input data, workflow context, and limited built-in modules.
 */
async function executeCode(params: ExecuteCodeInput): Promise<ExecuteCodeOutput> {
  const { code, input, context, timeout = 30000 } = params;
  const logs: string[] = [];
  const startTime = Date.now();

  // Create a custom console that captures logs
  const customConsole = {
    log: (...args: any[]) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
    info: (...args: any[]) => logs.push(`[INFO] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`),
    warn: (...args: any[]) => logs.push(`[WARN] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`),
    error: (...args: any[]) => logs.push(`[ERROR] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`),
    debug: (...args: any[]) => logs.push(`[DEBUG] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`),
  };

  // Create a limited require function
  const limitedRequire = (moduleName: string) => {
    if (ALLOWED_MODULES[moduleName]) {
      return ALLOWED_MODULES[moduleName];
    }
    throw new Error(`Module '${moduleName}' is not available. Allowed modules: ${Object.keys(ALLOWED_MODULES).join(', ') || 'none'}`);
  };

  // Create the sandbox context with available utilities
  const sandbox = {
    input,
    context,
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
    // Async utilities
    setTimeout: (fn: Function, ms: number) => {
      // Wrap setTimeout to work in VM context
      return new Promise(resolve => setTimeout(() => resolve(fn()), ms));
    },
    // Result placeholder
    __result__: undefined as any,
  };

  // Add error tracking to sandbox
  const extendedSandbox = {
    ...sandbox,
    __error__: undefined as any,
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
    const vmContext = vm.createContext(extendedSandbox);
    
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

    while (!extendedSandbox.__completed__ && waited < maxWait) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      waited += pollInterval;
    }

    // Check for errors that occurred during async execution
    if (extendedSandbox.__error__) {
      const errorMessage = extendedSandbox.__error__.message || String(extendedSandbox.__error__);
      logs.push(`[EXECUTION ERROR] ${errorMessage}`);
      throw new Error(`Code execution failed: ${errorMessage}`);
    }

    const executionTime = Date.now() - startTime;

    return {
      result: extendedSandbox.__result__,
      logs,
      executionTime,
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Add error to logs if not already added
    if (!logs.some(log => log.includes('[EXECUTION ERROR]'))) {
      logs.push(`[EXECUTION ERROR] ${errorMessage}`);
    }
    
    throw new Error(`Code execution failed: ${errorMessage}`);
  }
}

export const activities = {
  /**
   * Executes JavaScript code in a sandboxed VM environment.
   * This is the core activity for 'code' type steps.
   */
  executeCode,

  // Creates a new user with the provided details
  async createUser(input: {
    name: string;
    email: string;
    role?: string;
  }): Promise<{ userId: string; status: string }> {
    console.log('Creating user:', input);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    return {
      userId: `user_${Math.random().toString(36).substring(2, 10)}`,
      status: 'active',
    };
  },

  // Sends an email to the specified recipient
  async sendEmail(input: {
    to: string;
    subject: string;
    body: string;
  }): Promise<{ messageId: string; status: string }> {
    console.log(`Sending email to: ${input.to}`);
    console.log(`Subject: ${input.subject}`);
    console.log('Body:', input.body);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      messageId: `msg_${Math.random().toString(36).substring(2, 10)}`,
      status: 'sent',
    };
  },

  // Waits for a specified duration
  async wait(input: { duration: string }): Promise<{ waitedFor: string }> {
    const duration = parseDurationToMs(input.duration);
    console.log(`Waiting for ${duration}ms`);
    await new Promise(resolve => setTimeout(resolve, duration));
    return { waitedFor: input.duration };
  },

  // Validates user input
  async validateInput(input: {
    data: any;
    rules: Record<string, any>;
  }): Promise<{ isValid: boolean; errors?: string[] }> {
    console.log('Validating input:', input);
    // Simulate validation
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Simple validation example
    const errors: string[] = [];
    if (input.rules.required) {
      for (const field of input.rules.required) {
        if (input.data[field] === undefined || input.data[field] === '') {
          errors.push(`Field '${field}' is required`);
        }
      }
    }
    
    return {
      isValid: errors.length === 0,
      ...(errors.length > 0 && { errors })
    };
  },

  // Processes a payment
  async processPayment(input: {
    amount: number;
    currency: string;
    paymentMethod: string;
    description?: string;
  }): Promise<{ transactionId: string; status: string }> {
    console.log(`Processing payment of ${input.amount} ${input.currency}`);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Simulate random failure (10% chance)
    if (Math.random() < 0.1) {
      throw new Error('Payment processing failed: Insufficient funds');
    }
    
    return {
      transactionId: `txn_${Math.random().toString(36).substring(2, 15)}`,
      status: 'completed',
    };
  },

  // Logs a message
  async logMessage(input: { level: 'info' | 'warn' | 'error'; message: string; context?: any }): Promise<void> {
    const timestamp = new Date().toISOString();
    const message = `[${timestamp}] [${input.level.toUpperCase()}] ${input.message}`;
    
    if (input.context) {
      console[input.level](message, input.context);
    } else {
      console[input.level](message);
    }
  },

  // Fetches data from an API
  async fetchData(input: {
    url: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
    body?: any;
  }): Promise<{ status: number; data: any }> {
    console.log(`Fetching ${input.method || 'GET'} ${input.url}`);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Simulate response
    return {
      status: 200,
      data: {
        id: Math.random().toString(36).substring(2, 10),
        url: input.url,
        timestamp: new Date().toISOString(),
      },
    };
  },
};

// Helper function to parse duration strings like '5s', '1m', '2h' to milliseconds
function parseDurationToMs(duration: string): number {
  const match = duration.match(/^(\d+)([smh])?$/);
  if (!match) return 0;
  
  const value = parseInt(match[1], 10);
  const unit = match[2] || 'ms';
  
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    default: return value;
  }
}
