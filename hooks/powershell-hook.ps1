# >>> sessionmem hook >>>
# Logs every command to ~/.sessionmem/queue.jsonl for later flush to SQLite.
# Install: copy this block into $PROFILE, then restart your shell or run `. $PROFILE`
# Remove: delete everything between the >>> and <<< sentinel lines.

$global:__sessionmem_last_hist_id = -1
$global:__sessionmem_queue = Join-Path $env:USERPROFILE ".sessionmem\queue.jsonl"

# Ensure the queue directory exists (one-time on profile load, not per-prompt)
$__smQueueDir = Split-Path $global:__sessionmem_queue
if (-not (Test-Path $__smQueueDir)) {
    New-Item -ItemType Directory -Path $__smQueueDir -Force | Out-Null
}

# Set restrictive ACL on queue file at creation — owner-only read/write.
# Closes the "any local user can read live secrets in the queue" gap.
if (-not (Test-Path $global:__sessionmem_queue)) {
    New-Item -ItemType File -Path $global:__sessionmem_queue -Force | Out-Null
    icacls $global:__sessionmem_queue /inheritance:r /grant:r "${env:USERNAME}:(M)" 2>$null | Out-Null
}

function prompt {
    $lastCmd = Get-History -Count 1
    if ($lastCmd -and $lastCmd.Id -ne $global:__sessionmem_last_hist_id) {
        $global:__sessionmem_last_hist_id = $lastCmd.Id

        # Escape backslashes and double-quotes for valid JSON
        $escapedContent = $lastCmd.CommandLine -replace '\\','\\' -replace '"','\"'

        # Resolve project root: walk up to nearest .git instead of raw cwd
        $__smDir = (Get-Location).Path
        while ($__smDir -and -not (Test-Path (Join-Path $__smDir '.git'))) {
            $__smParent = Split-Path $__smDir -Parent
            if ($__smParent -eq $__smDir) { break }  # filesystem root
            $__smDir = $__smParent
        }
        $escapedPath = $__smDir -replace '\\','\\' -replace '"','\"'
        # UTC with Z-suffix — must match Node's .toISOString() format.
        # SQLite compares timestamps as raw strings; mixing offsets (+05:00)
        # with Z-suffix breaks lexicographic ordering.
        $ts = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffffffZ")

        $entry = "{""timestamp"":""$ts"",""source"":""terminal"",""content"":""$escapedContent"",""project_path"":""$escapedPath""}"
        Add-Content -LiteralPath $global:__sessionmem_queue -Value $entry
    }
    "PS $($executionContext.SessionState.Path.CurrentLocation)$('>' * ($nestedPromptLevel + 1)) "
}
# <<< sessionmem hook <<<
