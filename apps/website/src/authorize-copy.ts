const PLATFORM_NAMES: Record<string, string> = { macos: "macOS" }

export const AUTHORIZE_COPY = {
	continueAsTitle: (name: string) => `Continue as ${name}`,
	continueAsLead: (email: string) => `You’re signed in to Kiroshi as ${email}.`,
	continueAs: "Continue",
	anotherAccount: "Use another account",
	approveTitle: "Sign in to Kiroshi on this Mac?",
	approveLead: (email: string) =>
		`The Kiroshi app on this device asks to sign in as ${email}.`,
	device: (deviceName: string, platform: string) =>
		`${deviceName} · ${PLATFORM_NAMES[platform] ?? platform}`,
	approve: "Sign in",
	cancel: "Cancel",
	approveFootnote: "Only sign in if you just asked to from the Kiroshi app.",
	doneTitle: "Back to the app",
	doneLead: "You’re signed in on your Mac. You can close this tab.",
	expiredTitle: "Request expired",
	expiredLead:
		"This sign-in request is no longer valid. Sign in again from the Kiroshi app on your Mac.",
	cancelledTitle: "Sign-in cancelled",
	cancelledLead: "Nothing was signed in on your Mac. You can close this tab.",
}
