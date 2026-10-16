import { PLATFORM_APPS } from "./authorize-copy"
import { WEBSITE_COPY } from "./copy"

const { local, pro } = WEBSITE_COPY.pricing

export const ACCOUNT_COPY = {
	planHeading: "Plan",
	plans: {
		free: { name: local.name, price: local.price },
		pro: {
			name: pro.name,
			price: `${pro.price} ${pro.period}`,
			betaTag: pro.betaTag,
		},
	},
	devicesHeading: "Signed-in devices",
	thisDevice: "This device",
	unknownDevice: "Unknown device",
	browserOnOs: (browser: string, os: string) => `${browser} on ${os}`,
	activeNow: "Active now",
	sessionCaption: (platform: string | null, lastSeen: string) =>
		[platform && PLATFORM_APPS[platform], lastSeen].filter(Boolean).join(" · "),
	signOut: "Sign out",
	signOutDeviceTitle: (deviceName: string) => `Sign out ${deviceName}?`,
	signOutDeviceLead: (deviceName: string) =>
		`You’ll need to sign in again on ${deviceName}.`,
	signOutThisDeviceTitle: "Sign out this device?",
	signOutThisDeviceLead: "You’ll need to sign in again to come back here.",
	signOutEverywhere: "Sign out everywhere",
	signOutEverywhereTitle: "Sign out everywhere?",
	signOutEverywhereLead:
		"Every device signed in to your account signs out, this one included. Sign in again on each one to come back.",
}
