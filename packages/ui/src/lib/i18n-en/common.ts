const common = {
	boot: {
		status: "Starting Kiroshi",
	},
	spaces: {
		unavailable: {
			title: "Couldn’t load your spaces",
			description: "Your companions are still there.",
		},
		leave: {
			title: "Leave {{name}}?",
			description:
				"Nothing is deleted on the host. You can join again with its link.",
			action: "Leave space",
		},
	},
	skipLink: "Skip to the conversation",
	companion: {
		unnamed: "Companion",
	},
	dialog: {
		close: "Close",
	},
	confirm: {
		cancel: "Cancel",
	},
	sidebar: {
		label: "Sidebar",
		toggle: "Toggle sidebar",
		close: "Close sidebar",
		resize: "Resize sidebar",
	},
	windowControls: {
		minimize: "Minimize",
		maximize: "Maximize",
		restore: "Restore",
		close: "Close",
		failure: {
			minimize: "Couldn’t minimize Kiroshi.",
			maximize: "Couldn’t maximize or restore Kiroshi.",
			close: "Couldn’t close Kiroshi.",
			state: "Couldn’t tell whether Kiroshi is maximized.",
			snap: "Snap layouts are unavailable on the maximize button.",
			pointer: "The maximize button can’t show hover or press feedback.",
		},
	},
	notice: {
		label: "Notices",
		close: "Close notice",
		copy: "Copy",
		copied: "Copied",
		copyFailed: "Couldn’t copy the report. Press Copy again.",
	},
	devices: {
		approval: {
			title: "{{device}} wants to use your account",
			body: "If it’s yours, approve it and it’ll read your spaces. If it isn’t, choose Not me and it’ll be signed out.",
			hint: "Approve only if {{device}} shows these same six words.",
			notMe: "Not me",
			approve: "Approve",
			approving: "Approving…",
			retry: "Try again",
			failed:
				"Couldn’t approve {{device}}. Check your connection and try again.",
			approved: {
				title: "{{device}} is approved",
				description:
					"It reads your spaces now. Remove it any time in Your devices.",
			},
			rejected: {
				title: "{{device}} was signed out",
				description: "It never read your spaces.",
			},
		},
		newDevice: {
			thisDevice: "This device",
			noOtherDevice: "I don't have another device",
			signOut: "Sign out",
			waiting: {
				title: "Approve this device from one you already use",
				body: "Open Kiroshi on a device that uses {{email}} and approve this one.",
				status: "Waiting for approval…",
			},
			code: {
				title: "Check your email",
				body: "We sent a 6-digit code to {{email}}. Enter it to approve this computer. It works once, for 5 minutes.",
				label: "6-digit code",
				approve: "Approve this computer",
				resend: "Send a new code",
			},
			expired: {
				title: "The request expired",
				body: "Nobody approved this device in time. Ask again, then approve it on a device you already use.",
				askAgain: "Ask again",
			},
			rejected: {
				title: "This device wasn't approved",
				body: "Someone using {{email}} said it isn't theirs, so it was signed out.",
				backToSignIn: "Back to sign in",
			},
		},
	},
	notification: {
		question: "Asked you a question",
		approval: "Wants your approval",
		finishedTurn: "Finished its turn",
		spoke: "{{name}} said something",
		mission: {
			question: "Asked you a question on {{ticket}}",
			waiting_human: "Needs you on {{ticket}}",
			ready_to_merge: "{{ticket}} is ready to merge",
		},
		failure: {
			clicks:
				"Notifications won’t open their conversation. Restart Kiroshi to fix it.",
			focus:
				"Notifications may show while you’re in Kiroshi. Restart Kiroshi to fix it.",
			reveal: "Couldn’t bring Kiroshi to the front. Switch to it yourself.",
			send: "Couldn’t show a notification. Check Kiroshi’s notification permission.",
		},
	},
	update: {
		badge: {
			available: "Download update",
			downloading: "Downloading update",
			ready: "Restart to update",
			error: "Update failed, download again",
			retry: "Download the update again",
		},
		panel: {
			title: "Update ready",
			version: "Version {{version}}",
			botsBusy_one: "{{count}} companion is still running. Stop it to restart.",
			botsBusy_other:
				"{{count}} companions are still running. Stop them to restart.",
			restart: "Restart now",
			postpone: "Remind me later",
			releaseNotes: "Read the full release notes in your browser",
			notes: "Release notes",
		},
	},
	whatsNew: {
		firstLaunch: {
			eyebrow: "New in {{version}}",
			legend: "Also in this update",
			dismiss: "Got it",
		},
		fromAbout: {
			eyebrow: "Version {{version}}",
			legend: "Also in this version",
			dismiss: "Close",
		},
		beta: "Beta",
		releaseNotes: "Release notes",
	},
} as const

export { common }
