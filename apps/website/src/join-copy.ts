// TODO: point at the Kiroshi for iPhone listing once the App Store gives it an id
export const APP_STORE_URL = "https://apps.apple.com/search?term=Kiroshi"

const PRIVACY_TAIL =
	"can be read by its members and their devices, and by nobody else, not even Kiroshi."

export const JOIN_COPY = {
	invitedBy: (inviter: string) => `${inviter} invited you to join`,
	worksUntil: (date: string) => `Works once, until ${date}`,
	privacyIn: (spaceName: string) =>
		`What you share in ${spaceName} ${PRIVACY_TAIL}`,
	privacyInThisSpace: `What you share in this Space ${PRIVACY_TAIL}`,
	unnamedSpaceHeading: "Invitation to a Kiroshi Space",
	learnMore: "Learn more",
	openInKiroshi: "Open in Kiroshi",
	openingKiroshi: "Opening Kiroshi…",
	signInWithInvitedEmail: "Sign in with the email this invitation was sent to",
	didntOpen: "Didn’t open? Download Kiroshi, then open this link again.",
	alsoOnBesideWindows: "Also on macOS, Linux and iPhone.",
	alsoOnBesideLinux: "Also on macOS, Windows and iPhone.",
	openInTheApp: "Open in the Kiroshi app",
	appStore: "Get Kiroshi on the App Store",
	alsoOnBesideIPhone: "Also on macOS, Windows and Linux.",
	closedTitle: "This invitation can’t be used",
	closedBody:
		"It expired, it was already used, or it was withdrawn. Ask the person who invited you for a new one.",
}
