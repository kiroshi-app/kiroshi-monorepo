import type { AccountReport } from "../agent/contract"

export type OnboardingPort = {
	account: () => Promise<AccountReport>
	signIn: () => Promise<void>
	enterCode: (code: string) => Promise<void>
	cancelSignIn: () => Promise<void>
	holdApiKey: (apiKey: string) => Promise<void>
	openSignInUrl: (url: string) => Promise<void>
	onSignInStarted: (onStarted: (url: string) => void) => Promise<() => void>
	hasClaudeHome: () => Promise<boolean>
	openDownloadPage: () => Promise<void>
}
