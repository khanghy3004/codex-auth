# Codex Auth Proxy

![command list](https://github.com/user-attachments/assets/6c13a2d6-f9da-47ea-8ec8-0394fc072d40)

`codex-auth-proxy` is a high-performance, native command-line tool for managing and rotating Codex/ChatGPT accounts with built-in load balancing.

> [!IMPORTANT]
> **New in v0.3.0**: This tool has been rewritten in Zig for maximum performance and is now completely independent of the legacy `codex` CLI. It features a transparent proxy with automatic provider rotation.

## Key Features

- **🚀 Native Performance**: Rewritten in Zig 0.13.0, providing a tiny, fast, and dependency-free binary.
- **🔄 Smart Rotation**: Automatically rotates through multiple ChatGPT accounts and custom providers (like OpenRouter/DeepSeek) when rate limits are reached.
- **⚖️ Load Balancing**: Built-in round-robin load balancing across all active providers.
- **🛠️ Self-Configuring**: One-click integration with your `~/.codex/config.toml` via `config provider enable`.
- **📦 Cross-Platform**: First-class support for Linux, macOS (Intel/M1/M2), and Windows (x64).
- **🔒 Secure & Private**: Directly interacts with OpenAI APIs; no third-party servers involved.

## Install

### via npm (Recommended)

```shell
npm install -g codex-auth-proxy
```

### Manual Build (from Source)

Requires [Zig 0.13.0](https://ziglang.org/download/):

```shell
zig build -Doptimize=ReleaseSafe
cp zig-out/bin/codex-auth-proxy /usr/local/bin/
```

## Quick Start

1. **Login**: Add your accounts directly.
   ```shell
   codex-auth-proxy login
   ```
2. **Add Custom Providers**: Create `~/.codex/providers.json`.
   ```json
   {
     "providers": [
       {
         "name": "my-provider",
         "baseUrl": "https://api.example.com/v1",
         "apiKey": "sk-..."
       }
     ]
   }
   ```
3. **Enable Proxy Integration**:
   ```shell
   codex-auth-proxy config provider enable
   ```
4. **Start the Proxy**:
   ```shell
   codex-auth-proxy start
   ```

## Commands

### Account & Provider Management

| Command | Description |
|---------|-------------|
| `list` | Show all accounts and custom providers with real-time status |
| `status` | Display current auto-switch, usage API, and provider status |
| `login` | Interactive sign-in to add a new ChatGPT account |
| `switch` | Manually toggle the active primary account |
| `remove` | Interactively delete accounts from the registry |
| `clean` | Cleanup stale session and backup files |

### Local Proxy Engine

| Command | Description |
|---------|-------------|
| `start [<port>]` | Launch the rotation proxy (default: 8080) |
| `stop [<port>]` | Stop the proxy running on a specific port |
| `config provider enable` | Automatically register proxy in `config.toml` |
| `config provider disable` | Remove proxy registration from `config.toml` |

### Advanced Configuration

| Command | Description |
|---------|-------------|
| `config auto enable\|disable` | Toggle background usage monitoring |
| `config auto --5h <%>` | Set thresholds for automatic account switching |
| `config api enable\|disable` | Toggle direct OpenAI usage API polling |

## How the Proxy Works

`codex-auth-proxy` acts as a transparent middleware between your IDE (Cursor, VS Code) and AI providers:

1. **Request Interception**: Receives standard OpenAI/Codex API calls.
2. **Dynamic Selection**: Picks the best available account or provider using round-robin logic.
3. **Automatic Fallback**: If a provider returns a `429` (Rate Limit) or `403` (Forbidden), it immediately retries with the next one.
4. **Streaming Support**: Full support for Server-Sent Events (SSE) ensures a smooth typing experience.
5. **Token Tracking**: Transparently logs token usage for every request.

## Development

The project is split into two parts:
- **Core (Zig)**: Handles CLI, registry management, account crypto, and OS integration.
- **Proxy (Node.js/TS)**: Handles high-concurrency HTTP traffic and streaming logic.

### Building
```bash
# Build native core
zig build

# Build proxy
npm install
npm run build
```

## License

MIT - Use at your own risk.

---

**Disclaimer**: This tool is not affiliated with OpenAI. Using automated tools to access ChatGPT APIs may violate their Terms of Service.
