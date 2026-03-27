import axios, { AxiosError } from 'axios';
import { spawn } from 'node:child_process';
import { AccountInfo } from './manager';

export interface ProviderResponse {
  data: any;
  status: number;
  headers: any;
}

export abstract class Provider {
  abstract forward(requestData: any, account: AccountInfo, path: string, headers: any): Promise<ProviderResponse>;
  abstract isQuotaExhausted(error: any): boolean;
}

export class OpenAIProvider extends Provider {
  private baseUrl: string = 'https://chatgpt.com/backend-api';
  private format: string;

  constructor(format: string = 'openai') {
    super();
    this.format = format;
  }

  async forward(requestData: any, account: AccountInfo, _path: string, _headers: any): Promise<ProviderResponse> {
    const { access_token, chatgpt_account_id } = account;
    
    if (!access_token || !chatgpt_account_id) {
      throw new Error(`Missing auth for ${account.email}`);
    }

    try {
      const headers: any = {
        'Authorization': `Bearer ${access_token}`,
        'OpenAI-Account-Id': chatgpt_account_id,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/event-stream'
      };

      if (account.cookies) {
        headers['Cookie'] = account.cookies;
      }

      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}/conversation`,
        data: requestData,
        headers,
        responseType: 'stream'
      });

      return {
        data: response.data,
        status: response.status,
        headers: response.headers
      };
    } catch (error) {
      throw error;
    }
  }

  isQuotaExhausted(error: any): boolean {
    if (error instanceof AxiosError) {
      if (error.response?.status === 429) return true;
      const body = error.response?.data;
      if (typeof body === 'string' && body.includes('insufficient_quota')) return true;
      if (body && body.detail && body.detail.includes('quota')) return true;
    }
    return false;
  }
}

export class GenericOpenAIProvider extends Provider {
  private name: string;
  private baseUrl: string;
  private apiKey: string;
  private format: string;

  constructor(name: string, baseUrl: string, apiKey: string, format: string = 'openai') {
    super();
    this.name = name;
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.apiKey = apiKey;
    this.format = format;
  }

  async forward(requestData: any, _account: AccountInfo, path: string, headers: any): Promise<ProviderResponse> {
    try {
      const forwardHeaders = { ...headers };
      delete forwardHeaders.host;
      delete forwardHeaders.connection;
      delete forwardHeaders['content-length'];
      
      forwardHeaders['Authorization'] = `Bearer ${this.apiKey}`;
      forwardHeaders['HTTP-Referer'] = 'https://github.com/Loongphy/codex-auth-proxy';
      forwardHeaders['X-Title'] = 'Codex Auth Proxy';

      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}${path}`,
        data: requestData,
        headers: forwardHeaders,
        responseType: 'stream'
      });

      return {
        data: response.data,
        status: response.status,
        headers: response.headers
      };
    } catch (error) {
      throw error;
    }
  }

  isQuotaExhausted(error: any): boolean {
    if (error instanceof AxiosError) {
      if (error.response?.status === 429) return true;
      const body = error.response?.data;
      if (body && (body.error?.code === 'insufficient_quota' || body.error?.type === 'insufficient_quota')) return true;
      if (typeof body === 'string' && body.includes('insufficient_quota')) return true;
    }
    return false;
  }

  getName() { return this.name; }
}
