const settings = {
	breadcrumb: {
		title: "Settings",
	},
	rail: {
		profile: "Profile",
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
		danger: "Danger zone",
	},
	account: {
		signedOut: {
			title: "Sign in to Kiroshi",
			body: "Host a space for people who aren’t on your network, or join one someone hosts for you. Kiroshi opens your browser to sign you in.",
			signIn: "Sign in",
			email: "Email",
		},
		waiting: {
			label: "Waiting for your browser…",
			cancel: "Cancel",
			caption:
				"Finish signing in in your browser. Kiroshi picks it up from there.",
		},
		signedIn: {
			title: "Signed in",
			body: "You can host spaces for people who aren’t on your network, and join the ones they host for you.",
			name: "Name",
			email: "Email",
			signOut: "Sign out",
			caption:
				"Spaces you host or joined through Kiroshi stop working here until you sign in again.",
		},
		unreachable: {
			title: "Couldn’t reach Kiroshi",
			description: "Check your connection and sign in again.",
		},
		failed: {
			linkInvalid: "That sign-in link didn’t work",
			serverError: "Kiroshi couldn’t sign you in",
			timedOut: "Signing in took too long",
			description: "Press Sign in to get a new link.",
		},
		readFailed: "Couldn’t read your Kiroshi account",
		signInFailed: "Couldn’t start signing in to Kiroshi",
		cancelFailed: "Couldn’t cancel signing in",
		signOutFailed: "Couldn’t sign out of Kiroshi",
	},
	plugin: {
		author: {
			bot: "A companion",
		},
	},
	profile: {
		name: {
			label: "Display name",
			placeholder: "No name",
		},
		picture: {
			file: "Profile picture file",
			add: "Add picture",
			change: "Change picture",
			remove: "Remove picture",
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
	space: {
		untitled: "Untitled space",
		name: {
			label: "Name",
			placeholder: "No name",
		},
		host: {
			label: "Host",
			hint: "This space lives on another Kiroshi. Its name is set there.",
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
				role: {
					label: "Role",
					guest: {
						label: "Guest",
						description: "Reads conversations, can’t send messages.",
					},
					member: {
						label: "Member",
						description:
							"Can do everything you can, including starting the agent and answering approvals.",
					},
				},
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
				"Invite people who aren’t on your network. {{name}} runs on this Mac, so they reach it while Kiroshi is open here.",
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
