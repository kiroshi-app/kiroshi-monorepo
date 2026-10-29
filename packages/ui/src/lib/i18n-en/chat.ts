import type { ConversationIconName } from "@workspace/ui/components/icons"

const chat = {
	emptyState: {
		ready: {
			title: "Start with the agent",
			description:
				"Kiroshi talks to the agent directly. Nothing leaves your device.",
			descriptionNamed:
				"Kiroshi talks to {{name}} directly. Nothing leaves your device.",
		},
		unavailable: {
			title: "Couldn’t reach the agent",
			titleNamed: "Couldn’t reach {{name}}",
			description: "Kiroshi’s built-in agent didn’t answer. Try again.",
			descriptionNamed: "{{name}} didn’t answer. Try again.",
		},
		notConnected: {
			title: "You’re not signed in",
			description: "Connect your Claude account so your agents can answer.",
		},
		settings: "Open agent settings",
		hint: "Message an agent to start.",
		setup: "Try again",
		signIn: "Sign in",
	},
	conversationEmptyState: {
		description_one: "{{count}} agent is ready.",
		description_other: "{{count}} agents are ready.",
		hint: "Message an agent to start.",
		nobody: {
			title: "Nobody is in this conversation yet",
			description:
				"Type @ and pick a name. Whoever you mention joins, and they can bring in anyone else they need.",
			suggested: "The ones you talk to most",
		},
	},
	conversationArrival: {
		invitedByPerson: "{{name}} joined this conversation, invited by you",
		invitedByAgent: "{{name}} joined this conversation, invited by {{inviter}}",
		createdBy: "{{creator}} created {{name}}",
	},
	connection: {
		checking: "Checking {{name}}…",
		ready: "{{name}} is ready",
		unavailable: "{{name}} is unavailable",
		crashed: "{{name}} stopped",
	},
	transcript: {
		label: "Conversation",
		loadOlder: "Load older messages",
		loadNewer: "Load newer messages",
		jumpToLatest: "Jump to latest",
		newMessages: "New messages",
		newCounted_one: "{{count}} new message",
		newCounted_other: "{{count}} new messages",
		startOfHistory: "Beginning of the conversation",
		day: {
			today: "Today",
			yesterday: "Yesterday",
		},
		landing: {
			unavailable: {
				title: "Couldn’t open that message",
				description: "Open the search result again.",
			},
		},
		message: {
			user: "user message",
			assistant: "assistant message",
			person: "message from {{name}}",
			mission: "mission opened",
			actions: "Message actions",
		},
		showMore: "Show more",
		showLess: "Show less",
		author: {
			lead: "Lead",
			deleted: "Deleted agent",
		},
		cause: {
			label: "Routine report",
			mission: "Mission summons",
			unavailable: {
				title: "Couldn’t load routine reports",
				description: "Reopen the conversation to retry.",
				soloDescription: "Reopen the conversation to retry.",
			},
		},
		mention: {
			unknown: "Unknown agent",
			counted_one: "{{count}} mention",
			counted_other: "{{count}} mentions",
			unresolved: {
				title_one: "Couldn’t summon an agent",
				title_other: "Couldn’t summon these agents",
				description_one:
					"{{names}} was named but holds no seat in this conversation.",
				description_other:
					"{{names}} were named but hold no seat in this conversation.",
			},
			notStarted: {
				title_one: "{{names}} didn’t start",
				title_other: "{{names}} didn’t start",
				description_one: "Seat it in this conversation, or pick another agent.",
				description_other:
					"Seat them in this conversation, or pick other agents.",
			},
		},
	},
	turn: {
		copy: "Copy",
		reply: "Reply",
		pin: "Pin",
		unpin: "Unpin",
		copied: "Copied",
		retry: "Retry",
		cancel: "Cancel this message",
		footer: {
			cancelled: "Stopped",
			failed: "This response failed",
			queued: "Waiting to be sent",
		},
	},
	reply: {
		label: "Replying to {{author}}",
		dismiss: "Cancel reply",
	},
	pinned: {
		title: "Pinned messages",
		counted_one: "Pinned messages, {{count}} pinned",
		counted_other: "Pinned messages, {{count}} pinned",
		jump: "Jump",
		jumpTo: "Jump to the message from {{author}}",
		unpin: "Unpin the message from {{author}}",
		empty: "No pinned messages in this conversation yet.",
		unavailable: {
			title: "Couldn’t sync pinned messages",
			description: "Try again in a moment.",
		},
	},
	working: {
		name: "No name",
		verb: {
			thinking: "thinking",
			searching: "searching",
			working: "working",
			writing: "writing",
			waiting: "waiting for you",
		},
		state: "{{name}} is {{verb}}…",
		labelled: "{{name}} · {{label}}",
		mcp: "{{server}} · {{tool}}",
		waitingTitled: "{{name}} is waiting for you… · {{title}}",
		upNext: "{{name}} is up next…",
		stop: "Stop {{name}}",
	},
	notice: {
		retry: "Retry",
		dismiss: "Dismiss notice",
	},
	spaceAccessBanner: {
		offline: {
			title: "{{space}} is offline",
			body: "You can read what’s here. You can send again once Kiroshi is open on {{host}}’s computer.",
			reasons: {
				relayUnreachable:
					"You can read what’s here. Couldn’t reach Kiroshi, check your connection to send again.",
				rekeySendFailed:
					"You can read what’s here. Couldn’t ask {{host}} for the new key, check your connection to send again.",
				hostSilent:
					"You can read what’s here. {{host}} hasn’t answered yet, ask them to open Kiroshi on their computer.",
				socketClosed:
					"You can read what’s here. The connection to Kiroshi closed, check your connection to send again.",
				rekeyNotVerified:
					"You can read what’s here. Couldn’t verify the key {{host}} sent, ask them for a new link.",
				notMember:
					"You can read what’s here. Kiroshi says this account isn’t in {{space}} anymore, ask {{host}} for a new link.",
				unknownInstance:
					"You can read what’s here. Kiroshi doesn’t host {{space}} anymore, ask {{host}} to turn hosting on again.",
				deviceKeysUnreadable:
					"You can read what’s here. Couldn’t read this computer’s device keys, quit Kiroshi and open it again.",
				deviceAwaitingApproval:
					"You can read what’s here. This computer isn’t approved yet, approve it from another computer signed in to your account.",
				socketUrlFailed:
					"You can read what’s here. Couldn’t get {{space}}’s address from Kiroshi, quit Kiroshi and open it again.",
				rosterMissing:
					"You can read what’s here. {{host}} hasn’t sent the member list yet, ask them to open Kiroshi on their computer.",
				keychainReadFailed:
					"You can read what’s here. Couldn’t read {{space}}’s key from this computer’s secure storage, quit Kiroshi and open it again.",
			},
		},
	},
	attachments: {
		label: "Attachments",
		open: "Open {{name}}",
		remove: "Remove {{name}}",
		attach: "Attach files",
	},
	composer: {
		label: "Message",
		placeholder: "Message",
		send: "Send",
		offline:
			"{{space}} is offline. You can write again once {{host}}’s computer is back.",
		commands: "Commands",
		mentions: "Agents",
		lead: "Lead",
		mentioned_one: "{{count}} mention in the draft",
		mentioned_other: "{{count}} mentions in the draft",
		outside: "Not in this conversation",
		invite: "Add to this conversation",
		further_one: "Keep typing to reach the other {{count}} in {{space}}",
		further_other: "Keep typing to reach the other {{count}} in {{space}}",
	},
	toolApproval: {
		title: "Allow this tool to run?",
		status: {
			pending: "Approval required",
			allowed: "Allowed once",
			denied: "Denied",
		},
		sensitive: "Hidden",
		input: "Tool input",
		allowOnce: "Allow once",
		deny: "Deny",
	},
	toolQuestion: {
		freeText: "Other answer",
		freeTextPlaceholder: "Write your own answer…",
		blank: "Answer this question to continue.",
		preview: "Preview",
		submit: "Send answers",
		send: "Send",
		next: "Go to the next question",
		nextLabel: "Next",
		continue: "Continue",
		skip: "Skip",
		minimise: "Minimize",
		pickAny: "Choose any that apply.",
		waiting: {
			title: "{{name}} is waiting on your answer",
			unnamedTitle: "Waiting on your answer",
			mark: "?",
			answer: "Answer",
		},
		copy: "Copy",
		copied: "Copied",
		copyAnnounced: "Link copied to clipboard",
		copyFailed: "Couldn’t copy. Select the link and copy it yourself.",
	},
	answeredQuestion: {
		byViewer: "You answered",
		byMember: "{{name}} answered",
	},
	applicationInstall: {
		openSettings: "Open Settings",
		receipt: {
			agent: "{{destination}} has {{name}} in every conversation.",
			space: "Every agent in {{destination}} has {{name}}.",
			user: "You have {{name}} in every conversation.",
		},
		secret_one: "Its key goes in {{secret}}.",
		secret_other: "Its keys go in {{secret}}.",
		unreadable: "Couldn’t read the applications added to this conversation.",
	},
	code: {
		snippet: "Code snippet",
		namedSnippet: "Code snippet, {{name}}",
		copy: "Copy code",
		copied: "Copied",
		copyTooltip: "Copy",
		copyAnnounced: "Code copied to clipboard",
		copyFailed: "Couldn’t copy the code. Try again.",
		writing: "Writing",
		ready: "Ready",
	},
	table: {
		label: "Table",
		copy: "Copy table",
		copyAnnounced: "Table copied to clipboard",
	},
	diagram: {
		label: "Diagram",
	},
	task: {
		done: "Done",
		todo: "To do",
	},
	screen: {
		label: "Agent conversation",
		identity: "{{name}} · agent settings",
		conversationIdentity: "{{name}} · conversation settings",
		placeholder: "Message {{name}}",
		approval: {
			description: "The agent needs your approval to run this tool.",
			descriptionNamed: "{{name}} needs your approval to run this tool.",
			path: "Path",
		},
		question: {
			recall: "{{author}} is waiting on your answer",
		},
		attachmentsRefused: "Couldn’t attach files",
		restart: "Restart session",
		notice: {
			crashed: "The agent stopped",
			crashedNamed: "{{name}} stopped",
			resumeFailed: "Couldn’t resume the conversation",
			settingsRejected: "Couldn’t apply the agent’s settings",
			settingsRejectedNamed: "Couldn’t apply {{name}}’s settings",
			serverEnvRejected: "Couldn’t start an application",
			notAuthenticated: "You’re not signed in",
			unavailable: "Couldn’t reach the agent",
			unavailableNamed: "Couldn’t reach {{name}}",
			failed: "Couldn’t send that request",
			stopFailed: "Couldn’t stop the agent",
			stopFailedNamed: "Couldn’t stop {{name}}",
			dockBadgeFailed: "Couldn’t update the count on the Kiroshi icon",
			questionRunFailed: {
				title: "{{name}} stopped before you answered",
				description:
					"The run failed, so the question is gone. Send a message to start again.",
			},
			unauthorized: {
				title: "The host refused this call.",
				description: "Open the link from the desktop app again.",
			},
			hostOnly:
				"Only the host of this space can do that. Ask them to do it from their Kiroshi.",
			hostOffline: {
				title: "Couldn’t reach the host of this space",
				description:
					"Its computer is offline. Try again once it’s back online.",
			},
			describeRefused: {
				title: "Couldn’t save the name and colour",
				description: "{{reason}} The space kept its previous name and colour.",
			},
			joinRefused: {
				unavailable: {
					title: "Couldn’t open the spaces you joined",
					description:
						"Kiroshi can’t read its saved data on this computer. Restart Kiroshi, then try again.",
				},
				storage: {
					title: "Couldn’t read this space’s connection",
					description:
						"Kiroshi couldn’t load what it saved about this space. Try again in a moment.",
				},
				unknownJoinedSpace: {
					title: "This space is no longer in your list",
					description:
						"You may have left it. Ask its host for a new invitation.",
				},
				undeliverable: {
					title: "Couldn’t open this space",
					description:
						"Kiroshi couldn’t pass the request on. Restart Kiroshi, then try again.",
				},
				proxyUnavailable: {
					title: "Couldn’t connect to this space",
					description:
						"The connection to its host couldn’t be opened. Check your network, then try again.",
				},
				ownerNotRemovable: {
					title: "You own this space",
					description: "An owner can’t leave their own space.",
				},
				needsSignIn: {
					title: "Couldn’t leave this space",
					description: "You’re signed out. Sign in, then try again.",
				},
				sessionRevoked: {
					title: "Couldn’t leave this space",
					description: "Your session ended. Sign in again, then try again.",
				},
				sessionStore: {
					title: "Couldn’t leave this space",
					description:
						"Kiroshi couldn’t read your sign-in on this computer. Restart Kiroshi, then try again.",
				},
				relayUnreachable: {
					title: "Couldn’t leave this space",
					description:
						"Kiroshi couldn’t reach its cloud. Check your network, then try again.",
				},
				relayRefused: {
					title: "Couldn’t leave this space",
					description:
						"Kiroshi’s cloud didn’t confirm you left. Try again in a moment.",
				},
				invitationExpired: {
					title: "This invitation expired",
					description: "Ask the host to invite you again.",
				},
				invitationWithdrawn: {
					title: "This invitation was withdrawn",
					description:
						"The host took it back. Ask the host to invite you again.",
				},
				invitationUsed: {
					title: "This invitation was already used",
					description:
						"An invitation is accepted once. Ask the host to invite you again.",
				},
				invitationOtherEmail: {
					title: "This invitation is for another email",
					description:
						"Sign in with the email the host invited, then accept it again.",
				},
				couldNotAccept: {
					title: "Couldn’t accept this invitation",
					description:
						"Kiroshi’s cloud didn’t take it. Check your connection, then try again.",
				},
				noInvitation: {
					title: "You’re not invited to this space",
					description:
						"Your account holds no invitation for it. Ask the host to invite you, then open the link again.",
				},
				notInRoster: {
					title: "This computer isn’t in the space",
					description:
						"Its host didn’t list this computer. Ask the host for a new link.",
				},
				badSignature: {
					title: "Couldn’t trust this space’s answer",
					description:
						"Its keys didn’t match what the host signed. Ask the host for a new link.",
				},
				removedByRotation: {
					title: "This computer was removed from the space",
					description:
						"Its host no longer lets it in. Ask the host for a new link to join again.",
				},
				waitingForHost: {
					title: "Waiting for the host",
					description:
						"This space opens once its host is online and lets this computer in.",
					reasons: {
						relayUnreachable:
							"Couldn’t reach Kiroshi to open this space. Check your connection.",
						rekeySendFailed:
							"Couldn’t ask the host for this space’s key. Check your connection.",
						hostSilent:
							"The host hasn’t let this computer in yet. Ask them to open Kiroshi on their computer.",
						socketClosed:
							"The connection to Kiroshi closed before this space opened. Check your connection.",
						rekeyNotVerified:
							"Couldn’t verify the key the host sent for this space. Ask the host for a new link.",
						notMember:
							"Kiroshi says this account isn’t a member of this space. Ask the host for a new link.",
						unknownInstance:
							"Kiroshi doesn’t host this space anymore. Ask the host to turn hosting on again.",
						deviceKeysUnreadable:
							"Couldn’t read this computer’s device keys. Quit Kiroshi and open it again.",
						deviceAwaitingApproval:
							"This computer isn’t approved yet. Approve it from another computer signed in to your account.",
						socketUrlFailed:
							"Couldn’t get this space’s address from Kiroshi. Quit Kiroshi and open it again.",
						rosterMissing:
							"The host hasn’t sent this space’s member list yet. Ask them to open Kiroshi on their computer.",
						keychainReadFailed:
							"Couldn’t read this space’s key from this computer’s secure storage. Quit Kiroshi, open it again, and allow access if this computer asks.",
					},
				},
				keyStore: {
					title: "Couldn’t read this computer’s keys",
					description:
						"Kiroshi couldn’t open the keys it keeps for your spaces. Restart Kiroshi, then try again.",
				},
				unexpected: {
					title: "Something went wrong with this space",
					description:
						"Kiroshi couldn’t finish the request. Try again in a moment.",
				},
			},
			readFailed: "Couldn’t load earlier messages",
		},
		transport: {
			binaryNotFound: "Couldn’t find the agent. Reinstall Kiroshi.",
			binaryNotFoundNamed: "Couldn’t find {{name}}. Reinstall Kiroshi.",
			notAuthenticated:
				"You’re signed out of your Claude subscription. Sign in to Claude, then restart the conversation.",
			notConnected:
				"Your Claude account isn’t connected. Sign in to keep talking.",
			authCheckFailed:
				"Couldn’t check your sign-in ({{detail}}). Restart the session.",
			spawnFailed:
				"Couldn’t start the agent ({{detail}}). Restart the session.",
			spawnFailedNamed:
				"Couldn’t start {{name}} ({{detail}}). Restart the session.",
			startupTimeout:
				"The agent didn’t answer within {{timeoutMs}} ms. Restart the session.",
			startupTimeoutNamed:
				"{{name}} didn’t answer within {{timeoutMs}} ms. Restart the session.",
			crashed: "The agent exited (code {{code}}). Restart the session.",
			crashedNamed: "{{name}} exited (code {{code}}). Restart the session.",
			crashedDetail:
				"The agent exited (code {{code}}): {{detail}}. Restart the session.",
			crashedDetailNamed:
				"{{name}} exited (code {{code}}): {{detail}}. Restart the session.",
			crashedUnknownCode:
				"The agent exited (code unknown). Restart the session.",
			crashedUnknownCodeNamed:
				"{{name}} exited (code unknown). Restart the session.",
			crashedUnknownCodeDetail:
				"The agent exited (code unknown): {{detail}}. Restart the session.",
			crashedUnknownCodeDetailNamed:
				"{{name}} exited (code unknown): {{detail}}. Restart the session.",
			resumeFailed:
				"The agent started a new session. Keep going, your messages are still here.",
			resumeFailedNamed:
				"{{name}} started a new session. Keep going, your messages are still here.",
			invalidFrame: "Skipped an unreadable frame ({{detail}}). Keep going.",
			settingsRejected:
				"Couldn’t apply settings.json ({{detail}}). Fix it, then restart the session.",
			serverEnvRejected:
				"{{detail}}. The other applications still run, so fix this one and restart the session.",
			notStarted: "No session is running. Start a session to continue.",
			turnAlreadyRunning: "A turn is already running. Wait for it or stop it.",
			transitionInProgress: "The session is already changing. Wait a moment.",
			noActiveTurn: "There’s no turn to stop.",
			staleRuntimeSession:
				"That session was replaced. Keep going in the current one.",
			unknownPermission:
				"Couldn’t match this approval request ({{id}}). Dismiss it.",
			writeFailed: "Couldn’t send the message ({{detail}}). Retry.",
			runLapsedSilent:
				"The agent stopped answering, so its reply ended. Send your message again.",
			runLapsedSilentNamed:
				"{{name}} stopped answering, so its reply ended. Send your message again.",
			runLapsedInterrupt:
				"The agent didn’t answer the stop, so its reply ended. Send your message again.",
			runLapsedInterruptNamed:
				"{{name}} didn’t answer the stop, so its reply ended. Send your message again.",
			readFailed: "Couldn’t load earlier messages ({{detail}}). Retry.",
			unknownFailure: "Something went wrong ({{detail}}). Retry.",
		},
		attachment: {
			megabytes: "{{size}} MB",
			storage: "Couldn’t save the files ({{failure}}). Attach them again.",
			unknownConversation:
				"This conversation no longer exists. Reopen the agent and attach them again.",
			tooMany:
				"A message takes up to {{limit}} files, and {{staged}} are staged. Remove some.",
			tooLarge:
				"{{name}} is over the {{limit}} file limit. Attach a smaller one.",
			tooLargeTogether:
				"These files total {{bytes}}, over the {{limit}} message limit. Remove some.",
			unreadable: "Couldn’t read {{name}}. Attach it again.",
			unwritable: "Couldn’t save the files ({{detail}}). Attach them again.",
		},
	},
	namelessConversation: {
		separator: ", ",
	},
	conversationSeating: {
		failed: "Couldn’t change who is in this conversation. Retry.",
		refused: "Couldn’t bring {{name}} into this conversation. Retry.",
		unavailable: "Couldn’t load the agents to suggest. Retry.",
	},
	conversationSettings: {
		breadcrumb: "Settings",
		untitled: "Untitled conversation",
		tab: {
			general: "General",
			participants: "Participants",
			instructions: "Instructions",
			danger: "Danger zone",
		},
		name: {
			label: "Name",
			placeholder: "What this conversation is about",
		},
		icon: {
			label: "Icon",
			option: {
				MessageSquare: "Message",
				Bug: "Bug",
				Rocket: "Rocket",
				ShieldKey: "Shield",
				Pen: "Pen",
				FileText: "File",
				Download: "Download",
				Laptop: "Laptop",
				Smartphone: "Phone",
				BookOpen: "Book",
				CreditCard: "Card",
				Megaphone: "Megaphone",
				PanelLeft: "Panel",
				Code: "Code",
				Terminal: "Terminal",
				Server: "Server",
				Globe: "Globe",
				Palette: "Palette",
				Lightbulb: "Lightbulb",
				ChartLine: "Chart",
				Calendar: "Calendar",
				Users: "People",
				Flag: "Flag",
				Sparkles: "Sparkles",
			} as const satisfies Record<ConversationIconName, string>,
		},
		instructions: {
			label: "Instructions",
			placeholder: "What every agent in this conversation should keep in mind",
		},
		participants: {
			label: "In this conversation",
			lead: "Lead",
			promote: "Give the lead to {{name}}",
			dismiss: "Dismiss {{name}}",
			last: "A conversation needs at least one agent.",
		},
		danger: {
			delete: "Delete conversation",
			description:
				"Its messages are deleted; its agents stay in the space. This can’t be undone.",
			confirm: {
				title: "Delete {{name}}?",
			},
			failed: "Couldn’t delete this conversation. Retry.",
		},
	},
	activity: {
		panel: {
			close: "Close activity",
			label: "Activity",
			toggle: "Toggle activity",
			title: "Activity",
		},
		missions: {
			group: {
				waiting: "Waiting on you",
				inProgress: "In progress",
				earlierToday: "Earlier today",
			},
		},
		routines: {
			title: "Routines",
			back: "Back to the activity",
		},
		runs: {
			reported: "reported",
		},
		empty: {
			title: "Nothing is running here",
			description:
				"Missions and routine reports in this conversation show up here.",
		},
		failure: {
			missions: {
				title: "Couldn’t load missions",
				description: "The missions are still there; only the list didn’t load.",
			},
			routines: {
				title: "Couldn’t load routines",
				description: "The routines keep running; only the list didn’t load.",
			},
			activity: {
				title: "Couldn’t load the activity",
				description:
					"Missions and routines are still there; only the list didn’t load.",
			},
			write: {
				title: "Couldn’t update the routine",
				description: "Your change wasn’t saved. Retry.",
			},
		},
	},
	routines: {
		form: {
			new: "Create a routine",
			edit: "Edit routine",
			back: "Back to the routines",
			save: "Save routine",
			title: {
				label: "Title",
				placeholder: "Morning digest",
			},
			instruction: {
				label: "Instruction",
				placeholder: "Read what came in overnight and write a short digest.",
			},
			source: {
				label: "Trigger",
				placeholder: "Pick what triggers this routine",
				tied: "You can’t change the trigger of a saved routine.",
			},
			expression: {
				label: "Cron expression",
				placeholder: "0 8 * * *",
			},
			path: {
				label: "Watched path",
				placeholder: "/notes/CHANGELOG.md",
			},
			webhook: {
				url: "Address",
				key: "Key",
				header: "Header name",
				copy: "Copy the {{field}} of this routine",
				copied: "{{field}} copied",
				reading: "Loading the address and key…",
				pending: "Save the routine to get its address, key and header name.",
				failure:
					"Couldn’t load the address and key. Reopen the routine to retry.",
			},
			filter: {
				label: "Filter",
				everyEvent: "Every event runs this routine.",
				add: "Add a row",
				row: "Row {{rank}}",
				remove: "Remove the row on {{field}}",
				matchMode: {
					label: "Run when",
					all: "Every row holds",
					any: "Any row holds",
				},
				field: {
					label: "Field",
					otherPath: "Another path",
				},
				path: {
					label: "Path",
					placeholder: "sender.address",
				},
				operator: {
					label: "Operator",
				},
				value: {
					label: "Value",
					true: "True",
					false: "False",
				},
				operators: {
					exists: "is present",
					not_exists: "is absent",
					equals: "equals",
					not_equals: "doesn’t equal",
					contains: "contains",
					not_contains: "doesn’t contain",
					starts_with: "starts with",
					ends_with: "ends with",
					gt: "is greater than",
					lt: "is less than",
				},
				fieldTypes: {
					string: "text",
					number: "number",
					boolean: "boolean",
					datetime: "date",
				},
			},
			error: {
				blankTitle: "A routine needs a title.",
				blankInstruction: "A routine needs an instruction.",
				blankValue: "This row needs a value.",
				untypedComparison: "Pick a field the trigger declares.",
				unreadableExpression:
					"Couldn’t read this as a schedule. Check the cron expression.",
				unsupportedOperator:
					"{{operator}} doesn’t fit a {{fieldType}} field. Pick another operator.",
			},
		},
		detail: {
			title: "Routine",
			back: "Back to the routine",
			runNow: {
				action: "Run now",
				refusal: {
					disabled: "This routine is off. Turn it on to run it.",
					filter: "Nothing ran: the filter let nothing through.",
					dedupeValueMissing:
						"Nothing ran: this trigger can’t tell events apart.",
					alreadySeen: "Nothing ran: this event already ran.",
				},
			},
			history: {
				label: "Run history",
				reading: "Loading runs…",
				counted_one: "{{count}} run",
				counted_other: "{{count}} runs",
				page_one: "Last {{count}} run read",
				page_other: "Last {{count}} runs read",
				reported_one: "{{count}} report",
				reported_other: "{{count}} reports",
				latest: "Most recent {{when}}",
				outcome: {
					reported: "Reported",
					nothing: "Nothing to report",
					skipped: "Skipped",
					failed: "Failed",
					running: "Running",
				},
				empty: {
					title: "No run recorded",
					description: "Runs show up here as they happen.",
				},
				failure: {
					title: "Couldn’t load runs",
					description:
						"The routine keeps running; only its run history didn’t load.",
				},
			},
		},
		row: {
			delete: "Delete {{title}}",
			stopped: "Stopped itself",
		},
		confirm: {
			title: "Delete {{title}}?",
			description:
				"Its run history is deleted; its past reports stay in the conversation. This can’t be undone.",
			label: "Delete routine",
			failure: "Couldn’t delete the routine. Retry.",
		},
		empty: {
			title: "No routine yet",
			description:
				"Set a routine to run an agent on a schedule or when a file changes.",
		},
		leave: {
			title: "Leave without saving?",
			description:
				"You’ll lose your unsaved changes. The saved routine stays as it is.",
			action: "Leave",
		},
	},
	missions: {
		panel: {
			empty: {
				title: "No missions yet",
				description: "Missions your agents open in this space show up here.",
			},
		},
		state: {
			waiting_human: "Blocked on you",
			ready_to_merge: "Ready to merge",
			failed: "Blocked",
			done: "Completed",
			closed: "Closed",
		},
		live: "Working now",
		event: {
			source: {
				bot: "The agent",
				reader: "You",
				agent: "The coding session",
				github: "GitHub",
			},
			line: {
				opened: "Mission opened by {{source}}",
				note: "Note recorded by {{source}}",
				agent_asked: "Question sent to the coding session by {{source}}",
				answered: "Answer sent to the coding session",
				escalated: "Escalated to a human by {{source}}",
				ready: "Marked ready to merge by {{source}}",
				checks_failed: "Red checks reported by {{source}}",
				failed: "Failure reported by {{source}}",
				closed: "Mission closed by {{source}}",
				dismissed: "Closed by you",
				reopened: "Mission reopened by {{source}}",
			},
			kind: {
				opened: "Opened",
				note: "Note",
				agent_asked: "Question",
				answered: "Answer",
				escalated: "Escalated",
				ready: "Ready to merge",
				checks_failed: "Checks failed",
				failed: "Failed",
				closed: "Closed",
				dismissed: "Closed",
				reopened: "Reopened",
			},
			link: "Open {{host}}",
		},
		activity: {
			commitsAhead_one: "{{count}} commit ahead",
			commitsAhead_other: "{{count}} commits ahead",
		},
		pullRequest: {
			label: "#{{number}}",
			open: "Open pull request #{{number}}",
		},
		menu: {
			label: "Mission actions",
			open: "Open mission",
			openPullRequest: "Open PR",
			copy: "Copy",
			copyKind: {
				issue_id: "Issue ID",
				branch: "Branch",
				pull_request_url: "PR URL",
				workspace_path: "Workspace path",
			},
			messageAgent: "Message the coding session",
			stopAgent: "Stop the coding session",
			answer: "Answer the question",
			close: "Close",
			reopen: "Reopen",
			copied: "{{kind}} copied",
			failed: {
				openPullRequest: "Couldn’t open the pull request",
				copy: "Couldn’t copy to the clipboard",
				stopAgent: "Couldn’t stop the coding session",
				close: "Couldn’t close the mission",
				reopen: "Couldn’t reopen the mission",
			},
		},
		card: {
			open: "Open the mission: {{objective}}",
		},
		header: {
			tools: "Tools",
			back: "Back to the conversation",
			openedAt: "opened {{time}}",
		},
		feed: {
			label: "Mission conversation",
		},
		summons: {
			working: "Opened by the mission",
			waiting_bot: "Opened by the coding session’s question",
		},
		composer: {
			placeholder: "Answer this mission…",
		},
		failure: {
			read: {
				title: "Couldn’t load this mission",
				description: "The mission is still there; only this view didn’t load.",
			},
			send: {
				title: "Couldn’t send your answer",
				description: "Send it again.",
			},
			run: {
				title: "Couldn’t run the agent on its mission",
				description: "Open its conversation to check on it.",
			},
		},
	},
	onboarding: {
		step: "{{step}} of {{total}}",
		welcome: {
			header: "Setup",
			question: "Ready to start?",
			start: {
				label: "Start",
				description: "Three steps, about a minute.",
			},
			more: {
				label: "Tell me more first",
				description: "What Kiroshi is, before you connect anything.",
			},
		},
		account: {
			header: "Your Claude account",
			question: "Use the account already on this machine?",
			use: {
				label: "Use this account",
				description:
					"Signed in with your Claude subscription, under your own login.",
			},
			another: {
				label: "Use another account",
				description: "Sign in again with a different one.",
			},
		},
		access: {
			header: "Your Claude account",
			question: "How do you want to connect?",
			signIn: {
				label: "Sign in with Claude",
				description:
					"Opens your browser once. Works with your Pro or Max subscription.",
			},
			apiKey: {
				label: "Paste an API key",
				description: "Pay per use, with nothing to sign in to.",
			},
		},
		code: {
			header: "Sign in",
			question: "Paste the code Claude gave you",
			link: "Open this link and sign in",
			entry: "Then paste the code it gives you",
			exit: "Paste a key instead",
		},
		apiKey: {
			header: "API key",
			question: "Paste your Anthropic API key",
			entry: "Key",
			placeholder: "sk-ant-…",
			exit: "Sign in instead",
		},
		signInFailed: {
			header: "Sign in",
			question: "Try again, or use a key instead?",
			title: "Couldn’t sign you in",
			retry: {
				label: "Try again",
				description: "Opens your browser once more.",
			},
		},
		connection: {
			keyFailed: {
				title: "Couldn’t use that key",
				sentence: "That key was refused, so nothing was saved.",
				anotherKey: "Try another key",
				anotherKeyDescription: "Paste a different Anthropic API key.",
				signIn: "Sign in instead",
			},
		},
		firstReply: {
			header: "Last step",
			question: "That’s it working. Ready for the last one?",
			pick: {
				label: "Pick my first agent",
				description: "One more question, then you’re set up.",
			},
			keepTalking: {
				label: "Keep talking first",
				description: "Ask me a few more things. I’ll wait.",
			},
		},
		arrival: {
			failure: "{{name}} couldn’t say hello",
		},
	},
} as const

export { chat }
