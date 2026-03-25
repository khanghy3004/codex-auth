import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface AccountInfo {
  account_key: string;
  email: string;
  alias: string;
  type: 'chatgpt' | 'custom';
  access_token?: string;
  chatgpt_account_id?: string;
  baseUrl?: string; // For custom providers
  exhausted_until?: number; // timestamp in ms
}

export class AccountManager {
  private accounts: AccountInfo[] = [];
  private codexHome: string;

  constructor() {
    this.codexHome = path.join(os.homedir(), '.codex');
    this.loadAccounts();
    this.loadCustomProviders();
  }

  public loadAccounts() {
    const registryPath = path.join(this.codexHome, 'registry.json');
    if (!fs.existsSync(registryPath)) return;

    try {
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      const accountRecords = registry.accounts || [];
      
      const chatgptAccounts = accountRecords.map((rec: any) => ({
        account_key: rec.account_key,
        email: rec.email,
        alias: rec.alias,
        type: 'chatgpt' as const,
        exhausted_until: 0
      }));

      for (const account of chatgptAccounts) {
        this.loadTokenForAccount(account);
      }
      this.accounts.push(...chatgptAccounts);
    } catch (error) {
      console.error('Failed to load registry:', error);
    }
  }

  public loadCustomProviders() {
    const providersPath = path.join(this.codexHome, 'providers.json');
    if (!fs.existsSync(providersPath)) return;

    try {
      const providers = JSON.parse(fs.readFileSync(providersPath, 'utf8'));
      const customOnes = (providers.providers || []).map((p: any) => ({
        account_key: `custom_${p.name}`,
        email: p.name,
        alias: p.name,
        type: 'custom' as const,
        access_token: p.apiKey,
        baseUrl: p.baseUrl,
        exhausted_until: 0
      }));
      this.accounts.push(...customOnes);
      console.log(`Loaded ${customOnes.length} custom providers.`);
    } catch (error) {
      console.error('Failed to load custom providers:', error);
    }
  }

  private loadTokenForAccount(account: AccountInfo) {
    const authPath = path.join(this.codexHome, 'accounts', `${account.account_key}.auth.json`);
    if (fs.existsSync(authPath)) {
      try {
        const authData = JSON.parse(fs.readFileSync(authPath, 'utf8'));
        account.access_token = authData.access_token;
        account.chatgpt_account_id = authData.chatgpt_account_id;
      } catch (error) {
        console.error(`Failed to load auth for ${account.email}:`, error);
      }
    }
  }

  private currentChatGPTIndex: number = -1;
  private currentCustomIndex: number = -1;

  public getNextAvailableAccount(): AccountInfo | null {
    const now = Date.now();
    const available = this.accounts.filter(a => !a.exhausted_until || a.exhausted_until < now);

    if (available.length === 0) return null;

    // 1. Prioritize ChatGPT accounts
    const availableChatGPT = available.filter(a => a.type === 'chatgpt');
    if (availableChatGPT.length > 0) {
      this.currentChatGPTIndex = (this.currentChatGPTIndex + 1) % availableChatGPT.length;
      return availableChatGPT[this.currentChatGPTIndex];
    }

    // 2. Fallback to custom providers
    const availableCustom = available.filter(a => a.type === 'custom');
    if (availableCustom.length > 0) {
      this.currentCustomIndex = (this.currentCustomIndex + 1) % availableCustom.length;
      return availableCustom[this.currentCustomIndex];
    }

    return null;
  }

  public markExhausted(accountKey: string, durationMinutes: number = 20) {
    const account = this.accounts.find(a => a.account_key === accountKey);
    if (account) {
      account.exhausted_until = Date.now() + durationMinutes * 60 * 1000;
      console.log(`Account ${account.email} marked as exhausted until ${new Date(account.exhausted_until).toLocaleTimeString()}`);
    }
  }

  public getAllAccounts() {
    return this.accounts;
  }
}
