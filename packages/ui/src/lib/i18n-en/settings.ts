const settings = {
	breadcrumb: {
		title: "Settings",
	},
	rail: {
		account: "Account",
		space: "Space",
		members: "Members",
		secrets: "Secrets",
		appearance: "Appearance",
		notifications: "Notifications",
		language: "Language",
		skills: "Skills",
		applications: "Applications",
		history: "History",
		diagnostics: "Diagnostics",
		danger: "Danger zone",
		about: "About",
	},
	account: {
		signedOut: {
			title: "Sign in to Kiroshi",
			body: "Host a space for people who aren’t on your network, or join one someone hosts for you.",
			signIn: "Sign in with your browser",
			caption:
				"Your account, plan and signed-in computers live on kiroshi.app.",
		},
		waiting: {
			label: "Waiting for your browser…",
			cancel: "Cancel",
			caption: "Finish in your browser. Kiroshi picks it up from there.",
			browserDidNotOpen: "Browser didn’t open?",
			copySignInLink: "Copy the sign-in link",
		},
		signedIn: {
			plan: {
				beta: "Free during the beta",
				pro: "Pro",
				free: "Free",
			},
			manage: "Manage account",
			signOut: "Sign out",
			caption:
				"Your name, plan and signed-in computers are managed on kiroshi.app.",
		},
		signedOutFromTheSite: {
			title: "You were signed out on kiroshi.app",
			description:
				"This computer was signed out from Devices. Sign in again to use your spaces beyond your network.",
		},
		unreachable: {
			title: "Couldn’t reach Kiroshi",
			description: "Check your connection and sign in again.",
		},
		failed: {
			cancelled: "Signing in was cancelled",
			timedOut: "Signing in took too long",
			description: "Press Sign in with your browser to try again.",
		},
		readFailed: "Couldn’t read your Kiroshi account",
		signInFailed: "Couldn’t start signing in to Kiroshi",
		cancelFailed: "Couldn’t cancel signing in",
		signInLinkCopied: "Sign-in link copied",
		copySignInLinkFailed: "Couldn’t copy the sign-in link",
		manageAccountFailed: "Couldn’t open your account on kiroshi.app",
		signOutFailed: "Couldn’t sign out of Kiroshi",
	},
	plugin: {
		author: {
			bot: "A companion",
		},
	},
	notifications: {
		label: "Notify me when",
		event: {
			question: {
				label: "A companion asks a question",
				description: "It’s paused until you answer.",
			},
			permission: {
				label: "A companion asks for approval",
				description:
					"It’s waiting for your approval to run a command or edit a file.",
			},
			turn: {
				label: "A companion finishes its turn",
				description: "It’s done and waiting for your next message.",
			},
		},
		sound: {
			label: "Sound",
			switch: "Play a sound",
			description:
				"Kiroshi plays a short chime with every notification, even when your system shows it silently.",
		},
	},
	language: {
		label: "Language",
		machine: "System",
	},
	appearance: {
		scheme: {
			label: "Scheme",
			option: {
				light: "Light",
				dark: "Dark",
				system: "System",
			},
		},
	},
	diagnostics: {
		label: "Diagnostics",
		description:
			"Copy diagnostics puts the details of the computer where Kiroshi runs and of the agent on the clipboard, ready for a bug report.",
		copy: "Copy diagnostics",
		copyFailed: "Couldn’t copy the diagnostics. Try again.",
		reveal: "Reveal log",
		revealFailed: "Couldn’t reveal the log. Try again.",
		clear: {
			action: "Clear log",
			title: "Clear the log?",
			description:
				"Every line Kiroshi wrote to its log on this computer is deleted. This can’t be undone.",
			failed: "Couldn’t clear the log. Try again.",
		},
	},
	about: {
		updates: {
			label: "Updates",
		},
		version: "Kiroshi {{version}}",
		status: {
			upToDate: "Up to date · Checked {{when}}",
			checking: "Checking for updates…",
			available: "Kiroshi {{version}} is available.",
			downloading: "Downloading {{version}}. You can keep working meanwhile.",
			ready: "{{version}} is ready. Restart Kiroshi to finish updating.",
			readyHeld: "{{version}} is ready.",
			running_one: "{{count}} companion is still running. Stop it to restart.",
			running_other:
				"{{count}} companions are still running. Stop them to restart.",
			failed: "Couldn’t download {{version}}.",
			failedHint: "Check your connection, then download it again.",
		},
		action: {
			check: "Check for updates",
			download: "Download update",
			restart: "Restart now",
			downloadAgain: "Download again",
		},
		channel: {
			label: "Release channel",
			description: "Beta gets new features sooner, with rougher edges.",
			option: {
				stable: "Stable",
				beta: "Beta",
			},
		},
		betaNotice: {
			title: "Beta builds are tested less",
			description: "Back on Stable, you keep this beta until Stable passes it.",
		},
		whatsNew: {
			label: "Show what’s new after an update",
			description:
				"The first time Kiroshi opens on a new version, it shows what changed.",
		},
		kiroshi: {
			label: "Kiroshi",
			whatsNew: "What’s new in {{version}}",
			releaseNotes: "Release notes",
			releaseNotesName: "Release notes, opens in your browser",
		},
	},
	space: {
		untitled: "Untitled space",
		name: {
			label: "Name",
			placeholder: "No name",
		},
		host: {
			label: "Host",
			hint: "This space lives on another Kiroshi.",
		},
		colour: {
			label: "Colour",
			none: "No colour",
		},
		transfer: {
			export: "Export this space",
			import: "Import a space",
			exported: "{{name}} exported",
			imported: "{{name}} imported",
			exportFailed: "Couldn’t export {{name}}",
			importFailed: "Couldn’t import the space",
			retry: "Try again",
			reason: {
				unsupportedArchive:
					"This archive is format version {{found}}, this app reads version {{supported}}.",
				unversionedArchive:
					"This archive carries no format version, this app reads version {{supported}}.",
				unreadableArchive: "The archive couldn’t be read.",
				unwritableArchive: "The archive couldn’t be written.",
				generic: "Something went wrong, nothing was changed.",
			},
		},
		members: {
			invite: {
				label: "Invite people",
				placeholder: "Email",
				action: "Invite",
				hint: "They join by signing in to Kiroshi with this email.",
				refusal: {
					invited: "{{email}} is already invited.",
					self: "That’s your own account.",
					malformed: "Enter an email address, like sam@example.com.",
				},
				notShared: "Turn on Share {{name}} to invite someone.",
			},
			status: {
				host: "Host",
				joined: "Joined",
				pending: "Pending",
			},
			remove: "Remove",
			removeLabel: "Remove {{name}}",
			confirm: {
				title: "Remove {{name}} from {{space}}?",
				description:
					"{{name}} loses access right away. You can invite {{name}} again.",
			},
			withdrawn: "Invitation to {{email}} withdrawn",
			failure: {
				invite: {
					notHosting:
						"{{space}} isn’t hosted anymore. Turn on hosting to invite {{email}}.",
					limitReached:
						"{{space}} can’t take more members. Remove someone to invite {{email}}.",
					notOwner:
						"This account doesn’t host {{space}}. Sign in with the account that does to invite {{email}}.",
					needsSignIn:
						"Couldn’t invite {{email}}, you’re signed out. Sign in to Kiroshi and invite them again.",
					unreachable:
						"Couldn’t reach Kiroshi to invite {{email}}. Check your connection and try again.",
					generic: "Couldn’t invite {{email}}. Nothing changed, try again.",
				},
				withdraw: {
					gone: "The invitation to {{email}} is already gone. There’s nothing to withdraw.",
					joined:
						"{{name}} already joined. Select Remove to take them out of {{space}}.",
					notHosting:
						"{{space}} isn’t hosted anymore. Turn on hosting to withdraw the invitation to {{email}}.",
					notOwner:
						"This account doesn’t host {{space}}. Sign in with the account that does to withdraw the invitation to {{email}}.",
					needsSignIn:
						"Couldn’t withdraw the invitation to {{email}}, you’re signed out. Sign in to Kiroshi and try again.",
					unreachable:
						"Couldn’t reach Kiroshi to withdraw the invitation to {{email}}. Check your connection and try again.",
					generic:
						"Couldn’t withdraw the invitation to {{email}}. Nothing changed, try again.",
				},
				remove: {
					gone: "{{name}} isn’t a member anymore. There’s nothing to remove.",
					pending:
						"{{name}} hasn’t joined yet. Select Remove again to withdraw the invitation.",
					host: "You host {{space}}, so you can’t be removed. Turn off hosting instead.",
					notHosting:
						"{{space}} isn’t hosted anymore. Turn on hosting to remove {{name}}.",
					notOwner:
						"This account doesn’t host {{space}}. Sign in with the account that does to remove {{name}}.",
					needsSignIn:
						"Couldn’t remove {{name}}, you’re signed out. Sign in to Kiroshi and try again.",
					unreachable:
						"Couldn’t reach Kiroshi to remove {{name}}. Check your connection and try again.",
					generic: "Couldn’t remove {{name}}. Nothing changed, try again.",
				},
			},
		},
		hosting: {
			label: "Share {{name}}",
			description:
				"Invite people who aren’t on your network. {{name}} runs on this computer, so they reach it while Kiroshi is open here.",
			signedOut:
				"Sign in to Kiroshi to invite people who aren’t on your network.",
			signIn: "Sign in",
			connecting: "Connecting…",
			online: "Online",
			failed: {
				title: "Couldn’t host {{name}}",
				description: "Check your connection and turn it on again.",
			},
			stopFailed: {
				title: "Couldn’t stop hosting {{name}}",
				description: "Turn it off again.",
			},
		},
		danger: {
			delete: "Delete space",
			description:
				"Companions that are only in this space are deleted with it. This can’t be undone.",
			last: "You can’t delete your last space.",
			confirm: {
				title: "Delete {{name}}?",
			},
		},
	},
} as const

export { settings }
