# Ollama and Qwen Setup Guide

This guide captures the full setup we used to run Qwen locally through Ollama and make it useful from PowerShell. It is written so someone can start from scratch on a Windows laptop and end up with the same workflow:

- Ollama installed locally
- `qwen2.5-coder:7b` available as the model
- `qwen` for fast direct prompts
- `qwenctx` for folder-aware prompts with rolling session memory
- `qwenctxclear` for resetting the stored context

It also explains how this differs from Codex in this workspace.

## 1. What this setup is for

- **Ollama** is the local runtime that serves the model on your laptop.
- **Qwen** is the model we use locally through Ollama.
- **Codex** is the assistant in this workspace that edits the repo and reasons about the codebase here.
- **`qwen`** is the PowerShell shortcut for direct Qwen prompts.
- **`qwenctx`** is the PowerShell shortcut for prompts that include local folder or repo context.
- **`qwenctxclear`** removes the saved session memory and starts fresh.

If you want a local model in your terminal, use Qwen through Ollama. If you want the repo-editing agent in this workspace, use Codex here.

## 2. Install Ollama

1. Install Ollama on Windows from the official Ollama installer.
2. Open Ollama once so the local service is available.
3. Confirm the CLI works.

If `ollama` is already on your `PATH`, run:

```powershell
ollama list
```

If the command is not found, use the full path to the executable. On this machine it was:

```powershell
C:\Users\AnkurSinha\AppData\Local\Programs\Ollama\ollama.exe
```

So the equivalent command was:

```powershell
& 'C:\Users\AnkurSinha\AppData\Local\Programs\Ollama\ollama.exe' list
```

If the model is not installed yet, pull it with:

```powershell
ollama pull qwen2.5-coder:7b
```

On our machine it was already present, and `ollama list` showed:

- `qwen2.5-coder:7b`
- `llama3.2:latest`

## 3. Verify the local Ollama API

Ollama exposes a local HTTP API. We confirmed it was reachable at:

```text
http://localhost:11434
```

To inspect the installed models through the API:

```powershell
Invoke-RestMethod http://localhost:11434/api/tags
```

That confirmed `qwen2.5-coder:7b` was registered locally and ready to use.

## 4. Run Qwen directly

You can run Qwen in the terminal without any wrapper first to verify the model itself works.

Interactive mode:

```powershell
& 'C:\Users\AnkurSinha\AppData\Local\Programs\Ollama\ollama.exe' run qwen2.5-coder:7b
```

One-shot prompt:

```powershell
& 'C:\Users\AnkurSinha\AppData\Local\Programs\Ollama\ollama.exe' run qwen2.5-coder:7b "Reply with one short sentence confirming you are running."
```

This direct call is useful when you just want to test the model or ask a single question.

## 5. Put the helpers in your PowerShell profile

We added the helper functions to the PowerShell profile so they are available in new terminal sessions.

The profile path on this machine was:

```powershell
C:\Users\AnkurSinha\OneDrive - Influence AB\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1
```

On another machine, use your own profile path by running:

```powershell
$PROFILE
```

If the profile file does not exist, create it. The easiest way is:

```powershell
notepad $PROFILE
```

Then paste the helper functions into that file.

After saving the profile, reload it in the current shell:

```powershell
. $PROFILE
```

Or open a fresh PowerShell window.

You can confirm the helpers loaded with:

```powershell
Get-Command qwen, qwenctx, qwenctxclear
```

## 6. Handle PowerShell execution policy

This machine had `LocalMachine` set to `AllSigned`, which blocks unsigned profile scripts.

We checked the policy with:

```powershell
Get-ExecutionPolicy -List
```

Then we set the current-user scope to allow local profile scripts:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned -Force
```

That is the least disruptive fix if your profile will not load.

## 7. Use `qwen` for direct prompts

`qwen` is the simple wrapper for quick questions.

Example usage:

```powershell
qwen write a short summary of this README
qwen "Explain this PowerShell function in one paragraph"
qwen "List the top 3 risks in this approach"
```

What it does:

- sends your text directly to `http://localhost:11434/api/generate`
- uses `qwen2.5-coder:7b`
- returns the model output without loading any folder context

Use `qwen` when you want a fast prompt and you do not need local file context.

## 8. Use `qwenctx` for folder-aware prompts

`qwenctx` is the more capable wrapper.

It is designed for two cases:

- a git repo root
- a normal local folder, even if it is not a git repo

If you pass `-Path`, it uses that exact folder as the scan target:

```powershell
qwenctx -Path C:\Some\Folder explain this project
```

If you do not pass `-Path`:

- and the current working directory is a git repo root, it uses that repo root
- otherwise it uses the current folder

When you want repo metadata like branch and commit, point it at the repo root or run it from the repo root without `-Path`. If you point it at a nested subfolder, it will still scan that folder, but the snapshot is folder-scoped rather than repo-scoped.

What `qwenctx` includes in the prompt:

- target root path
- file count
- total size of the folder
- file-by-file metadata
- readable text file contents
- metadata only for binary or unreadable files

It also keeps a persistent session memory file so later calls can reuse prior folder summaries.

## 9. What `qwenctx` does with files

The wrapper scans folders recursively and tries to keep the prompt usable.

Behavior we used:

- text files are read and included
- large text files are truncated to a head/tail preview
- binary files, PDFs, images, archives, executables, and similar files are listed as metadata only

That is important because the model does not benefit from raw bytes for binary content, and huge prompts can become slow or time out.

## 10. Session memory and rolling window

This is the part that makes `qwenctx` feel more like a session tool.

`qwenctx` stores a reusable summary for each folder it processes. Those summaries are saved locally and fed into later calls.

The session memory file lives under the user profile:

```powershell
C:\Users\<you>\.codex\memories\qwenctx-session.json
```

On our machine, that file held:

- one summary per folder
- the last time the folder was used
- a rolling window of recent folder summaries

The default rolling window keeps the most recent 12 folder summaries.

You can tune the limits with environment variables:

```powershell
$env:QWENCTX_SESSION_MAX_ENTRIES = 12
$env:QWENCTX_SESSION_ENTRY_MAX_CHARS = 1200
```

That lets you keep the memory small enough for bigger projects.

Important detail:

- this is not literal model memory
- it is a wrapper that stores summaries and re-feeds them into later prompts

That is why it can feel session-aware even though each Ollama call is still stateless on its own.

## 11. Reset the session memory

If you want a clean start, run:

```powershell
qwenctxclear
```

That deletes the stored session memory file and starts the rolling window again from zero.

You may also want to use it when:

- you are switching projects
- the stored summaries are stale
- you want Qwen to forget prior folder context

## 12. Best way to work on large projects

The biggest practical lesson was that a full recursive scan of a big project can time out or become unwieldy.

For large projects, the better workflow is folder by folder:

1. Inspect the root once if the project is small enough.
2. If the root is too large, scan one major folder at a time.
3. Let `qwenctx` save the summary after each folder call.
4. Ask follow-up questions later and let the stored summaries provide continuity.

Example workflow:

```powershell
qwenctx -Path .\src-data summarize the dataset folders
qwenctx -Path .\scripts summarize the build scripts
qwenctx -Path .\docs summarize the documentation
qwenctx -Path .\references summarize the reference material
qwenctx -Path . summarize the whole project at a high level
```

That is the closest thing to a local Claude-CLI-style experience we built here:

- each call saves a summary
- later calls reuse the saved summaries
- the rolling window keeps the context useful without growing forever

## 13. When to use Qwen vs Codex

Use **Qwen** when you want:

- a local terminal model
- quick explanations
- folder summaries
- project context from the file system
- offline-friendly prompting through Ollama

Use **Codex** when you want:

- repo edits
- code changes inside this workspace
- planning and implementation help on the current project
- agentic work in the same environment you are using now

There is no local `codex` PowerShell command in this setup. Codex is the assistant you access in this workspace, while Qwen is the local model you run from PowerShell.

## 14. Troubleshooting

If `ollama` is not recognized:

- use the full path to `ollama.exe`
- or add Ollama to your `PATH`

If `qwen` says it cannot reach Ollama:

- make sure Ollama is running
- confirm `http://localhost:11434` responds

If the PowerShell profile does not load:

- check `Get-ExecutionPolicy -List`
- set `CurrentUser` to `RemoteSigned` if your machine blocks local profiles

If `qwenctx` is too slow or times out:

- use `-Path` on smaller folders
- scan the project folder by folder
- rely on the session memory to carry context forward

If the session memory gets noisy:

- run `qwenctxclear`
- or lower the rolling window size with `QWENCTX_SESSION_MAX_ENTRIES`

## 15. Minimal fresh-laptop checklist

If someone wants the shortest path from zero to a working setup, this is the sequence:

1. Install Ollama on Windows.
2. Confirm `ollama list` works.
3. Pull `qwen2.5-coder:7b` if it is not already installed.
4. Confirm the local API responds on `http://localhost:11434`.
5. Add `qwen`, `qwenctx`, and `qwenctxclear` to the PowerShell profile.
6. Set `CurrentUser` execution policy to `RemoteSigned` if profile loading is blocked.
7. Reload PowerShell with `. $PROFILE`.
8. Start with `qwen` for direct prompts.
9. Use `qwenctx` for folder-aware prompts.
10. Use `qwenctxclear` when you want a clean memory state.

That is enough to reproduce the same terminal-based local Qwen workflow on a new machine.
