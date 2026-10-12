import type { RelayFailure } from "./relay"

export const LOGIN_COPY = {
	signInTitle: "Sign in",
	continueWithGoogle: "Continue with Google",
	continueWithApple: "Continue with Apple",
	emailLabel: "Email",
	emailSubmit: "Continue with email",
	codeTitle: "Enter the code",
	codeSentTo: "We sent a six-digit code to",
	codeLabel: "Code",
	newCode: "Send a new code",
	nameTitle: "Your name",
	nameLabel: "Your name",
	nameSubmit: "Continue",
	nameMissing: "Enter your name.",
	failures: {
		network: "Couldn't reach Kiroshi. Check your connection, then try again.",
		server: "Kiroshi couldn't answer. Try again.",
		rejected: "Kiroshi refused this. Check what you entered, then try again.",
		unauthorized: "You're signed out. Sign in again.",
		"code-wrong": "Code is wrong",
		"code-expired": "Code has expired",
		"code-too-many": "Too many wrong codes, ask for a new one",
	} satisfies Record<RelayFailure, string>,
}
