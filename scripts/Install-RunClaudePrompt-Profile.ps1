$profilePath = $PROFILE
$profileDir = Split-Path -Parent $profilePath

if (-not (Test-Path $profileDir)) {
    New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
}

if (-not (Test-Path $profilePath)) {
    New-Item -ItemType File -Path $profilePath -Force | Out-Null
}

$functionBlock = @'
function Run-ClaudePrompt {
    param(
        [string]$PromptPath,
        [string]$PermissionMode = "bypassPermissions"
    )

    if (-not $PromptPath) {
        $kiroDir = Join-Path $env:APPDATA "Code\User\globalStorage\heisebaiyun.kiro-for-cc"
        if (-not (Test-Path $kiroDir)) {
            Write-Error "Kiro storage folder not found: $kiroDir"
            return
        }

        $latestPrompt = Get-ChildItem -Path $kiroDir -Filter "prompt-*.md" -File |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1

        if (-not $latestPrompt) {
            Write-Error "No Kiro prompt files found in: $kiroDir"
            return
        }

        $PromptPath = $latestPrompt.FullName
    }

    if (-not (Test-Path $PromptPath)) {
        Write-Error "Prompt file not found: $PromptPath"
        return
    }

    if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
        Write-Error "Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code"
        return
    }

    $prompt = Get-Content -Raw $PromptPath
    Write-Host "Using prompt file: $PromptPath"
    claude --permission-mode $PermissionMode "$prompt"
}
'@

$content = Get-Content -Raw $profilePath
if ($content -notmatch 'function\s+Run-ClaudePrompt\b') {
    Add-Content -Path $profilePath -Value "`r`n$functionBlock`r`n"
    Write-Output "Added Run-ClaudePrompt to profile: $profilePath"
} else {
    Write-Output "Run-ClaudePrompt already exists in profile: $profilePath"
}

Write-Output "Reload your shell or run: . $PROFILE"
