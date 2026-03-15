param(
    [string]$PromptPath,
    [string]$PermissionMode = "bypassPermissions"
)

if (-not $PromptPath) {
    $kiroDir = Join-Path $env:APPDATA "Code\User\globalStorage\heisebaiyun.kiro-for-cc"
    if (-not (Test-Path $kiroDir)) {
        Write-Error "Kiro storage folder not found: $kiroDir"
        exit 1
    }

    $latestPrompt = Get-ChildItem -Path $kiroDir -Filter "prompt-*.md" -File |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if (-not $latestPrompt) {
        Write-Error "No Kiro prompt files found in: $kiroDir"
        exit 1
    }

    $PromptPath = $latestPrompt.FullName
}

if (-not (Test-Path $PromptPath)) {
    Write-Error "Prompt file not found: $PromptPath"
    exit 1
}

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Error "Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code"
    exit 1
}

$prompt = Get-Content -Raw $PromptPath
Write-Host "Using prompt file: $PromptPath"
claude --permission-mode $PermissionMode "$prompt"
