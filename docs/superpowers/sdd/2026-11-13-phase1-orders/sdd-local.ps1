# Local replication of superpowers SDD scripts (Windows/PowerShell) —
# the bash originals can't run here: WSL git cannot parse the Windows
# worktree gitdir. Same outputs, same layout:
#   <root>\.superpowers\sdd\<plan-basename>\task-N-brief.md
#   <root>\.superpowers\sdd\<plan-basename>\review-<base7>..<head7>.diff
param(
  [Parameter(Position = 0, Mandatory = $true)][string]$Command,
  [Parameter(Position = 1)][string]$Task,
  [Parameter(Position = 2)][string]$Base,
  [Parameter(Position = 3)][string]$Head
)
$ErrorActionPreference = "Stop"
$Root = "D:\fuego\.worktrees\phase-1-commandes"
$Ws = Join-Path $Root ".superpowers\sdd\2026-11-13-phase1-orders"
$Plan = Join-Path $Root "docs\superpowers\plans\2026-11-13-phase1-orders.md"

switch ($Command) {
  "brief" {
    $lines = Get-Content $Plan
    $start = -1; $end = $lines.Count
    for ($i = 0; $i -lt $lines.Count; $i++) {
      if ($lines[$i] -match '^###\s+Task\s+' -and $lines[$i] -match "Task\s+$([regex]::Escape($Task)):") {
        if ($start -eq -1) { $start = $i } else { $end = $i; break }
      }
    }
    if ($start -lt 0) { throw "task $Task not found" }
    $out = Join-Path $Ws "task-$Task-brief.md"
    $lines[$start..($end - 1)] | Set-Content $out -Encoding utf8
    Write-Output "wrote $out"
  }
  "review" {
    $b7 = git -C $Root rev-parse --short $Base
    $h7 = git -C $Root rev-parse --short $Head
    $out = Join-Path $Ws "review-$b7..$h7.diff"
    "# Review package: $Base..$Head" | Set-Content $out -Encoding utf8
    "" | Add-Content $out; "## Commits" | Add-Content $out
    git -C $Root log --oneline "$Base..$Head" | Add-Content $out
    "" | Add-Content $out; "## Files changed" | Add-Content $out
    git -C $Root diff --stat "$Base..$Head" | Add-Content $out
    "" | Add-Content $out; "## Diff" | Add-Content $out
    git -C $Root diff -U10 "$Base..$Head" | Add-Content $out -Encoding utf8
    Write-Output "wrote $out"
  }
  default { throw "unknown command: $Command (brief <N> | review <base> <head>)" }
}
