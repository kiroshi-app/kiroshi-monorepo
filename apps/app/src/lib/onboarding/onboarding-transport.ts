import { openUrl } from "@tauri-apps/plugin-opener"

import type { OnboardingPort } from "./onboarding-port"

import { invoke, listen } from "../host"
import type { AccountReport } from "../agent/contract"

const SIGN_IN_STARTED_CHANNEL = "agent://sign-in-started"

const API_KEY_CONNECTION = "apiKey"

const DOWNLOAD_PAGE_URL = "https://kiroshi.app"

type SignInStarted = { url: string }

export const onboardingTransport: OnboardingPort = {
	account: () => invoke<AccountReport>("agent_account"),

	signIn: () => invoke<void>("agent_sign_in"),

	enterCode: (code) => invoke<void>("agent_sign_in_code", { text: code }),

	cancelSignIn: () => invoke<void>("agent_sign_in_cancel"),

	holdApiKey: (apiKey) =>
		invoke<void>("connection_set", {
			kind: API_KEY_CONNECTION,
			value: apiKey,
		}),

	openSignInUrl: (url) => openUrl(url),

	onSignInStarted: (onStarted) =>
		listen<SignInStarted>(SIGN_IN_STARTED_CHANNEL, ({ payload }) =>
			onStarted(payload.url),
		),

	// TODO: read ~/.claude on the host once the Claude Code import inventory lands
	hasClaudeHome: () => Promise.resolve(false),

	openDownloadPage: () => openUrl(DOWNLOAD_PAGE_URL),
}
