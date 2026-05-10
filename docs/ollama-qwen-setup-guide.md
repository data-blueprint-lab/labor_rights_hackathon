# Ollama and Qwen Setup Guide

This document captures the exact setup we used on this machine to install and verify Ollama, run the `qwen2.5-coder:7b` model, and wire up PowerShell helpers so Qwen can be called quickly from the terminal.

The goal is that someone else can follow the same sequence on their own Windows laptop and end up with the same working setup.

## What was installed

- **Ollama** as the local model runtime
- **Qwen** model: `qwen2.5-coder:7b`
- **PowerShell helpers**:
  - `qwen` for direct prompts
  - `qwenctx` for prompts that include local folder or repo context

## 1. Install Ollama

1. Install Ollama on Windows from the official Ollama installer.
2. Confirm the executable is available on your machine.
3. If `ollama` is not in `PATH`, use the full path to the executable.

On this machine, the installed executable was:

```powershell
C:\Users\AnkurSinha\AppData\Local\Programs\Ollama\ollama.exe
```

## 2. Verify Ollama is available

After installation, verify the CLI works:

```powershell
ollama list
```

If `ollama` is not recognized, run it by full path instead:

```powershell
& 'C:\Users\AnkurSinha\AppData\Local\Programs\Ollama\ollama.exe' list
```

On this machine, `ollama list` showed these installed models:

- `qwen2.5-coder:7b`
- `llama3.2:latest`

## 3. Verify the local Ollama API

Ollama exposes a local HTTP API. We confirmed it was reachable at:

```text
http://localhost:11434
```

To inspect installed models through the API:

```powershell
Invoke-RestMethod http://localhost:11434/api/tags
```

This confirmed that `qwen2.5-coder:7b` was registered locally and ready to use.

## 4. Run Qwen directly

We tested Qwen with a simple one-shot prompt:

```powershell
& 'C:\Users\AnkurSinha\AppData\Local\Programs\Ollama\ollama.exe' run qwen2.5-coder:7b "Reply with one short sentence confirming you are running."
```

The model responded successfully, which proved the local install was working.

You can also run it interactively:

```powershell
& 'C:\Users\AnkurSinha\AppData\Local\Programs\Ollama\ollama.exe' run qwen2.5-coder:7b
```

## 5. Add a PowerShell helper for direct Qwen prompts

We added a persistent PowerShell function called `qwen` so Qwen can be called without typing the long Ollama command each time.

The function lives in the PowerShell profile:

```powershell
C:\Users\AnkurSinha\OneDrive - Influence AB\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1
```

The direct prompt helper is:

```powershell
function qwen {
    param(
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$Prompt
    )

    $body = @{
        model  = 'qwen2.5-coder:7b'
        prompt = ($Prompt -join ' ')
        stream = $false
    } | ConvertTo-Json -Depth 3

    try {
        $response = Invoke-RestMethod 'http://localhost:11434/api/generate' -Method Post -ContentType 'application/json' -Body $body
        $response.response
    }
    catch {
        Write-Error "Unable to reach Ollama at http://localhost:11434. Make sure Ollama is running."
    }
}
```

Usage:

```powershell
qwen write a short summary of this repo
qwen "Explain this PowerShell function in one paragraph"
```

## 6. Allow the PowerShell profile to load

This machine had `LocalMachine` execution policy set to `AllSigned`, so unsigned profile scripts would not load automatically.

We checked the execution policy:

```powershell
Get-ExecutionPolicy -List
```

Then we set the current-user scope to allow local profile scripts:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned -Force
```

That change lets the local PowerShell profile run without changing the machine-wide policy.

## 7. Reload the profile

After updating the profile, reload it in the current shell:

```powershell
. $PROFILE
```

Or open a new PowerShell window.

You can then confirm the helper exists:

```powershell
Get-Command qwen
```

## 8. Add context-aware Qwen support

We also added a second helper named `qwenctx` so Qwen can answer with local project context instead of only the raw prompt.

This is useful when you want the model to understand:

- a git repo
- a normal laptop folder
- the current working directory

The helper accepts an explicit path:

```powershell
qwenctx -Path C:\Some\Folder explain this project
```

If no path is passed:

- it uses the current git repo root when the folder is inside a repo
- otherwise it uses the current folder

The context wrapper includes:

- target root path
- repo metadata when a `.git` folder exists
- file count and total size
- readable text file contents
- metadata for binary or unreadable files

## 9. `qwenctx` behavior

The wrapper was designed to work in both of these cases:

### Git repo folder

If the folder is part of a git repo, the wrapper uses the repo root and includes:

- branch name
- current commit hash
- a recursive file snapshot from the chosen root

### Plain local folder

If the folder is not connected to git, the wrapper still works.

It simply scans the folder you gave it, or the current folder if no path is passed.

This was important because a lot of useful local work happens outside a git repository.

## 10. Session memory and rolling window

`qwenctx` also keeps a small persistent memory file so it can behave more like a session-aware CLI.

The memory file is stored here on Windows:

```powershell
C:\Users\<you>\.codex\memories\qwenctx-session.json
```

It stores:

- one summary per folder
- the last time that folder was used
- a rolling window of the most recent folder summaries

The default rolling window keeps the most recent 12 folder summaries.

You can change that with environment variables if needed:

```powershell
$env:QWENCTX_SESSION_MAX_ENTRIES = 12
$env:QWENCTX_SESSION_ENTRY_MAX_CHARS = 1200
```

There is also a reset command:

```powershell
qwenctxclear
```

That deletes the session memory file and starts fresh.

## 11. How non-text files are handled

To keep the prompt usable, the wrapper does not try to inline raw bytes for everything.

Instead:

- text files are read and included in the prompt
- large text files are truncated to a head/tail preview
- binary files, PDFs, images, archives, executables, and similar files are listed with metadata only

This avoids breaking the prompt with unreadable content while still letting Qwen know those files exist.

## 12. Example `qwenctx` usage

```powershell
qwenctx summarize this folder
qwenctx -Path C:\Projects\MyApp explain the structure
qwenctx -Path . identify the key files I should inspect first
```

## 13. What we validated

We validated the setup in the following order:

1. Confirmed Ollama was installed and accessible.
2. Confirmed the installed models with `ollama list`.
3. Confirmed the local Ollama API responded on `localhost:11434`.
4. Ran a direct `qwen2.5-coder:7b` prompt successfully.
5. Added the `qwen` helper to PowerShell profile.
6. Enabled the profile to load with `RemoteSigned` at the current-user scope.
7. Added `qwenctx` for context-aware prompting.
8. Verified `qwenctx` on both a normal folder and the actual repo root.

## 14. Troubleshooting

### `ollama` is not recognized

Use the full path to `ollama.exe`, or add the Ollama install directory to `PATH`.

### `qwen` says it cannot reach Ollama

Make sure Ollama is running and that `http://localhost:11434` is reachable.

### PowerShell profile does not load

Check execution policy:

```powershell
Get-ExecutionPolicy -List
```

If needed, set:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned -Force
```

### `qwenctx` output is too large

Point it at a smaller folder with `-Path`, or reduce the prompt scope by asking about a specific file or area.

## 15. Minimal install sequence for a new laptop

If someone wants to reproduce the setup from scratch, the shortest version is:

1. Install Ollama on Windows.
2. Confirm `ollama list` works.
3. Make sure `qwen2.5-coder:7b` is installed.
4. Verify `http://localhost:11434` responds.
5. Add the `qwen` helper to the PowerShell profile.
6. Set `CurrentUser` execution policy to `RemoteSigned`.
7. Reload PowerShell with `. $PROFILE`.
8. Add `qwenctx` if they want repo/folder context support.

That is enough to get a working local Qwen terminal setup.
