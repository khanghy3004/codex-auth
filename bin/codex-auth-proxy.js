#!/usr/bin/env node

const path = require("node:path");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const rootPackageJsonPath = path.join(__dirname, "..", "package.json");

const packageMap = {
  "linux:x64": "@loongphy/codex-auth-linux-x64",
  "darwin:x64": "@loongphy/codex-auth-darwin-x64",
  "darwin:arm64": "@loongphy/codex-auth-darwin-arm64",
  "win32:x64": "@loongphy/codex-auth-win32-x64"
};

function readRootPackage() {
  try {
    return JSON.parse(fs.readFileSync(rootPackageJsonPath, "utf8"));
  } catch {
    return null;
  }
}

function maybePrintVersion(argv) {
  if (argv.length !== 1) return false;
  if (argv[0] !== "--version" && argv[0] !== "-V") return false;

  const rootPackage = readRootPackage();
  if (!rootPackage) return false;

  const previewLabel = rootPackage.codexAuthPreviewLabel;
  const version = rootPackage.version || "0.0.0";
  
  if (previewLabel) {
    process.stdout.write(`codex-auth-proxy ${version} (preview ${previewLabel})\n`);
  } else {
    process.stdout.write(`codex-auth-proxy ${version}\n`);
  }
  return true;
}

if (maybePrintVersion(process.argv.slice(2))) {
  process.exit(0);
}

const args = process.argv.slice(2);

function killPort(port) {
  try {
    if (process.platform === "win32") {
      spawnSync("powershell", ["-Command", `Stop-Process -Id (Get-NetTCPConnection -LocalPort ${port}).OwningProcess -Force`], { stdio: "ignore" });
    } else {
      spawnSync("fuser", ["-k", `${port}/tcp`], { stdio: "ignore" });
    }
  } catch (err) {
    // Ignore errors
  }
}

if (args[0] === "stop") {
  const port = args[1] && !isNaN(Number(args[1])) ? Number(args[1]) : 8080;
  console.log(`Stopping proxy on port ${port}...`);
  killPort(port);
  console.log("Done.");
  process.exit(0);
}

if (args[0] === "start" || args[0] === "proxy") {
  const customPort = args[1] && !isNaN(Number(args[1])) ? Number(args[1]) : 8080;
  
  // Auto-kill existing process on this port
  killPort(customPort);

  const proxyPath = path.join(__dirname, "..", "dist", "src", "proxy", "index.js");
  if (!fs.existsSync(proxyPath)) {
    console.warn("Proxy component not built. Running build...");
    spawnSync("npm", ["run", "build"], { stdio: "inherit", cwd: path.join(__dirname, "..") });
  }
  const proxy = require(proxyPath);
  if (proxy && typeof proxy.startProxy === "function") {
    proxy.startProxy(customPort);
  } else {
    console.error("Proxy component is missing startProxy function.");
    process.exit(1);
  }
  return;
}

function resolveBinary() {
  // Prefer local binary in bin/ if it's the native version (not this script itself)
  const localBinaryPath = path.join(__dirname, "codex-auth-proxy");
  if (fs.existsSync(localBinaryPath) && !localBinaryPath.endsWith(".js") && process.platform !== "win32") {
    try {
      const stats = fs.statSync(localBinaryPath);
      // Check if it's executable and not a directory
      if (stats.isFile() && (stats.mode & 0o111)) {
         return localBinaryPath;
      }
    } catch {}
  }

  const key = `${process.platform}:${process.arch}`;
  const packageName = packageMap[key];
  if (!packageName) {
    console.error(`Unsupported platform: ${process.platform}/${process.arch}`);
    process.exit(1);
  }

  try {
    const packageRoot = path.dirname(require.resolve(`${packageName}/package.json`));
    const binaryName = process.platform === "win32" ? "codex-auth.exe" : "codex-auth";
    const binaryPath = path.join(packageRoot, "bin", binaryName);
    if (!fs.existsSync(binaryPath)) {
      console.error(`Missing binary inside ${packageName}: ${binaryPath}`);
      process.exit(1);
    }
    return binaryPath;
  } catch (error) {
    console.error(
      `Missing platform package ${packageName}. Reinstall @loongphy/codex-auth on ${process.platform}/${process.arch}.`
    );
    if (error && error.message) {
      console.error(error.message);
    }
    process.exit(1);
  }
}

const binaryPath = resolveBinary();
const child = spawnSync(binaryPath, process.argv.slice(2), {
  stdio: ["inherit", "pipe", "inherit"]
});

if (child.stdout) {
  let output = child.stdout.toString();
  const args = process.argv.slice(2);
  const isHelp = args.length === 0 || args[0] === "help" || args.includes("--help") || args.includes("-h");
  const isVersion = args.includes("--version") || args.includes("-V");
  
  if (isHelp || isVersion) {
    const rootPackage = readRootPackage();
    if (rootPackage && rootPackage.version) {
       // Replace version in header: "codex-auth 0.2.2-alpha.4" -> "codex-auth-proxy 0.1.0"
       output = output.replace(/codex-auth-proxy \d+\.\d+\.\d+[^ \n]*/g, `codex-auth-proxy ${rootPackage.version}`);
       output = output.replace(/codex-auth \d+\.\d+\.\d+[^ \n]*/g, `codex-auth-proxy ${rootPackage.version}`);
    }
    
    if (isHelp) {
      const startCmd = "  start [<port>]          Start the local proxy server (default: 8080)";
      const stopCmd = "  stop [<port>]           Stop any proxy running on a port (default: 8080)";
      if (output.includes("Commands:")) {
         output = output.replace("Commands:\n", `Commands:\n\n${startCmd}\n${stopCmd}\n`);
      }
    }
  }
  process.stdout.write(output);
}

if (child.error) {
  console.error(child.error.message);
  process.exit(1);
}

if (child.signal) {
  process.kill(process.pid, child.signal);
} else {
  process.exit(child.status ?? 1);
}
