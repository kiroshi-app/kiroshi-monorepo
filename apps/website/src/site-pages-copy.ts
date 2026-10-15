export const SUPPORT_EMAIL = "support@kiroshi.app"

const PLACEHOLDER = "This section is being written."

export const SITE_PAGES_COPY = {
	footerNavigation: "Site",
	homeLink: "Kiroshi home",
	privacy: {
		navLabel: "Privacy",
		title: "Privacy policy",
		sections: [
			{ heading: "What we collect", body: PLACEHOLDER },
			{ heading: "Where messages go", body: PLACEHOLDER },
			{ heading: "Third-party AI providers", body: PLACEHOLDER },
			{ heading: "How to delete your account", body: PLACEHOLDER },
		],
	},
	terms: {
		navLabel: "Terms",
		title: "Terms of service",
		sections: [
			{ heading: "The service", body: PLACEHOLDER },
			{ heading: "The Pro plan", body: PLACEHOLDER },
			{ heading: "Acceptable use", body: PLACEHOLDER },
		],
	},
	support: {
		navLabel: "Support",
		title: "Support",
		topics: {
			heading: "What to write to us about",
			body: "Write to us about a bug, a question about how Kiroshi works, a privacy request, or billing once the Pro plan is paid.",
		},
		contact: {
			heading: "How to reach us",
			body: "Email us at the address below. For bugs and feature requests, you can also open an issue on GitHub.",
			issuesLink: "Open an issue on GitHub",
		},
		details: {
			heading: "What helps us answer",
			body: "Tell us the app version, your macOS or iOS version, what happened, and what you expected to happen.",
		},
		privacy: {
			heading: "Privacy and account deletion",
			body: "Send privacy requests (access to your data, deletion of your account, or any question about your data) to the same address. You can also delete your account yourself from Settings in the iPhone app.",
		},
		response: {
			heading: "When we answer",
			body: "One person reads and answers every message, within a few working days.",
		},
		operator: {
			heading: "Who runs Kiroshi",
			body: "Kiroshi, an independent project run from France by Steve Puget.",
		},
	},
}
