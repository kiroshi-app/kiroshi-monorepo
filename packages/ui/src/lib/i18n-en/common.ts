const common = {
	boot: {
		status: "Starting Kiroshi",
	},
	spaces: {
		unavailable: {
			title: "Couldn’t load your spaces",
			description: "Your agents are still there.",
		},
		leave: {
			title: "Leave {{name}}?",
			description:
				"Nothing is deleted on the host. You can join again with a new invitation.",
			action: "Leave space",
		},
	},
	skipLink: "Skip to the conversation",
	agent: {
		unnamed: "Agent",
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
	titleBar: {
		tabs: "Tabs",
		back: "Back",
		forward: "Forward",
		newTab: "New tab",
		closeTab: "Close tab",
		closeTabNamed: "Close {{title}}",
		pinTab: "Pin tab",
		unpinTab: "Unpin tab",
		closeOtherTabs: "Close other tabs",
		duplicateTab: "Duplicate tab",
		reopenClosedTab: "Reopen last closed tab",
		moveTabToNewWindow: "Move to new window",
		moveTabFailed: {
			title: "Couldn’t open a new window",
			description:
				"The tab stayed here. Choose Move to new window from the tab’s menu to try again.",
			descriptionWithReason:
				"The tab stayed here ({{reason}}). Choose Move to new window from the tab’s menu to try again.",
		},
		redockTabFailed: {
			title: "Couldn’t move the tab",
			description: "The tab stayed here. Drag it to the other window again.",
		},
		reopenWindowFailed: {
			title: "Couldn’t reopen a window",
			description: "Its tabs were closed. Open them again from the sidebar.",
			descriptionWithReason:
				"Its tabs were closed ({{reason}}). Open them again from the sidebar.",
		},
		pinTabShortcut: "Ctrl⇧P",
		newTabShortcut: "⌘T",
		reopenClosedTabShortcut: "⌘⇧T",
		closeTabShortcut: "⌘W",
		closeOtherTabsShortcut: "⌘⌥W",
		more: "{{count}} more",
		tabNeedsYou: "{{title}}, needs you",
		tabMoved: "{{title}} moved to position {{position}} of {{count}}",
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
	claudeImport: {
		listLabel: "Your Claude Code setup",
		select: {
			title: "Bring in your Claude Code setup",
			body: "Found in ~/.claude on your computer. Everything is selected; uncheck what you’d rather leave behind.",
			bodyMany:
				"Found {{count}} agents and more in ~/.claude. Everything is selected; uncheck what you’d rather leave behind.",
			nothingSelected:
				"Nothing is selected. Check what you want to bring in, or skip for now.",
			namesTaken: {
				one: "One name is already taken in Kiroshi. It comes in with a number; nothing gets replaced.",
				two: "Two names are already taken in Kiroshi. Those come in with a number; nothing gets replaced.",
				other:
					"{{count}} names are already taken in Kiroshi. Those come in with a number; nothing gets replaced.",
			},
			import: "Import",
			importItems_one: "Import {{count}} item",
			importItems_other: "Import {{count}} items",
			importCompanions_one: "Import {{count}} agent",
			importCompanions_other: "Import {{count}} agents",
			skip: "Skip for now",
			notNow: "Not now",
		},
		fromSettings: {
			title: "Import from Claude Code",
			body: "Found in ~/.claude. What’s already in Kiroshi stays as it is; only what’s new is selected.",
			cancel: "Cancel",
		},
		importing: {
			title: "Bringing in your setup",
			body: "{{done}} of {{count}} done. This takes a few seconds.",
			action: "Importing…",
		},
		done: {
			title: "Your setup is in",
			companions_one: "{{companions}} is ready.",
			companions_other: "{{companions}} are ready.",
			companionsWith_one: "{{companions}} is ready, with {{extras}}.",
			companionsWith_other: "{{companions}} are ready, with {{extras}}.",
			instructions: "your CLAUDE.md",
			instructionsAndSkills_one:
				"Your CLAUDE.md and {{count}} skill are ready.",
			instructionsAndSkills_other:
				"Your CLAUDE.md and {{count}} skills are ready.",
			onlyInstructions: "Your CLAUDE.md is ready.",
			onlySkills_one: "{{count}} skill is ready.",
			onlySkills_other: "{{count}} skills are ready.",
			continue: "Continue",
		},
		partlyFailed: {
			title: "Most of your setup is in",
			body: "The {{name}} skill didn’t come in. Try it again, or add it later from Settings.",
			bodyNamed:
				"{{name}} didn’t come in. Try it again, or add it later from Settings.",
			retry: "Try {{name}} again",
		},
		unreadable: {
			title: "Couldn’t read ~/.claude",
			body: "Kiroshi wasn’t allowed to open that folder, so nothing came in. Let your account read it, then try again.",
			retry: "Try again",
		},
		row: {
			inKiroshi: "Already in Kiroshi.",
			skills_one: "{{count}} skill",
			skills_other: "{{count}} skills",
			newSkills_one: "{{count}} new skill",
			newSkills_other: "{{count}} new skills",
			nameTaken:
				"{{name}} already lives in Kiroshi, so this one comes in as {{renamed}}. Rename it after.",
			companionNameTaken:
				"You already have an agent named {{name}}, so this one comes in as {{renamed}}.",
			unparsable: "Couldn’t bring it in: its {{file}} doesn’t parse.",
			type: {
				companion: "Agent",
				instructions: "Instructions",
				skill: "Skills",
			},
			status: {
				done: "Done",
				pending: "In progress",
				failed: "Failed",
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
			readyVersion: "Restart to update to {{version}}",
			botsBusy_one: "{{count}} agent is still running. Stop it to restart.",
			botsBusy_other:
				"{{count}} agents are still running. Stop them to restart.",
			error: "Update failed, download again",
			retry: "Download the update again",
		},
	},
	library: {
		title: "Library",
		subtitle: "Every image and document in this Space.",
		search: "Search the Library",
		import: "Import",
		newDocument: "New document",
		filters: {
			label: "Show",
			all: "All",
			images: "Images",
			documents: "Documents",
		},
		noResult: {
			images: "No images in this Library yet.",
			documents: "No documents in this Library yet.",
			search: "Nothing matches “{{query}}”.",
		},
		start: "Start a document",
		templates: {
			blank: {
				name: "Blank document",
				description: "An empty page, with nothing to fill in.",
				placeholder: "Start writing. Use # for a heading and - for a list.",
			},
			brief: {
				name: "Brief",
				preview:
					"# Brief\n\nWhat we’re making, who it’s for and why it matters now.\n\n## Goal\n\nThe outcome this work commits to.\n\n## Done when\n\nWhat has to be true to call it finished.",
				description: "Goal and done when, for a piece of work.",
				intro: "What you’re making, who it’s for and why now.",
				goal: {
					heading: "Goal",
					placeholder:
						"The outcome this work commits to, in a sentence or two.",
				},
				doneWhen: {
					heading: "Done when",
					placeholder: "What has to be true to call it finished.",
				},
			},
			meetingNotes: {
				name: "Meeting notes",
				preview:
					"# Meeting notes\n\n## Decisions\n\n- One line per decision\n- The reason behind it\n\n## Next steps\n\nWho does what, and by when.",
				description: "Decisions and next steps, dated today.",
				title:
					"Meeting notes, {{date, datetime(day: numeric)}} {{date, datetime(month: long)}}",
				intro: "Who was there, and what the meeting was for.",
				decisions: {
					heading: "Decisions",
					placeholder: "One line per decision, with the reason behind it.",
				},
				nextSteps: {
					heading: "Next steps",
					placeholder: "Who does what, and by when.",
				},
			},
			checklist: {
				name: "Checklist",
				preview:
					"# Checklist\n\n- Draft the outline\n- Gather the references\n- Ship the final version",
				description: "Things to tick off, one per line.",
				item: "One thing to do per line.",
			},
		},
		picker: {
			subtitle: "Start blank, or from a template you can change afterwards.",
			templates: "Templates",
			cancel: "Cancel",
			create: "Create document",
		},
		editor: {
			untitled: "Untitled",
			created: "Created just now",
			createdFrom: "Created just now from {{template}}",
			title: "Title",
			paragraph: "Text",
			heading: "Heading",
			item: "List item",
		},
		bringIn: {
			title: "Bring in files",
			drop: "Drop images or documents here",
			formats: "PNG, JPG, Markdown and plain text.",
			action: "Import files…",
		},
		drop: {
			title_one: "Drop to add {{count}} file to the Library",
			title_other: "Drop to add {{count}} files to the Library",
			more_one: "and {{count}} more",
			more_other: "and {{count}} more",
		},
		importing: {
			label: "Importing {{name}}",
			detail: "Importing… {{percent}}%",
		},
		added: {
			title_one: "{{count}} file added",
			title_other: "{{count}} files added",
			stillImporting_one: "{{name}} is still importing.",
			stillImporting_other: "{{count}} files are still importing.",
		},
		lightbox: {
			download: "Download",
			copy: "Copy",
			more: "More",
			close: "Close",
			previous: "Previous image",
			next: "Next image",
			zoomOut: "Zoom out",
			zoomIn: "Zoom in",
			fit: "Fit",
			fitToStage: "Fit to the window",
			zoom: "{{percent}}%",
			zoomThenFit: "{{percent}}%, fit to the window",
			position: "{{position}} of {{count}}",
		},
		document: {
			back: "Library",
			more: "More",
			agents: {
				writing_one: "{{count}} agent writing",
				writing_other: "{{count}} agents writing",
				stopAll: "Stop all",
				caret: "{{name}} is writing",
				title: "{{name}} is writing…",
				summary_one: "{{count}} sentence added to “{{section}}”",
				summary_other: "{{count}} sentences added to “{{section}}”",
				stop: "Stop {{name}}",
				openConversation: "Open conversation",
				finished: {
					one: "{{name}} finished",
					two: "{{first}} and {{second}} finished",
					more_one: "{{first}}, {{second}} and {{count}} other finished",
					more_other: "{{first}}, {{second}} and {{count}} others finished",
				},
				added_one: "{{count}} sentence added",
				added_other: "{{count}} sentences added",
				detail: "{{added}} · {{elapsed}}",
				undoAll: "Undo all",
				done: "Done",
			},
		},
		failure: {
			list: "Couldn’t open the Library",
			image: "Couldn’t show an image of the Library",
			save: "Couldn’t save the file",
			copy: "Couldn’t copy the image",
			reveal: "Couldn’t show the file in its folder",
			document: {
				create: "Couldn’t create the document. Try again from New document.",
				open: "Couldn’t open the document. Open it again from the Library.",
				save: "Couldn’t save your last changes. Keep the document open and edit again to retry.",
			},
			import: "Couldn’t import {{name}}",
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
