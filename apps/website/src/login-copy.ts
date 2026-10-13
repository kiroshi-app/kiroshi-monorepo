import type { RelayFailure } from "./relay"

export const LOGIN_COPY = {
	brand: "Kiroshi",
	signInTitle: "Sign in to Kiroshi",
	signInLead: "We’ll email you a six-digit code.",
	emailLabel: "Email",
	emailPlaceholder: "you@example.com",
	emailSubmit: "Continue",
	or: "or",
	continueWithGoogle: "Continue with Google",
	continueWithApple: "Continue with Apple",
	signInFootnote: "New to Kiroshi? Signing in creates your account.",
	codeTitle: "Enter the code",
	codeLead: (email: string) =>
		`We sent a six-digit code to ${email}. It\u00a0works for 10 minutes.`,
	codeLabel: "Code",
	newCode: "Send a new code",
	anotherEmail: "Use another email",
	nameTitle: "Welcome to Kiroshi",
	nameLead: (email: string) =>
		`Your account for ${email} is ready. What should we call you?`,
	nameLabel: "Your name",
	nameSubmit: "Continue",
	nameFootnote:
		"People in your spaces see this name. You can change it later on kiroshi.app.",
	nameMissing: "Enter your name.",
	nameTooLong: "Keep your name to 80 characters.",
	retry: "Retry",
	socialFailed: "Couldn't sign you in. Try again, or continue with your email.",
	failures: {
		network: "Couldn't reach Kiroshi. Check your connection, then try again.",
		server: "Kiroshi couldn't answer. Try again.",
		rejected: "Kiroshi refused this. Check what you entered, then try again.",
		unauthorized: "You're signed out. Sign in again.",
		unavailable: "Kiroshi couldn't do this.",
		"code-wrong": "Code is wrong",
		"code-expired": "Code has expired",
		"code-too-many": "Too many wrong codes, ask for a new one",
		"apple-unavailable":
			"Sign in with Apple isn't available yet. Continue with your email instead.",
	} satisfies Record<RelayFailure, string>,
}
