#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Install codex-auth-proxy from GitHub Releases.

Usage:
  ./scripts/install.sh [--repo <owner/repo>] [--version <tag|latest>] [--install-dir <dir>] [--no-add-to-path]

Options:
  --repo <owner/repo>  GitHub repo (default: loongphy/codex-auth-proxy)
  --version <value>    Release tag or 'latest' (default: latest)
  --install-dir <dir>  Install directory (default: $HOME/.local/bin)
  --add-to-path        Persist install dir to shell profile (default behavior)
  --no-add-to-path     Skip persisting install dir to shell profile
  -h, --help           Show help
EOF
}

INSTALL_DIR="${HOME}/.local/bin"
VERSION="latest"
REPO="loongphy/codex-auth-proxy"
ADD_TO_PATH=1
SHELL_NAME="$(basename "${SHELL:-}")"
PROFILE_FILE=""

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  C_RESET=$'\033[0m'
  C_BOLD=$'\033[1m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
  C_CYAN=$'\033[36m'
else
  C_RESET=""
  C_BOLD=""
  C_GREEN=""
  C_YELLOW=""
  C_CYAN=""
fi

print_color() {
  local color="$1"
  shift
  printf "%b\n" "${color}$*${C_RESET}"
}

print_success() {
  print_color "${C_BOLD}${C_GREEN}" "$*"
}

print_warn() {
  print_color "${C_BOLD}${C_YELLOW}" "$*"
}

print_info() {
  print_color "${C_CYAN}" "$*"
}

print_cmd() {
  print_color "${C_BOLD}${C_CYAN}" "$*"
}

detect_asset() {
  local os arch ext
  os="$(uname -s)"
  arch="$(uname -m)"

  case "${os}" in
    Linux) os="Linux"; ext="tar.gz" ;;
    Darwin) os="macOS"; ext="tar.gz" ;;
    *)
      echo "Unsupported OS: ${os}" >&2
      exit 1
      ;;
  esac

  case "${arch}" in
    x86_64|amd64) arch="X64" ;;
    arm64|aarch64) arch="ARM64" ;;
    *)
      echo "Unsupported architecture: ${arch}" >&2
      exit 1
      ;;
  esac

  echo "codex-auth-proxy-${os}-${arch}.${ext}"
}

normalize_path_entry() {
  local value="${1:-}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  if [[ "${value}" == "/" ]]; then
    printf "/"
    return
  fi
  while [[ "${value}" == */ && "${value}" != "/" ]]; do
    value="${value%/}"
  done
  printf "%s" "${value}"
}

path_contains_dir() {
  local target normalized_target
  target="${1}"
  normalized_target="$(normalize_path_entry "${target}")"
  IFS=':' read -r -a _segments <<< "${PATH:-}"
  for segment in "${_segments[@]}"; do
    if [[ "$(normalize_path_entry "${segment}")" == "${normalized_target}" ]]; then
      return 0
    fi
  done
  return 1
}

detect_profile_file() {
  local candidate

  if [[ "${SHELL_NAME}" == "fish" ]]; then
    printf "%s" "${HOME}/.config/fish/config.fish"
    return
  fi

  if [[ "${SHELL_NAME}" == "zsh" ]]; then
    for candidate in "${HOME}/.zshrc" "${HOME}/.zprofile" "${HOME}/.profile"; do
      if [[ -f "${candidate}" ]]; then
        printf "%s" "${candidate}"
        return
      fi
    done
    printf "%s" "${HOME}/.zshrc"
    return
  fi

  for candidate in "${HOME}/.bashrc" "${HOME}/.bash_profile" "${HOME}/.profile"; do
    if [[ -f "${candidate}" ]]; then
      printf "%s" "${candidate}"
      return
    fi
  done
  printf "%s" "${HOME}/.bashrc"
}

shell_display_name() {
  case "${SHELL_NAME}" in
    fish|zsh|bash) printf "%s" "${SHELL_NAME}" ;;
    *) printf "shell" ;;
  esac
}

persist_path_to_profile() {
  local profile path_line
  profile="$(detect_profile_file)"
  PROFILE_FILE="${profile}"
  mkdir -p "$(dirname "${profile}")"
  touch "${profile}"

  if grep -Fq "${INSTALL_DIR}" "${profile}"; then
    return
  fi

  if [[ "${SHELL_NAME}" == "fish" ]]; then
    {
      echo ""
      echo "# Added by codex-auth-proxy installer"
      echo "if not contains -- \"${INSTALL_DIR}\" \$PATH"
      echo "    set -gx PATH \"${INSTALL_DIR}\" \$PATH"
      echo "end"
    } >> "${profile}"
  else
    path_line="export PATH=\"${INSTALL_DIR}:\$PATH\""
    {
      echo ""
      echo "# Added by codex-auth-proxy installer"
      echo "${path_line}"
    } >> "${profile}"
  fi
}

print_shell_restart_hint() {
  case "${SHELL_NAME}" in
    fish)
      print_warn "Restart current shell:"
      print_cmd "  exec fish"
      ;;
    zsh)
      print_warn "Restart current shell:"
      print_cmd "  exec zsh -l"
      ;;
    bash)
      print_warn "Restart current shell:"
      print_cmd "  exec bash"
      ;;
    *)
      print_warn "Restart current shell by reopening your terminal."
      ;;
  esac
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO="$2"
      shift 2
      ;;
    --version)
      VERSION="$2"
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    --add-to-path)
      ADD_TO_PATH=1
      shift
      ;;
    --no-add-to-path)
      ADD_TO_PATH=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required." >&2
  exit 1
fi

ASSET="$(detect_asset)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

URL=""
if [[ "${VERSION}" == "latest" ]]; then
  URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"
else
  URL="https://github.com/${REPO}/releases/download/${VERSION}/${ASSET}"
fi

print_info "Downloading ${URL}"
curl -fL "${URL}" -o "${TMP_DIR}/${ASSET}"

BIN_PATH=""
case "${ASSET}" in
  *.tar.gz)
    tar -xzf "${TMP_DIR}/${ASSET}" -C "${TMP_DIR}"
    BIN_PATH="${TMP_DIR}/codex-auth-proxy"
    ;;
  *.zip)
    if command -v unzip >/dev/null 2>&1; then
      unzip -q "${TMP_DIR}/${ASSET}" -d "${TMP_DIR}"
      BIN_PATH="${TMP_DIR}/codex-auth-proxy"
    else
      echo "unzip is required to extract ${ASSET}" >&2
      exit 1
    fi
    ;;
esac

if [[ -z "${BIN_PATH}" || ! -f "${BIN_PATH}" ]]; then
  echo "Downloaded archive does not contain codex-auth-proxy binary." >&2
  exit 1
fi

mkdir -p "${INSTALL_DIR}"
DEST_BIN="${INSTALL_DIR}/codex-auth-proxy"

if command -v install >/dev/null 2>&1; then
  install -m 0755 "${BIN_PATH}" "${DEST_BIN}"
else
  cp "${BIN_PATH}" "${DEST_BIN}"
  chmod 0755 "${DEST_BIN}"
fi

print_success "codex-auth-proxy installed successfully!"
print_info "Path : ${DEST_BIN}"
CURRENT_PATH_MISSING=0
if path_contains_dir "${INSTALL_DIR}"; then
  :
else
  CURRENT_PATH_MISSING=1
fi

if [[ "${ADD_TO_PATH}" -eq 1 ]]; then
  persist_path_to_profile
fi

if [[ "${ADD_TO_PATH}" -eq 1 && -n "${PROFILE_FILE}" ]]; then
  if [[ "${CURRENT_PATH_MISSING}" -eq 0 ]]; then
    print_success "Ready for $(shell_display_name) (loaded via ${PROFILE_FILE})."
  else
    print_success "Ready for future $(shell_display_name) sessions (loaded via ${PROFILE_FILE})."
  fi
elif [[ "${CURRENT_PATH_MISSING}" -eq 0 ]]; then
  print_success "Ready in this terminal."
else
  print_warn "Not ready in this terminal yet."
fi

if [[ "${CURRENT_PATH_MISSING}" -eq 1 ]]; then
  print_warn "Use codex-auth-proxy immediately in this terminal with:"
  if [[ "${SHELL_NAME}" == "fish" ]]; then
    print_cmd "  set -gx PATH \"${INSTALL_DIR}\" \$PATH"
  else
    print_cmd "  export PATH=\"${INSTALL_DIR}:\$PATH\""
  fi
  if [[ "${ADD_TO_PATH}" -eq 1 && -n "${PROFILE_FILE}" ]]; then
    print_warn "Or reload your shell profile now:"
    print_cmd "  source \"${PROFILE_FILE}\""
    print_shell_restart_hint
  else
    print_info "Run again without --no-add-to-path to auto-load it in future $(shell_display_name) sessions."
  fi
fi
