# >>> sessionmem hook >>>
# Logs every command to ~/.sessionmem/queue.jsonl for later flush to SQLite.
# Install: copy this block into $PROFILE, then restart your shell or run `. $PROFILE`
# Remove: delete everything between the >>> and <<< sentinel lines.

$global:__sessionmem_last_hist_id = -1
$global:__sessionmem_queue = Join-Path $env:USERPROFILE ".sessionmem\queue.jsonl"

# Ensure the queue directory exists (one-time on profile load, not per-prompt)
if (-not (Test-Path (Split-Path $global:__sessionmem_queue))) {
    New-Item -ItemType Directory -Path (Split-Path $global:__sessionmem_queue) -Force | Out-Null
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
        $ts = Get-Date -Format "o"

        $entry = "{""timestamp"":""$ts"",""source"":""terminal"",""content"":""$escapedContent"",""project_path"":""$escapedPath""}"
        Add-Content -LiteralPath $global:__sessionmem_queue -Value $entry
    }
    "PS $($executionContext.SessionState.Path.CurrentLocation)$('>' * ($nestedPromptLevel + 1)) "
}
# <<< sessionmem hook <<<
