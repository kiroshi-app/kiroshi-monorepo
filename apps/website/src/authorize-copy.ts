export const PLATFORM_APPS: Record<string, string> = {
	macos: "Kiroshi for Mac",
	ios: "Kiroshi for iPhone",
}

export const AUTHORIZE_COPY = {
	continueAsTitle: "Sign in to Kiroshi on your computer",
	continueAsLead: (deviceName: string) =>
		`You’re already signed in here. Pick the account Kiroshi on ${deviceName} should use.`,
	proBadge: "Pro",
	continueAs: (firstName: string) => `Continue as ${firstName}`,
	anotherAccount: "Use another account",
	approveTitle: "Sign in to Kiroshi on this computer?",
	approveLead: (email: string) =>
		`Kiroshi on this computer asked to use your account, ${email}.`,
	deviceCaption: (platform: string, askedAgo: string) =>
		`${PLATFORM_APPS[platform] ?? "Kiroshi"} · ${askedAgo}`,
	benefits: [
		"Host spaces for people who aren’t on your network",
		"Join the spaces they host for you",
	],
	approve: "Sign in",
	cancel: "Cancel",
	approveFootnote: "Didn’t start this from Kiroshi? Press Cancel.",
	doneTitle: "You’re signed in",
	doneLead: (deviceName: string, email: string) =>
		`Kiroshi on ${deviceName} is signed in as ${email}. You can close this tab and go back to Kiroshi.`,
	expiredTitle: "This sign-in request expired",
	expiredLead:
		"Kiroshi on your computer stopped waiting. Go back to Kiroshi and press Sign in with your browser again.",
	cancelledTitle: "Sign-in cancelled",
	cancelledLead:
		"Kiroshi on your computer stays signed out. You can close this tab.",
}
