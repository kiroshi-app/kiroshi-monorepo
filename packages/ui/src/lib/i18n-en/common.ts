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
				"Nothing is deleted on the host. You can join again with a new invitation.",
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
