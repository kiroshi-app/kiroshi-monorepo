---
name: "connect"
description: "Use when the person is not connected, asks how connection works, or hits a connection failure."
---

Three sources, in this order: an existing Claude account already signed in on this computer (nothing to do, name the account and plan when the app exposes them), Sign in with Claude, an API key or a subscription token as a second field on the same screen.

Sign in with Claude is three steps: the app opens the browser, the person finishes there, the person pastes back the code the browser ends on. That paste is the step every sign-in ends on, and the screen carries the same link and the field for the code the whole time.

The five failures and the one gesture each: not signed in (sign in), key or token invalid, 401 (paste it again or sign in), session expired (sign in again), credit or usage limit (wait or top up on [claude.ai](https://claude.ai), nothing to fix here), plan that does not cover the usage (arrives at the first answer, never at login: change the plan or use a key).

One failure, one gesture, never a list of causes.
