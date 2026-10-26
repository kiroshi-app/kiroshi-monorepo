import type {
	BotEffort,
	BotOutputStyle,
	BotPermissionMode,
	BotSkillContext,
	BotSkillEffort,
} from "@workspace/ui/components/bot-settings"
import type { BotAvatarBlot } from "@workspace/ui/components/companion-colour"

const bots = {
	roster: {
		label: "Conversations",
		create: "Create a companion",
		createMenu: "Create",
		conversation: {
			create: "Start a conversation",
			others: "+{{count}}",
			preview: "{{name}}: {{text}}",
		},
		empty: "No companions yet",
		unavailable: "Couldn’t load your companions. Restart Kiroshi to retry.",
		previewUnreadable:
			"Couldn’t load the latest messages. Restart Kiroshi to retry.",
		conversationUnsaved:
			"Couldn’t save your change to this conversation. Make it again to retry.",
		mission: {
			state: {
				waiting: "waiting for you",
				failed: "blocked",
				ready: "ready to merge",
				working: "working",
			},
			unavailable: {
				title: "Couldn’t load missions",
				description: "Restart Kiroshi to retry.",
			},
		},
		actions: "Actions for {{name}}",
		titled: "{{name}} · {{title}}",
		settings: "Open settings",
		duplicate: "Duplicate",
		spaces: {
			label: "Spaces",
			lastSpace:
				"A companion stays in at least one space. To remove a companion from its last space, delete the companion.",
		},
		pin: "Pin",
		pinDrop: "Drop here to pin",
		unpin: "Unpin",
		delete: "Delete",
		needsYou: "Needs you",
		working: "{{pose}}…",
		pose: {
			thinking: "thinking",
			searching: "searching",
			working: "working",
			writing: "writing",
			waiting: "waiting",
		},
		idle: "idle",
		announcement: {
			none: "No companion selected",
			selected: "{{name}} selected, {{state}}",
		},
		section: {
			actions: "Actions for the {{name}} section",
			moveTo: "Move to section",
			none: "No section",
			create: "Create a section",
			createField: "New section name",
			createDefault: "New section",
			rename: "Rename",
			renameField: "Rename {{name}}",
			moveUp: "Move up",
			moveDown: "Move down",
			delete: "Delete",
			empty: "Drop a companion here",
			unreadable:
				"Couldn’t load the sections of this space. Restart Kiroshi to retry.",
		},
		seedRefused: "Your first companion couldn’t be set up",
	},
	rail: {
		label: "Navigation",
		conversations: "Conversations",
		missions: "Missions",
		searchMissions: "Search missions",
		spaceSettings: "Space settings",
		dot: "{{name}}, new activity",
		badge: {
			attention: "{{name}}, waiting for you",
			done: "{{name}}, activity finished",
			failed: "{{name}}, activity failed",
		},
	},
	spaces: {
		label: "Spaces",
		switch: "Change space, {{name}} open",
		switchHosted: "Change space, {{name}} open, {{host}}",
		switchInvited_one: "Change space, {{name}} open, 1 invitation",
		switchInvited_other: "Change space, {{name}} open, {{count}} invitations",
		switchHostedInvited_one:
			"Change space, {{name}} open, {{host}}, 1 invitation",
		switchHostedInvited_other:
			"Change space, {{name}} open, {{host}}, {{count}} invitations",
		open: "Open {{name}}",
		moveUp: "Move up",
		moveDown: "Move down",
		create: "Create a space",
		settings: "Open space settings",
		leave: "Leave space",
		shortcut: "⌘{{rank}}",
		share: "Share",
		host: {
			shared: "Shared",
			up: "Online",
			connecting: "Connecting…",
			down: "Not connected",
		},
		remove: {
			lastSpace: "A companion needs at least one space.",
			failed: "Couldn’t remove this companion from the space. Retry.",
		},
		invitations: {
			label: "Invitations",
			invitedBy: "Invited by {{email}}",
			expires: "Expires {{date}}",
			accept: "Accept",
			decline: "Decline",
			joining: "Joining…",
			retry: "Try again",
			failed: {
				servers: "Couldn’t accept. Kiroshi’s servers didn’t answer.",
				offline:
					"Couldn’t accept, this computer is offline. Try again once you’re connected.",
			},
			withdrawn:
				"{{email}} withdrew this invitation. Ask them to invite you again.",
			expired:
				"This invitation expired on {{date}}. Ask {{email}} to invite you again.",
			hostOffline:
				"{{host}}’s computer is offline. You can accept once it’s back.",
		},
		removed: {
			notice: "{{host}} removed you from {{name}}.",
			noticeDescription:
				"It’s gone from your spaces. Its conversations stay on {{host}}’s Kiroshi.",
			memberNotice: "You’re no longer a member of {{name}}",
			memberNoticeDescription:
				"Its conversations aren’t on this device anymore. Ask {{host}} for a new invitation.",
			deletedNotice: "{{host}} deleted {{name}}",
			deletedNoticeDescription:
				"Its conversations aren’t on this device anymore.",
		},
		signOut: {
			title: "Sign out of Kiroshi?",
			description:
				"{{name}} leaves this computer until you sign in again. Its conversations stay with {{host}}.",
			confirm: "Sign out",
			notice: "Signed out. {{name}} left this computer.",
		},
	},
	dialog: {
		untitled: "Untitled companion",
		breadcrumb: "Settings",
		tab: {
			general: "General",
			appearance: "Appearance",
			instructions: "Instructions",
			skills: "Skills",
			applications: "Applications",
			secrets: "Secrets",
			history: "History",
			approvals: "Approvals",
			runtime: "Runtime",
			danger: "Danger zone",
		},
		name: {
			label: "Name",
			placeholder: "No name",
		},
		title: {
			label: "Title",
			placeholder: "Short role label",
		},
		instructions: {
			label: "Instructions",
			placeholder: "The system prompt this companion always runs with",
		},
		memory: {
			label: "Memory",
			hint: "What this companion remembers across conversations. Edit it or clear it; it keeps learning either way.",
			empty: "This companion has no memories yet.",
			save: "Save memory",
			clear: {
				action: "Clear",
				title: "Clear this companion’s memory?",
				description:
					"It starts learning again from your next conversation. This can’t be undone.",
				confirm: "Clear the memory",
			},
		},
	},
	history: {
		empty: "No changes yet.",
		unavailable: "Couldn’t load the history. Reopen settings to retry.",
		summary_one:
			"Lists 1 change since {{date}}. Undoing one writes a new change, so nothing’s ever removed.",
		summary_other:
			"Lists {{count}} changes since {{date}}. Undoing one writes a new change, so nothing’s ever removed.",
		noMatch: "No change matches “{{text}}”.",
		retouches_one: "(1 go)",
		retouches_other: "({{count}} goes)",
		undone: "Undone above",
		recordFailed: {
			title: {
				bot: "Couldn’t add a companion’s change to History",
				user: "Couldn’t add a change to your profile to History",
				space: "Couldn’t add a change to the space to History",
			},
			description:
				"The change is still saved, but you can’t undo it from History ({{detail}}). Open settings to review it.",
		},
		day: {
			today: "Today",
			yesterday: "Yesterday",
		},
		search: {
			label: "Search the history",
			placeholder: "Search the history",
			clear: "Clear the search",
		},
		author: {
			user: "You",
		},
		diff: {
			show: "Show changes",
			hide: "Hide changes",
			loading: "Loading changes…",
			filename: "Changes",
		},
		undo: {
			action: "Undo",
			label: "Undo “{{title}}”",
			title: "Undo “{{title}}”?",
			description:
				"Everything goes back to how it was before this change. The undo is a change of its own, so you can undo it too.",
			confirm: "Undo this change",
		},
		change: {
			back: "History",
			date: "{{day}}, {{time}}",
			added_one: "1 line added",
			added_other: "{{count}} lines added",
			removed_one: "1 line removed",
			removed_other: "{{count}} lines removed",
			consequence: {
				counted_one:
					"Puts everything back to how it read before this change, across 1 file, and writes that as a new change you can undo too.",
				counted_other:
					"Puts everything back to how it read before this change, across {{count}} files, and writes that as a new change you can undo too.",
				uncounted:
					"Puts everything back to how it read before this change, and writes that as a new change you can undo too.",
			},
			unavailable:
				"Couldn’t read the files of this change. Go back and open it again to retry.",
		},
	},
	skills: {
		untitled: "Untitled skill",
		add: "Add skill",
		create: "Add skill",
		save: "Save skill",
		unsaved: "Unsaved changes",
		back: "All skills",
		section: {
			instructions: "Instructions",
			triggering: "Triggering",
			execution: "Execution",
			tools: "Tools",
			files: "Files",
			advanced: "Advanced",
		},
		empty: {
			title: "No skills yet",
			description:
				"Write a skill this companion can reuse, and choose whether it loads on every turn.",
		},
		name: {
			label: "Name",
			placeholder: "release-notes",
			hint: "Lowercase letters, numbers and hyphens. The companion reads the description, not the name.",
			blank: "A skill needs a name.",
		},
		description: {
			label: "Description",
			placeholder: "When this companion should use it",
		},
		whenToUse: {
			label: "When to use",
			placeholder: "The requests this skill answers",
		},
		budget: {
			label: "{{used}} of {{max}} characters",
			hint: "The description and when to use share one character budget.",
			over: "{{over}} characters over. Shorten either field to save.",
		},
		body: {
			label: "Body",
			placeholder: "Write the skill in markdown",
		},
		argumentHint: {
			label: "Argument hint",
			placeholder: "[version] [--draft]",
			hint: "What you’re asked for when you run this skill yourself.",
		},
		arguments: {
			label: "Arguments",
			placeholder: "One argument per line",
		},
		paths: {
			label: "Paths",
			placeholder: "docs/**/*.md",
			hint: "One glob per line. The files that make this skill relevant.",
		},
		modelInvocation: {
			label: "Keep the companion from reaching for it",
			description:
				"Off, the companion decides from the description. On, only you can run it.",
		},
		userInvocable: {
			label: "Let you invoke it",
			description:
				"It shows in the command menu. Run it by name with the arguments above.",
		},
		preloaded: {
			label: "Preload this skill",
			tag: "Preloaded",
			description:
				"On, it’s in this companion’s prompt every turn. Off, the companion reads it only when needed.",
		},
		system: {
			tag: "System",
			notice:
				"Kiroshi writes this skill and keeps it current. It’s read-only here.",
		},
		model: {
			label: "Model",
			placeholder: "The companion’s own",
			hint: "Leave empty to use the companion’s model.",
		},
		effort: {
			label: "Effort",
			default: "The companion’s own",
			option: {
				low: "Low",
				medium: "Medium",
				high: "High",
			} as const satisfies Record<BotSkillEffort, string>,
		},
		context: {
			label: "Context",
			default: "The conversation it runs from",
			hint: "Fork runs the skill in a copy of the conversation. Agent and Run in the background only apply to a fork.",
			option: {
				shared: "Shared",
				fork: "Fork",
			} as const satisfies Record<BotSkillContext, string>,
		},
		shell: {
			label: "Shell",
			placeholder: "/bin/zsh",
			hint: "The shell this skill’s commands run in. Leave empty to use your default.",
		},
		agent: {
			label: "Agent",
			placeholder: "The companion itself",
			hint: "Who runs the fork.",
		},
		background: {
			label: "Run in the background",
			description:
				"The fork finishes on its own while the conversation continues.",
		},
		allowedTools: {
			label: "Allowed tools",
			placeholder: "Read\nGrep",
			hint: "One tool name per line. Leave empty to allow every tool the companion has.",
		},
		disallowedTools: {
			label: "Disallowed tools",
			placeholder: "Bash",
		},
		hooks: {
			label: "Hooks",
			placeholder: '{\n  "PreToolUse": []\n}',
			hint: "What runs around this skill’s turn, as the bundle defines it.",
		},
		license: {
			label: "License",
			placeholder: "MIT",
		},
		compatibility: {
			label: "Compatibility",
			placeholder: ">=1.4",
			hint: "What this skill needs from its runtime.",
		},
		metadata: {
			label: "Metadata",
			placeholder: '{\n  "author": "Ada Martin"\n}',
			hint: "Extra bundle data Kiroshi doesn’t use. It’s kept as is.",
		},
		leave: {
			title: "Leave without saving?",
			description:
				"You’ll lose your unsaved changes. The saved skill stays as it is.",
			action: "Leave",
		},
		delete: {
			action: "Delete skill",
			description:
				"The companion can no longer use this skill. This can’t be undone.",
			confirm: {
				title: "Delete {{name}}?",
			},
		},
		files: {
			back: "All files",
			save: "Save file",
			loading: "Loading file…",
			retry: "Try again",
			add: {
				label: "New file",
				placeholder: "reference/api.md",
				hint: "A path inside the skill’s folder. The file opens empty.",
				blank: "A file needs a path.",
				taken: "This skill already has a file at that path.",
				action: "Add file",
			},
			text: {
				label: "Contents",
				placeholder: "What this file holds",
			},
			failure: {
				read: "Couldn’t open this file. Retry.",
				write: "Couldn’t save this file. Save again; your text is still here.",
				delete: "Couldn’t delete this file. Retry.",
			},
			delete: {
				action: "Delete file",
				description:
					"The file is deleted from the skill’s folder. This can’t be undone.",
				confirm: {
					title: "Delete {{path}}?",
				},
			},
		},
	},
	applications: {
		untitled: "Untitled application",
		add: "Add an application",
		create: "Add application",
		save: "Save changes",
		unsaved: "Unsaved changes",
		back: "All applications",
		search: "Search applications",
		paste: "Paste a configuration",
		verified: "Verified",
		uses_one: "{{count}} use",
		uses_other: "{{count, number}} uses",
		hostedOn: "Runs on <host>{{host}}</host>",
		intro: {
			companion:
				"What {{name}} connects to for tools it doesn’t have on its own.",
			space: "What every companion in {{name}} connects to.",
			profile: "What you connect to, in every space.",
		},
		footnote: {
			space:
				"Each companion here can add applications of its own, and you can add some for every space.",
			profile: "These reach every companion you have, in every space.",
		},
		open: "Open {{name}}",
		section: {
			connection: "Connection",
			secrets: "Secrets",
			advanced: "Advanced",
		},
		connection: {
			state: {
				connected: "Connected",
				needsAuthorization: "Needs authorization",
				connecting: "Connecting…",
				failed: "Couldn’t connect",
			},
			connect: "Connect",
			retry: "Retry",
			cancel: "Cancel",
			disconnect: "Disconnect",
			row: {
				connect: "Connect {{name}}",
				retry: "Retry {{name}}",
			},
			waiting: "Waiting for your browser",
			description: {
				needsAuthorization:
					"{{name}} signs you in through your browser. Kiroshi keeps the token with this application’s secrets, never in the configuration below.",
				connecting:
					"A tab is open at {{host}}. Authorize Kiroshi there and this screen catches up on its own.",
				unsaved: "Available once this application is saved.",
			},
			reason: {
				alreadyRunning:
					"A sign-in is already running. Finish that one, or cancel it, then try again.",
				store:
					"Kiroshi couldn’t write the token to this application’s secrets, so nothing was kept.",
				transport:
					"Kiroshi couldn’t reach the agent, so the sign-in never started.",
				refusedUrl:
					"Kiroshi wouldn’t open the sign-in link this application gave. Check its address.",
				browserRefused:
					"Your browser wouldn’t open. Try again, or open the sign-in link yourself.",
				timedOut: "The sign-in timed out before it came back. Try again.",
				unknown: "The sign-in stopped: {{detail}}",
			},
			confirm: {
				title: "Disconnect {{name}}?",
				description:
					"Kiroshi drops the token and asks {{name}} to forget it. This companion loses its {{name}} tools until you connect again.",
			},
			session: {
				title: "{{name}} was left out",
			},
			refused: {
				title: "The sign-in stopped working",
				description_one:
					"Kiroshi couldn’t refresh the token, so {{name}}’s only tool was left out of {{companion}}’s {{sessions}}. Signing in again is usually all it takes.",
				description_other:
					"Kiroshi couldn’t refresh the token, so {{name}}’s {{count}} tools were left out of {{companion}}’s {{sessions}}. Signing in again is usually all it takes.",
				sessions_one: "last session",
				sessions_other: "last {{count}} sessions",
				action: "Sign in again",
			},
		},
		install: {
			signIn: {
				title: "{{name}} signs you in",
				description:
					"A browser tab opens as soon as you add it. Kiroshi keeps the token with this application’s secrets, and refreshes it on its own.",
				action: "Add and sign in",
				fact: "Signs you in. {{name}} opens in your browser and asks to allow Kiroshi.",
			},
			key: {
				title: "What {{name}} needs to run",
				reveal: "Show",
				conceal: "Hide",
				revealLabel: "Show {{field}}",
				concealLabel: "Hide {{field}}",
				description: {
					companion:
						"Kept with this application’s secrets, never in the configuration. {{name}} sees the tools, never these values.",
					space:
						"Kept with this application’s secrets, never in the configuration. Every companion in {{name}} sees the tools, never these values.",
					profile:
						"Kept with this application’s secrets, never in the configuration. Every companion you have sees the tools, never these values.",
				},
			},
			none: "Nothing to set up. It runs on this machine, with no key and no sign-in.",
			hostedNone: "Nothing to set up. No key, no sign-in.",
			unavailable: {
				title: "Kiroshi can’t add {{name}}",
				description: "It can’t be added from here: {{reason}}.",
			},
			hosting: "Runs on <host>{{host}}</host>, not on this machine.",
			tools: {
				title: "What it brings",
				count: {
					plain_one: "{{count}} tool",
					plain_other: "{{count}} tools",
				},
			},
			footnote: {
				companion:
					"Applications run on your machine, under your account. Adding one reopens {{name}}’s session so the tools are there straight away.",
				space:
					"Applications run on your machine, under your account. Adding one here gives every companion in {{name}} its tools.",
				profile:
					"Applications run on your machine, under your account. Adding one here gives every companion you have its tools, in every space.",
			},
			hostedFootnote: {
				companion:
					"This one runs on {{source}}’s server, not on your machine. Adding it reopens {{name}}’s session so the tools are there straight away.",
				space:
					"This one runs on {{source}}’s server, not on your machine. Adding it here gives every companion in {{name}} its tools.",
				profile:
					"This one runs on {{source}}’s server, not on your machine. Adding it here gives every companion you have its tools, in every space.",
			},
			done: "Added",
			failed: "Couldn’t add it: {{reason}}",
			missing: "No value for {{fields}}.",
			rollback: {
				title: "{{name}} was left in the list",
				description:
					"Its key wasn’t written, and removing it again was refused too: {{reason}}.",
			},
		},
		notice:
			"This companion runs applications on your machine, under your account. Only add ones you trust.",
		empty: {
			title: {
				companion: "No applications of its own",
				space: "Nothing shared in {{name}} yet",
				profile: "No applications of your own",
			},
			description: {
				companion:
					"Add one here and this companion gets tools it doesn’t have on its own. It runs on your machine.",
				space: "Add one here and every companion in this space gets its tools.",
				profile:
					"Add one here and every companion you have gets its tools, in every space. Good for what is yours rather than a project’s.",
			},
		},
		catalogue: {
			loading: "Loading the applications catalogue…",
			directory: "From the curated directory.",
			empty: "Nothing in this category yet.",
			failed: "Couldn’t reach the applications catalogue.",
			partlyFailed:
				"Couldn’t read part of the catalogue. Retry to see the rest.",
			stale: "This listing was read more than a day ago.",
			retry: "Retry",
			category: {
				everything: "Everything",
				"on-this-machine": "On this machine",
				"commerce-shopping": "Commerce & shopping",
				communication: "Communication",
				"consumer-health": "Consumer health",
				creative: "Creative",
				"data-analytics": "Data & analytics",
				"developer-tools": "Developer tools",
				education: "Education",
				"financial-services": "Financial services",
				"health-life-sciences": "Health & life sciences",
				legal: "Legal",
				"media-entertainment": "Media & entertainment",
				nonprofit: "Nonprofit",
				productivity: "Productivity",
				"sales-marketing": "Sales & marketing",
				travel: "Travel",
				other: "Other",
			},
			unavailable: "Couldn’t read the applications Kiroshi knows.",
			unrefreshed: {
				title: "Couldn’t refresh the applications directory",
				description:
					"You’re seeing the last listing read. Open the catalogue again to retry.",
			},
			nothing: "Nothing matched {{query}}. Try another name.",
			setup: {
				signIn: "Signs you in",
				apiKey: "Needs an API key",
				none: "Nothing to set up",
				unavailable: "Can’t be added here",
			},
		},
		unavailable: "Couldn’t load applications. Reopen settings to retry.",
		reopen: {
			refused: {
				title: "Couldn’t reopen {{companion}}’s session",
				description: "{{name}} reaches it the next time that session opens.",
			},
		},
		name: {
			label: "Name",
			placeholder: "atlas",
			hint: "Lowercase letters, numbers and hyphens. The companion knows the application by this name.",
			blank: "An application needs a name.",
		},
		config: {
			label: "Configuration",
			placeholder:
				'{\n  "command": "npx",\n  "args": ["-y", "@scope/server"]\n}',
			hint: "Paste the JSON from the application’s instructions. A local application names a command, a remote one a URL.",
			invalid: "This isn’t a JSON object. Check the braces, commas and quotes.",
		},
		transport: {
			label: "Transport",
			hint: "A local application runs a command. A remote one connects to a URL.",
			option: {
				local: "Started on this machine",
				remote: "Reached over the network",
			},
		},
		command: {
			label: "Command",
			placeholder: "npx",
			hint: "The program this companion starts. It runs with your account’s access.",
		},
		args: {
			label: "Arguments",
			placeholder: "-y\n@scope/server",
			hint: "One argument per line, in order.",
		},
		url: {
			label: "URL",
			placeholder: "https://example.com/mcp",
			hint: "The address this companion connects to. Nothing runs on your machine.",
		},
		endpoint: {
			label: "Endpoint",
			hint: "How Kiroshi reaches the URL. Streamable HTTP counts as HTTP.",
			option: {
				http: "HTTP",
				sse: "Server-sent events",
				ws: "WebSocket",
			},
		},
		headers: {
			label: "Headers",
			placeholder: "Authorization: Bearer token",
			hint: "One header per line, as name and value. Put the application’s key here.",
		},
		secrets: {
			label: "Secrets",
			placeholder: "ATLAS_TOKEN=sk-…",
			hint: "One name and value per line. The application gets these secrets and no others.",
		},
		leave: {
			title: "Leave without saving?",
			description:
				"You’ll lose your unsaved changes. The saved application stays as it is.",
			action: "Leave",
		},
		launch: {
			label: "What this starts",
			secrets: "Secrets",
			unknown: "Add a command or a URL to this configuration.",
			reveal: "Show the value of {{name}}",
			conceal: "Hide the value of {{name}}",
		},
		delete: {
			action: "Remove application",
			description: "This companion stops starting it. This can’t be undone.",
			confirm: {
				title: "Remove {{name}}?",
			},
		},
	},
	secrets: {
		add: "Add secret",
		notice:
			"Kiroshi passes each value to what runs here and never shows it again.",
		unreadable: {
			title: "Couldn’t load secrets",
			description: "Reopen settings to retry.",
		},
		empty: {
			title: "No secrets yet",
			description:
				"Add a secret to pass a value to what runs here. You won’t see the value again.",
		},
		scope: {
			user: "You",
			space: "Space",
			bot: "Companion",
			server: "Application",
		},
		row: {
			scopes: "Defined in {{defined}} · Served from {{served}}",
			overridden: "Overridden by {{scope}}",
			overriding: "Overrides {{scope}}",
			needsValue: "Needs a value",
			unsetHere: "Unset here",
			noValue: "Defined in {{defined}} · No value",
			replace: "Replace the value of {{name}}",
			remove: "Remove {{name}}",
		},
		set: {
			add: {
				title: "Add a secret",
				description:
					"The value goes to what runs here. You won’t see it again.",
			},
			replace: {
				title: "Replace a value",
				description:
					"Type a new value for {{name}}. The current one stays hidden.",
			},
			name: {
				label: "Name",
				placeholder: "ATLAS_TOKEN",
				hint: "Capital letters, digits and underscores. Programs read the secret by this name.",
				invalid:
					"Use capital letters, digits and underscores, starting with a letter or an underscore.",
			},
			value: {
				label: "Value",
				hint: "Saved once and never shown again.",
			},
			submit: "Save secret",
			failed: "Couldn’t save this secret. Retry.",
		},
		remove: {
			title: "Remove {{name}}?",
			description: "Nothing here receives it anymore. This can’t be undone.",
			action: "Remove secret",
			failed: "Couldn’t remove this secret. Retry.",
		},
	},
	runtime: {
		model: {
			label: "Model",
			placeholder: "Choose a model",
			unreadable: "Couldn’t read the models this machine offers.",
		},
		effort: {
			label: "Effort",
			option: {
				default: "Default",
				low: "Low",
				medium: "Medium",
				high: "High",
				xhigh: "Extra high",
				max: "Max",
			} as const satisfies Record<BotEffort | "default", string>,
		},
		outputStyle: {
			label: "Answer style",
			option: {
				Concise: {
					label: "Concise",
					hint: "Short answers that lead with the result.",
				},
				default: {
					label: "Standard",
					hint: "The agent’s standard answers.",
				},
			} as const satisfies Record<
				BotOutputStyle,
				{ label: string; hint: string }
			>,
		},
	},
	approvals: {
		mode: {
			label: "Default answer to a request",
			option: {
				auto: {
					label: "Decide alone",
					hint: "The companion decides on its own, within the rules below.",
				},
				default: {
					label: "Ask every time",
					hint: "You approve every tool the rules below don’t cover.",
				},
				acceptEdits: {
					label: "Accept edits",
					hint: "File edits go through. You approve everything else.",
				},
				plan: {
					label: "Plan first",
					hint: "The companion reads and plans, and changes nothing until you approve.",
				},
				dontAsk: {
					label: "Never ask",
					hint: "You’re never asked. Only the deny rules below stop the companion.",
				},
			} as const satisfies Record<
				BotPermissionMode,
				{ label: string; hint: string }
			>,
		},
		rule: {
			add: "Add",
			placeholder: "Bash(git status:*)",
			invalid: "Write a rule as Tool or Tool(specifier).",
			remove: "Remove the rule {{rule}}",
			allow: {
				label: "Allowed",
				hint: "Runs without asking you.",
				empty: "No allow rules yet.",
			},
			ask: {
				label: "Asked",
				hint: "Asks you every time, whatever the mode.",
				empty: "No ask rules yet.",
			},
			deny: {
				label: "Denied",
				hint: "Always refused, whatever the mode.",
				empty: "No deny rules yet.",
			},
		},
	},
	identity: {
		avatar: "Avatar",
		uploadedImage: "Uploaded image",
		colour: {
			label: "Colour",
			none: "No colour",
			option: {
				red: "Red",
				yellow: "Yellow",
				green: "Green",
				cyan: "Cyan",
				blue: "Blue",
				purple: "Purple",
				pink: "Pink",
				orange: "Orange",
			} as const satisfies Record<BotAvatarBlot, string>,
		},
		picture: {
			label: "Picture",
			file: "Avatar image file",
			add: "Add picture",
			change: "Change picture",
			remove: "Remove picture",
		},
	},
	danger: {
		delete: "Delete companion",
		description:
			"The companion is deleted everywhere, not just removed from its spaces. This can’t be undone.",
		confirm: {
			title: "Delete {{name}}?",
		},
		failed: "Couldn’t delete this companion. Retry.",
	},
} as const

export { bots }
