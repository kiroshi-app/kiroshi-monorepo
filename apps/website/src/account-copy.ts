import { PLATFORM_APPS } from "./authorize-copy"
import { WEBSITE_COPY } from "./copy"

const { local, pro } = WEBSITE_COPY.pricing

export const ACCOUNT_COPY = {
	title: "Your account",
	lead: "Your plan and the devices signed in to Kiroshi.",
	planHeading: "Plan",
	plans: {
		free: { name: local.name, price: local.price, betaTag: undefined },
		pro: {
			name: pro.name,
			price: `${pro.price} ${pro.period}`,
			betaTag: pro.betaTag,
		},
	},
	devicesHeading: "Signed-in devices",
	thisDevice: "This device",
	unknownDevice: "Unknown device",
	sessionCaption: (platform: string | null, lastSeen: string) =>
		[platform && PLATFORM_APPS[platform], lastSeen].filter(Boolean).join(" · "),
	signOut: "Sign out",
	signOutDeviceTitle: (deviceName: string) => `Sign out ${deviceName}?`,
	signOutDeviceLead:
		"Kiroshi on this device stays signed out until you sign in on it again.",
	signOutThisDeviceTitle: "Sign out this device?",
	signOutThisDeviceLead: "You’ll need to sign in again to come back here.",
	signOutEverywhere: "Sign out everywhere",
	signOutEverywhereTitle: "Sign out everywhere?",
	signOutEverywhereLead:
		"Every device signed in to your account signs out, this one included. Sign in again on each one to come back.",
	signOutSiteTitle: "Sign out of kiroshi.app?",
	signOutSiteLead:
		"Your other devices stay signed in. You’ll need to sign in again to come back here.",
}
