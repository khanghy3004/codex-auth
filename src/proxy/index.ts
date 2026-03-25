import express, { Request, Response } from 'express';
import { PassThrough } from 'node:stream';
import { AccountManager } from './manager';
import { OpenAIProvider, GenericOpenAIProvider, ProviderResponse } from './providers';
import { AxiosError } from 'axios';

const app = express();
const port = process.env.PROXY_PORT || 8080;
const accountManager = new AccountManager();
const openaiProvider = new OpenAIProvider();

app.use(express.json());

app.post('/v1/chat/completions', async (req: Request, res: Response) => {
  await handleProxyRequest(req, res);
});

app.post('/v1/conversation', async (req: Request, res: Response) => {
  await handleProxyRequest(req, res);
});

app.post('/v1/responses', async (req: Request, res: Response) => {
  await handleProxyRequest(req, res);
});

async function handleProxyRequest(req: Request, res: Response) {
  let attempts = 0;
  const maxAttempts = 10; // Increased because there are more providers

  while (attempts < maxAttempts) {
    const account = accountManager.getNextAvailableAccount();
    if (!account) {
      res.status(402).json({ error: 'All accounts and providers are exhausted.' });
      return;
    }

    try {
      const model = req.body.model || 'unknown-model';
      console.log(`[Proxy] [${account.type}] [${account.email}] [Model: ${model}] (Attempt ${attempts + 1})`);
      
      let relativePath = req.path.startsWith('/v1') ? req.path.slice(3) : req.path;

      let response: ProviderResponse;
      if (account.type === 'chatgpt') {
        console.log(`[Proxy] [Debug] Forwarding to ChatGPT: ${relativePath}`);
        response = await openaiProvider.forward(req.body, account, relativePath, req.headers);
      } else {
        const fullUrl = `${account.baseUrl}${relativePath}`;
        console.log(`[Proxy] [Debug] Forwarding to Custom Provider: ${fullUrl}`);
        console.log(`[Proxy] [Debug] Request Body:`, JSON.stringify(req.body).slice(0, 500));
        
        const custom = new GenericOpenAIProvider(account.email, account.baseUrl!, account.access_token!);
        response = await custom.forward(req.body, account, relativePath, req.headers);
      }

      // Handle streaming response
      if (response.data && typeof response.data.pipe === 'function') {
        // Ensure SSE headers are set correctly for streaming
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        for (const [key, value] of Object.entries(response.headers)) {
          if (value !== undefined && !['content-type', 'cache-control', 'connection', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
             res.setHeader(key, value as string | string[]);
          }
        }
        
        // Use PassThrough as a middleman to observe the stream without affecting the main pipe
        const observer = new PassThrough();
        let totalUsage: any = null;
        let chunkCount = 0;
        
        console.log(`[Proxy] [Debug] Starting stream for ${account.email}`);

        observer.on('data', (chunk: any) => {
          chunkCount++;
          const content = chunk.toString();
          if (chunkCount === 1) {
            console.log(`[Proxy] [Debug] First chunk received (len: ${content.length}): ${content.slice(0, 50)}...`);
          }

          const lines = content.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
               const dataStr = line.slice(6).trim();
               if (dataStr === '[DONE]') {
                 console.log(`[Proxy] [Debug] [DONE] received`);
                 continue;
               }
               try {
                 const data = JSON.parse(dataStr);
                 if (data.usage) {
                   totalUsage = data.usage;
                   console.log(`[Proxy] [Debug] Usage found in stream:`, totalUsage);
                 }
               } catch {}
            }
          }
        });

        observer.on('end', () => {
          console.log(`[Proxy] [Debug] Stream OBSERVER ended (Total chunks: ${chunkCount})`);
          if (totalUsage) {
            console.log(`[Proxy] Usage: prompts=${totalUsage.prompt_tokens}, completion=${totalUsage.completion_tokens}, total=${totalUsage.total_tokens}`);
          }
        });

        observer.on('error', (err) => {
          console.error(`[Proxy] [Debug] Stream OBSERVER error:`, err);
        });

        // Single chain pipeline
        response.data.on('error', (err: any) => {
          console.error(`[Proxy] [Debug] Provider stream error:`, err);
        });

        response.data.on('close', () => {
          console.log(`[Proxy] [Debug] Provider stream closed`);
        });

        res.on('finish', () => {
          console.log(`[Proxy] [Debug] Client response finished`);
        });

        res.on('close', () => {
          console.log(`[Proxy] [Debug] Client response closed (was it canceled?)`);
        });

        response.data.pipe(observer).pipe(res);

        // Handle client disconnect
        req.on('close', () => {
          console.log(`[Proxy] [Debug] Client request closed`);
          response.data.destroy();
          observer.destroy();
        });

        return;
      } else {
        if (response.data.usage) {
          const u = response.data.usage;
          console.log(`[Proxy] Usage: prompts=${u.prompt_tokens}, completion=${u.completion_tokens}, total=${u.total_tokens}`);
        }
        console.log(`[Proxy] Response:`, JSON.stringify(response.data).slice(0, 500));
        res.status(response.status).json(response.data);
        return;
      }
    } catch (error) {
      if (openaiProvider.isQuotaExhausted(error)) {
        console.warn(`[Proxy] Account ${account.email} exhausted. Retrying...`);
        accountManager.markExhausted(account.account_key);
        attempts++;
      } else if (error instanceof AxiosError) {
        const status = error.response?.status || 500;
        const data = error.response?.data;
        
        console.error(`[Proxy] Provider Error (${status}): ${error.message}`);
        
        if (data && typeof data.pipe === 'function') {
          // If it's a stream error, it's hard to read and return at the same time without losing data,
          // but we can try to log the error message from the Axios error object.
          res.status(status).json({ error: error.message, status: status });
        } else {
          console.error(`[Proxy] Error Body:`, JSON.stringify(data).slice(0, 1000));
          res.status(status).json(data || { error: error.message });
        }
        return;
      } else {
        console.error(`[Proxy] Unexpected error:`, error);
        res.status(500).json({ error: 'Internal Server Error' });
        return;
      }
    }
  }

  res.status(429).json({ error: 'Max retry attempts reached.' });
}

export function startProxy() {
  app.listen(port, () => {
    console.log(`[Proxy] Codex Proxy Server started on http://localhost:${port}`);
    console.log(`[Proxy] Point your Codex client to http://localhost:${port}/v1`);
  });
}

if (require.main === module) {
  startProxy();
}
