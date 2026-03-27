import express, { Request, Response } from 'express';
import { PassThrough } from 'node:stream';
import { AccountManager, AccountInfo } from './manager';
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

app.post('/v1/completions', async (req: Request, res: Response) => {
  await handleProxyRequest(req, res);
});

async function handleProxyRequest(req: Request, res: Response) {
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    const account = accountManager.getNextAvailableAccount();
    if (!account) {
      res.status(402).json({ error: 'All providers are exhausted.' });
      return;
    }

    try {
      const model = req.body.model || 'unknown-model';
      console.log(`[Proxy] [${account.type}] [${account.email}] [Model: ${model}]`);
      
      const relativePath = req.path.startsWith('/v1') ? req.path.slice(3) : req.path;
      const isNative = relativePath === '/responses' || relativePath === '/response' || relativePath === '/conversation';
      const format = isNative ? 'native' : 'openai';

      let response: ProviderResponse;
      if (account.type === 'chatgpt') {
        const provider = new OpenAIProvider(format);
        response = await provider.forward(req.body, account, relativePath, req.headers);
      } else {
        const body = { ...req.body };
        if (body.stream) {
          body.stream_options = { include_usage: true };
        }
        const provider = new GenericOpenAIProvider(account.email, account.baseUrl!, account.access_token!, format);
        response = await provider.forward(body, account, relativePath, req.headers);
      }

      if (response.data && typeof response.data.pipe === 'function') {
        const contentType = format === 'native' ? 'application/json' : 'text/event-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        for (const [key, value] of Object.entries(response.headers)) {
          if (value !== undefined && !['content-type', 'cache-control', 'connection', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
             res.setHeader(key, value as string | string[]);
          }
        }
        
        let totalUsage: any = null;
        let buffer = '';
        
        // Search headers for usage (some providers like OpenRouter or LiteLLM might send it here)
        const usageHeaders = ['x-usage', 'openai-usage', 'x-tokens-used'];
        for (const h of usageHeaders) {
           if (response.headers[h]) {
              try {
                const parseH = typeof response.headers[h] === 'string' ? JSON.parse(response.headers[h]) : response.headers[h];
                totalUsage = totalUsage || parseH;
              } catch {}
           }
        }

        response.data.on('data', (chunk: any) => {
          const chunkStr = chunk.toString();
          buffer += chunkStr;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            
            let data: any = null;
            if (trimmed.startsWith('data: ')) {
               const dataStr = trimmed.slice(6).trim();
               if (dataStr === '[DONE]') continue;
               try { data = JSON.parse(dataStr); } catch {}
            } else {
               try { data = JSON.parse(trimmed); } catch {}
            }
            if (!data) continue;

            if (data.usage) {
               totalUsage = data.usage;
            } else if (data.response && data.response.usage) {
               totalUsage = data.response.usage;
            } else if (data.input_tokens || data.prompt_tokens) {
               totalUsage = totalUsage || {};
               totalUsage.prompt_tokens = data.prompt_tokens || data.input_tokens;
               totalUsage.completion_tokens = data.completion_tokens || data.output_tokens;
               totalUsage.total_tokens = data.total_tokens || ((totalUsage.prompt_tokens || 0) + (totalUsage.completion_tokens || 0));
            } else if (data.response && data.response.status_details && data.response.status_details.usage) {
               totalUsage = data.response.status_details.usage;
            }
          }
        });

        response.data.on('end', () => {
          if (totalUsage) {
            const p = totalUsage.prompt_tokens || totalUsage.input_tokens;
            const c = totalUsage.completion_tokens || totalUsage.output_tokens;
            const t = totalUsage.total_tokens || (p + (c || 0));
            console.log(`[Proxy] Usage: prompts=${p}, completion=${c}, total=${t}`);
          }
        });

        response.data.pipe(res);
        req.on('close', () => response.data.destroy());
        return;
      } else {
        res.status(response.status).json(response.data);
        return;
      }
    } catch (error) {
      if (openaiProvider.isQuotaExhausted(error) || (error instanceof AxiosError && error.response?.status === 403)) {
        accountManager.markExhausted(account.account_key, 20);
        attempts++;
        continue;
      }

      const status = (error instanceof AxiosError) ? (error.response?.status || 500) : 500;
      const data = (error instanceof AxiosError) ? error.response?.data : null;
      res.status(status).json(data || { error: (error as Error).message });
      return;
    }
  }

  res.status(429).json({ error: 'Max retry attempts reached.' });
}

export function startProxy(customPort?: number) {
  const finalPort = customPort || Number(port);
  app.listen(finalPort, () => {
    console.log(`[Proxy] Codex Proxy Server started on http://localhost:${finalPort}`);
    console.log(`[Proxy] Point your Codex client to http://localhost:${finalPort}/v1`);
  });
}

if (require.main === module) {
  startProxy();
}
