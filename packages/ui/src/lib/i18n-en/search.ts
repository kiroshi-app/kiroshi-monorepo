const search = {
	open: "Search",
	chord: "⌘K",
	placeholder: "Search messages, conversations, missions and routines",
	results: "Results",
	tab: {
		all: "All",
		messages: "Messages",
		chats: "Conversations",
		missions: "Missions",
		routines: "Routines",
	},
	seeAll: "See all",
	solo: "solo conversation",
	unavailable: {
		title: "Couldn’t run the search",
		description: "Edit your search to retry.",
	},
	rest: {
		chats: "Recent conversations",
		missions: "Recent missions",
		routines: "Routines",
		messages: {
			title: "Search every message",
			body: "Type a word to search every message in {{space}}. Whole words only: “rout” won’t find “routine”.",
		},
		none: {
			chats: "No conversation here yet",
			missions: "No mission here yet",
			routines: "No routine here yet",
			body: {
				chats: "No conversations in {{space}} yet.",
				missions: "No missions in {{space}} yet.",
				routines: "No routines in {{space}} yet.",
			},
		},
	},
	empty: {
		title: "Nothing here matches",
		description: "No results for “{{query}}” in {{space}}.",
	},
}

export { search }
