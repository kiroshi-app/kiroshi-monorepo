# Security Policy

Kiroshi is a desktop app that drives a coding agent on your own machine. That
makes the trust boundary unusual, so this policy starts with what the app is
allowed to do before it gets to how to report a problem.

## What Kiroshi does on your machine

- It resolves a local Claude Code CLI (`claude`) and spawns it as a child
  process. The child inherits the ambient environment, because Claude Code needs
  it to reach its own credential store.
- The agent asks to run tools — reading and writing files, running commands.
  Kiroshi surfaces each request and you allow or deny it. An allowed tool call
  runs with your user account's full privileges; Kiroshi does not sandbox it.
- Conversations are stored locally, in a SQLite file under the app's data
  directory. There is no Kiroshi server and no telemetry.
- The `KIROSHI_CLAUDE_BIN` environment variable overrides which binary is
  launched, ahead of `PATH`.

Reports that matter most are the ones that break those rules: a tool call that
runs without an approval, a way to spoof or bypass the approval prompt, a path
that makes Kiroshi launch an unintended binary, model or file content that
escalates itself into an approval, or credentials and environment values leaking
into logs, transcripts, or the UI.

## Reporting a vulnerability

Report privately through GitHub, never in a public issue or pull request:

1. Open <https://github.com/kiroshi-app/kiroshi-monorepo/security/advisories/new>, or go to
   the repository's **Security** tab and choose **Report a vulnerability**.
2. Describe what you found, the version or commit, your OS, and the steps to
   reproduce it. A minimal reproduction and the impact you believe it has help
   most.

You should get an acknowledgement within 5 business days and a first assessment
within 10. If the advisory form is unavailable to you, open a public issue that
says only that you have a security report to send — no details — and you will be
invited to a private channel.

## Out of scope

- Vulnerabilities in Claude Code itself, or in the models behind it. Report
  those to Anthropic through their disclosure process, not here. If Kiroshi's
  own handling makes such an issue worse, that part is in scope.
- Vulnerabilities in Tauri, Bun, or other dependencies. Report them upstream,
  and tell us if Kiroshi's configuration widens the impact.
- Consequences of a tool call you approved. Approving a command is the app
  working as designed.

## Disclosure

Fixes are developed in private and disclosed once a release is available. You
will be credited in the advisory and the release notes unless you prefer
otherwise.
