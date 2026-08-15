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
        $escapedPath = (Get-Location).Path -replace '\\','\\' -replace '"','\"'
        $ts = Get-Date -Format "o"

        $entry = "{""timestamp"":""$ts"",""source"":""terminal"",""content"":""$escapedContent"",""project_path"":""$escapedPath""}"
        Add-Content -LiteralPath $global:__sessionmem_queue -Value $entry
    }
    "PS $($executionContext.SessionState.Path.CurrentLocation)$('>' * ($nestedPromptLevel + 1)) "
}
# <<< sessionmem hook <<<
