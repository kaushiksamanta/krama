import { z } from 'zod';
import { NodeDefinition, NodeContext } from '../types/node.js';

const EmailRecipient = z.union([
  z.string().email(),
  z.array(z.string().email()).min(1),
]);

const AttachmentSchema = z.object({
  filename: z.string().min(1),
  content: z.string(), // Base64 encoded
  contentType: z.string().optional(),
});

const EmailInputSchema = z.object({
  to: EmailRecipient,
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Body is required'),
  from: z.string().email().optional(),
  cc: EmailRecipient.optional(),
  bcc: EmailRecipient.optional(),
  replyTo: z.string().email().optional(),
  attachments: z.array(AttachmentSchema).optional(),
});

type EmailInput = z.infer<typeof EmailInputSchema>;

const EmailOutputSchema = z.object({
  messageId: z.string(),
  status: z.enum(['sent', 'queued', 'simulated']),
});

type EmailOutput = z.infer<typeof EmailOutputSchema>;

const emailNode: NodeDefinition<EmailInput, EmailOutput> = {
  name: 'email',
  description: 'Send emails via configurable transport',
  version: '1.0.0',
  inputSchema: EmailInputSchema,
  outputSchema: EmailOutputSchema,
  retryPolicy: {
    maxAttempts: 2,
    initialInterval: 1000,
    nonRetryableErrorTypes: ['VALIDATION_ERROR', 'PERMISSION_ERROR'],
  },

  async execute(input: EmailInput, context: NodeContext): Promise<EmailOutput> {
    const { to, subject, body, from, cc, bcc, replyTo, attachments } = input;
    const { logger } = context;

    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    const toList = Array.isArray(to) ? to : [to];
    const ccList = cc ? (Array.isArray(cc) ? cc : [cc]) : [];
    const bccList = bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : [];

    logger.info(`Sending email to: ${toList.join(', ')}`);
    logger.info(`Subject: ${subject}`);

    if (!smtpHost || !smtpUser || !smtpPass) {
      logger.warn('SMTP not configured. Simulating email send.');
      
      await new Promise(resolve => setTimeout(resolve, 500));

      const messageId = `simulated_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      
      console.log('=== SIMULATED EMAIL ===');
      console.log(`From: ${from || 'noreply@krama.local'}`);
      console.log(`To: ${toList.join(', ')}`);
      if (ccList.length > 0) console.log(`CC: ${ccList.join(', ')}`);
      if (bccList.length > 0) console.log(`BCC: ${bccList.join(', ')}`);
      if (replyTo) console.log(`Reply-To: ${replyTo}`);
      console.log(`Subject: ${subject}`);
      console.log(`Body:\n${body}`);
      if (attachments && attachments.length > 0) {
        console.log(`Attachments: ${attachments.map(a => a.filename).join(', ')}`);
      }
      console.log('=== END EMAIL ===');

      return {
        messageId,
        status: 'simulated',
      };
    }

    logger.warn('SMTP configured but actual sending not yet implemented. Simulating email send.');
    
    await new Promise(resolve => setTimeout(resolve, 500));
    const messageId = `simulated_smtp_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    console.log('=== SIMULATED EMAIL (SMTP configured) ===');
    console.log(`From: ${from || smtpUser}`);
    console.log(`To: ${toList.join(', ')}`);
    if (ccList.length > 0) console.log(`CC: ${ccList.join(', ')}`);
    if (bccList.length > 0) console.log(`BCC: ${bccList.join(', ')}`);
    if (replyTo) console.log(`Reply-To: ${replyTo}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:\n${body}`);
    if (attachments && attachments.length > 0) {
      console.log(`Attachments: ${attachments.map(a => a.filename).join(', ')}`);
    }
    console.log('=== END EMAIL ===');

    return {
      messageId,
      status: 'simulated',
    };
  },
};

export default emailNode;
