import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface AccountInfo {
  account_key: string;
  email: string;
  alias: string;
  type: 'chatgpt' | 'custom';
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  chatgpt_account_id?: string;
  baseUrl?: string; // For custom providers
  exhausted_until?: number; // timestamp in ms
  cookies?: string; // Standard Cookie header string
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
    // Disabled: Only using custom providers
    /*
    const registryPath = path.join(this.codexHome, 'accounts', 'registry.json');
    if (!fs.existsSync(registryPath)) {
      return;
    }

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
      // ignore
    }
    */
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
      if (customOnes.length > 0) {
        console.log(`[AccountManager] Registered ${customOnes.length} custom providers.`);
      }
    } catch (error) {
      // ignore
    }
  }

  private loadTokenForAccount(account: AccountInfo) {
    const accountsDir = path.join(this.codexHome, 'accounts');
    if (!fs.existsSync(accountsDir)) return;

    const files = fs.readdirSync(accountsDir);
    const encodedKey = Buffer.from(account.account_key).toString('base64').replace(/=/g, '');
    
    // Search for both encoded and raw keys in the filenames
    const filename = files.find(f => 
      f.startsWith(encodedKey) || 
      f.startsWith(account.account_key)
    );

    if (filename) {
      const authPath = path.join(accountsDir, filename);
      try {
        const authData = JSON.parse(fs.readFileSync(authPath, 'utf8'));
        
        // Try to load extra cookies from a .cookies file if it exists
        let cookies = '';
        const cookiePath = authPath.replace('.auth.json', '.cookies');
        if (fs.existsSync(cookiePath)) {
          cookies = fs.readFileSync(cookiePath, 'utf-8').trim();
        }

        if (authData.tokens) {
          account.access_token = authData.tokens.access_token;
          account.id_token = authData.tokens.id_token;
          account.refresh_token = authData.tokens.refresh_token;
          account.chatgpt_account_id = authData.tokens.account_id || authData.tokens.user_id;
          account.cookies = cookies;
        } else {
          account.access_token = authData.access_token;
          account.chatgpt_account_id = authData.chatgpt_account_id;
          account.cookies = cookies;
        }
      } catch (error) {
        console.error(`Failed to load auth for ${account.email}:`, error);
      }
    } else {
      console.warn(`[AccountManager] No auth file found for ${account.email}`);
    }
  }

  private currentAccountIndex: number = -1;

  public getNextAvailableAccount(): AccountInfo | null {
    const now = Date.now();
    const available = this.accounts.filter(a => !a.exhausted_until || a.exhausted_until < now);

    if (available.length === 0) return null;

    this.currentAccountIndex = (this.currentAccountIndex + 1) % available.length;
    return available[this.currentAccountIndex];
  }

  public markExhausted(accountKey: string, durationMinutes: number = 20) {
    const account = this.accounts.find(a => a.account_key === accountKey);
    if (account) {
      account.exhausted_until = Date.now() + durationMinutes * 60 * 1000;
    }
  }

  public getAllAccounts() {
    return this.accounts;
  }
}
