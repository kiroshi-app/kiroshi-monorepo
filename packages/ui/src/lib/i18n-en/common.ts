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
		unnamed: {
			host: "the host",
			space: "this space",
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
		collapseUnsaved:
			"Couldn’t remember the sidebar layout. Toggle the sidebar again to save it.",
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
		revealTabFailed: {
			title: "Couldn’t bring the other window forward",
			description:
				"The conversation is open in another window. Switch to that window to see it.",
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
		newBoard: "New board",
		boardFileReplaced:
			"An edit to {{name}} made outside Kiroshi was replaced by the live board.",
		blankBoard: "Blank board",
		saved: {
			title: "Saved to Library",
			image: "Image saved to Library",
			open: "Open",
		},
		filters: {
			label: "Show",
			all: "All",
			images: "Images",
			documents: "Documents",
			boards: "Boards",
		},
		noResult: {
			images: "No images in this Library yet.",
			documents: "No documents in this Library yet.",
			boards: "No boards in this Library yet.",
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
			body: "Document text",
			toolbar: {
				label: "Format",
				bold: "Bold",
				italic: "Italic",
				strikethrough: "Strikethrough",
				code: "Code",
				link: "Link",
				heading: "Heading",
				list: "List",
				boldShortcut: "⌘B",
				italicShortcut: "⌘I",
				strikethroughShortcut: "⌘⇧S",
				codeShortcut: "⌘E",
				linkShortcut: "⌘K",
				linkField: "Link address",
				confirmLink: "Add link",
			},
			blocks: {
				types: {
					paragraph: "Text",
					heading: "Heading",
					list: "List",
					checklist: "Checklist",
					quote: "Quote",
					gallery: "Gallery",
					callout: "Callout",
					table: "Table",
					code: "Code",
					"web-page": "Web page card",
					collapsible: "Collapsible sections",
					other: "Block",
				},
				markdown: {
					heading: "#",
					list: "-",
					checklist: "[]",
					quote: ">",
					code: "```",
				},
				slash: {
					label: "Blocks",
					text: "Text",
					rich: "Rich blocks",
					moveKeys: "↑↓",
					move: "Move",
					insertKey: "↵",
					insert: "Insert",
					closeKey: "esc",
					close: "Close",
				},
				handle: {
					insert: "Add a line below",
					menu: "Block menu, drag to move",
				},
				menu: {
					turnInto: "Turn into",
					duplicate: "Duplicate",
					moveUp: "Move up",
					moveDown: "Move down",
					delete: "Delete",
					shortcuts: {
						mac: {
							duplicate: "⌘D",
							moveUp: "⌥⇧↑",
							moveDown: "⌥⇧↓",
							delete: "⌫",
						},
						other: {
							duplicate: "Ctrl+D",
							moveUp: "Alt+Shift+↑",
							moveDown: "Alt+Shift+↓",
							delete: "Backspace",
						},
					},
				},
				skeleton: {
					column: "Column",
				},
				gallery: {
					add: "Add images",
					hint: "Drag to reorder. The first image leads.",
					addFailed: "Couldn’t add the images. Try again.",
					tile: "Image {{position}} of {{count}}, arrow keys move it",
					remove: "Remove image {{position}}",
					caption: "Caption of image {{position}}",
					captionPlaceholder: "Add a caption",
				},
				checklist: {
					item: "Item {{position}}",
					move: "Move item {{position}}, arrow keys move it",
				},
				callout: {
					text: "Callout text",
					tone: "Callout tone",
				},
				table: {
					cell: "Row {{row}}, column {{column}}",
					empty: "Empty",
					addRow: "Add row",
					addColumn: "Add column",
				},
				code: {
					body: "Code",
					language: "Language, {{name}}",
					search: "Search languages",
					noMatch: "No language matches",
					languages: {
						text: "Plain text",
						bash: "Shell",
						json: "JSON",
						typescript: "TypeScript",
						python: "Python",
						css: "CSS",
						diff: "Diff",
						html: "HTML",
						markdown: "Markdown",
						rust: "Rust",
						tsx: "TSX",
						yaml: "YAML",
					},
				},
				webPage: {
					link: "Link",
					updateKey: "↵",
					update: "Update",
					failed:
						"Couldn’t load a preview of this link. Check the address, then press Return to try again.",
				},
			},
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
		comments: {
			pin: {
				open: "Comment by {{name}}",
				resolved: "Resolved comment by {{name}}",
			},
			composer: {
				placeholder: "Comment, @ to mention",
				reply: "Reply, @ to mention",
				mention: "Mention someone",
				send: "Send",
				shortcut: {
					mac: "⌘⌥M",
					other: "Ctrl+Alt+M",
				},
			},
			mentions: {
				label: "Mention",
				agents: "Agents",
				people: "People",
			},
			thread: {
				resolve: "Resolve",
				more: "More",
				close: "Close",
				working: "is working on it",
				replies_one: "{{count}} reply, {{names}}",
				replies_other: "{{count}} replies, {{names}}",
				resolvedBy: "Resolved by {{name}}",
				reopen: "Reopen",
			},
			list: {
				label: "Comments",
				open: "Open",
				resolved: "Resolved",
				replies_one: "{{count}} reply",
				replies_other: "{{count}} replies",
				emptyOpen: "No open comments",
				emptyResolved: "No resolved comments",
			},
			bar: {
				comment: "Comment",
				shortcut: "C",
				count_one: "{{count}} open comment",
				count_other: "{{count}} open comments",
			},
			hint: {
				document: "Click a block to comment, select text for a passage",
				board: "Click a shape or the board to comment",
				image: "Click for a point, drag for a zone",
				escape: "Esc",
			},
			anchor: {
				block: "On this paragraph",
				passage: "On “{{text}}”",
				goneText: "On text that’s no longer in the document",
				goneShape: "On a shape that’s no longer on the board",
				imagePoint: "On a point of the image",
				imageZone: "On a zone of the image",
			},
		},
		itemMenu: {
			label: "Actions for {{name}}",
			open: "Open",
			openInNewTab: "Open in new tab",
			rename: "Rename",
			copy: "Copy",
			download: "Download",
			showInFolder: "Show in folder",
			delete: "Delete",
			deleteConfirm: {
				title: "Delete {{name}}?",
				description: "This can’t be undone.",
				failure: "Couldn’t delete {{name}}. Retry.",
			},
		},
		imageMenu: {
			saveToLibrary: "Save to Library",
			copyImage: "Copy image",
			openInViewer: "Open in viewer",
		},
		lightbox: {
			download: "Download",
			copy: "Copy",
			copied: "Copied",
			more: "More",
			back: "Back",
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
			download: "Download",
			copy: "Copy",
			copied: "Copied",
			close: "Close",
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
			},
			readOnly: "Read-only",
			placeholder: "Start writing, or type / to add a block.",
			start: {
				label: "Start with",
				checklist: "Checklist",
				gallery: "Gallery",
				table: "Table",
				template: "From a template",
			},
			drop_one: "Drop to add {{count}} image here",
			drop_other: "Drop to add {{count}} images here",
			failedImport: {
				choose: "Choose another file",
				remove: "Remove",
			},
		},
		panel: {
			openInLibrary: "Open in Library",
			close: "Close",
			resize: "Resize document panel",
		},
		tab: {
			loadingDocument: "Loading the document…",
			loadingImage: "Loading the image…",
			unavailable: {
				missing: {
					title: "This item isn’t in the Library anymore.",
					body: "It was deleted or moved. Close this tab.",
					action: "Close tab",
				},
				unreadable: {
					title: "Couldn’t open {{name}}",
					body: "Couldn’t read this item on the computer where Kiroshi runs. Go back to the Library and open it again.",
					action: "Back to the Library",
				},
			},
		},
		documentPicker: {
			label: "Attach from the Library",
			search: "Search documents",
			attachFiles: "Attach files from this computer",
		},
		failure: {
			list: "Couldn’t open the Library",
			image: "Couldn’t show an image of the Library",
			save: "Couldn’t save the file",
			copy: "Couldn’t copy the image",
			reveal: "Couldn’t show the file in its folder",
			delete: "Couldn’t delete the item",
			document: {
				create: "Couldn’t create the document. Try again from New document.",
				open: "Couldn’t open the document. Open it again from the Library.",
				save: "Couldn’t save your last changes. Keep the document open and edit again to retry.",
				write:
					"{{name}} stopped writing before it finished. Ask again from the conversation.",
				caret:
					"Couldn’t show others where you are in the document. Keep editing to try again.",
				stopAll:
					"Couldn’t stop the agents writing in this document. Press Stop all to try again.",
				stop: "Couldn’t stop {{name}}. Press Stop {{name}} to try again.",
				saveAsDocument:
					"Couldn’t save the message as a document. Try Save as document again.",
			},
			board: {
				open: "Couldn’t open the board. Open it again from the Library.",
				save: "Couldn’t save your last changes to the board. It shows what was saved, so make them again.",
				refused:
					"Couldn’t show the latest changes to the board. Close it and open it again from the Library.",
				stopAll:
					"Couldn’t stop the agents drawing on this board. Press Stop all to try again.",
			},
			import: {
				title: "Couldn’t import {{name}}",
				tooLarge:
					"This file is too large for the Library. Make it smaller, then import it again.",
				invalidName:
					"This file’s name can’t be used in the Library. Rename the file, then import it again.",
				unsupported:
					"This type of file can’t go in the Library. Import a PNG, JPEG, GIF or WebP image, or a Markdown or plain text document.",
				undecodable:
					"Couldn’t read the content of this file. Save it again from the app that made it, then import it again.",
				notUtf8:
					"Couldn’t read the text of this document. Save it as UTF-8 text, then import it again.",
				missing:
					"Couldn’t find the file in the Library after the import. Import it again.",
				unwritable:
					"Couldn’t save the file on the computer where Kiroshi runs. Check that its disk has space left, then import the file again.",
				unreadable:
					"Couldn’t read the Library folder on the computer where Kiroshi runs. Check that the folder is still there, then import the file again.",
				unknownSpace:
					"This Space isn’t on the computer where Kiroshi runs anymore. Open another Space, then import the file there.",
				unavailable:
					"Couldn’t open the Library on the computer where Kiroshi runs. Restart Kiroshi there, then import the file again.",
				storage: "Couldn’t record the file in the Library. Import it again.",
				imageUnreadable:
					"Couldn’t read this image. Check that it still opens, then save it to the Library again.",
				refused:
					"Couldn’t add this file to the Library. Check the file, then import it again.",
				generic:
					"Something went wrong during the import. Import the file again.",
				url: {
					unsupportedScheme:
						"Only web links (http or https) can be imported. Drop a web link instead.",
					privateAddress:
						"Kiroshi doesn’t import from a private address. Drop a public link instead.",
					networkFailure:
						"Couldn’t reach this link. Check the address, then drop it again.",
					tooLarge:
						"The image behind this link is too large for the Library. Drop a link to a smaller image.",
					unknownSpace:
						"This Space isn’t on the computer where Kiroshi runs anymore. Open another Space, then drop the link there.",
				},
			},
		},
	},
	board: {
		empty: {
			title: "An empty board",
			body: "Pick a tool below, paste a link or an image, or drag something in from the Library. Agents in this Space can draw here too.",
		},
		zoom: {
			controls: "Zoom",
			zoomOut: "Zoom out",
			zoomIn: "Zoom in",
			level: "{{percent}}%",
		},
		presence: {
			drawing_one: "{{count}} agent drawing",
			drawing_other: "{{count}} agents drawing",
		},
		card: {
			open: "Open",
			drawing_one: "Board · {{name}} is drawing · {{count}} item",
			drawing_other: "Board · {{name}} is drawing · {{count}} items",
			atRest_one: "Board · {{count}} item · {{edited}}",
			atRest_other: "Board · {{count}} items · {{edited}}",
			failed: "Couldn’t read this board. Open it to try again.",
		},
		libraryCard: {
			documentMeta: "Document · from the Library",
		},
		canvas: {
			label: "Board",
			loading: "Loading the board…",
			objects: "Board objects",
		},
		comments: {
			anchor: {
				node: "On “{{title}}”",
				board: "On the board",
			},
		},
		object: {
			named: "{{kind}}: {{text}}",
			editText: "Edit text",
			kind: {
				sticky: "Sticky note",
				text: "Text",
				shape: "Shape",
				section: "Section",
				image: "Image",
				link: "Link",
			},
			moved: "Moved to {{x}}, {{y}}",
			resized: "Resized to {{width}} by {{height}}",
		},
		connector: {
			editLabel: "Arrow label",
		},
		connectorFlyout: {
			label: "Arrow type",
			routing: {
				straight: "Straight",
				elbow: "Elbow",
			},
		},
		selectionBar: {
			label: "Shape style",
			shapeType: "Shape type",
			shape: {
				"rounded-rectangle": "Rounded rectangle",
				ellipse: "Ellipse",
			},
			fill: {
				surface: "No colour",
				yellow: "Yellow",
				green: "Green",
				blue: "Blue",
				pink: "Pink",
			},
			textSize: "Text size",
			textSizeMedium: "M",
			more: "More",
		},
		dock: {
			label: "Board tools",
			tool: {
				select: "Select",
				hand: "Hand",
				sticky: "Sticky note",
				shape: "Shape",
				text: "Text",
				connector: "Arrow",
				section: "Section",
				image: "Image",
				library: "Library",
			},
		},
		picker: {
			title: "From the Library",
			hint: "Drag onto the board",
			empty: "Nothing in the Library yet.",
		},
		drop: {
			images_one: "Drop to add {{count}} image here",
			images_other: "Drop to add {{count}} images here",
			files_one: "Drop to add {{count}} file here",
			files_other: "Drop to add {{count}} files here",
			unknown: "Drop to add files here",
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
