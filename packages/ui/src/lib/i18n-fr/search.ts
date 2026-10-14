const search = {
	open: "Rechercher",
	chord: "⌘K",
	placeholder: "Rechercher messages, conversations, missions et routines",
	results: "Résultats",
	tab: {
		all: "Tout",
		messages: "Messages",
		chats: "Conversations",
		missions: "Missions",
		routines: "Routines",
	},
	seeAll: "Tout voir",
	solo: "conversation en tête-à-tête",
	unavailable: {
		title: "Impossible de lancer la recherche",
		description: "Modifiez votre recherche pour réessayer.",
	},
	rest: {
		chats: "Conversations récentes",
		missions: "Missions récentes",
		routines: "Routines",
		messages: {
			title: "Rechercher dans tous les messages",
			body: "Tapez un mot pour chercher dans tous les messages de {{space}}. Mots entiers seulement : « rout » ne trouve pas « routine ».",
		},
		none: {
			chats: "Aucune conversation ici",
			missions: "Aucune mission ici",
			routines: "Aucune routine ici",
			body: {
				chats: "Aucune conversation dans {{space}}.",
				missions: "Aucune mission dans {{space}}.",
				routines: "Aucune routine dans {{space}}.",
			},
		},
	},
	empty: {
		title: "Rien ne correspond ici",
		description: "Aucun résultat pour « {{query}} » dans {{space}}.",
	},
}

export { search }
