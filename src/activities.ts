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

export const activities = {
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
