const bots = {
	roster: {
		label: "Conversations",
		create: "Créer un agent",
		createMenu: "Créer",
		conversation: {
			create: "Démarrer une conversation",
			others: "+{{count}}",
			preview: "{{name}} : {{text}}",
		},
		empty: "Aucun agent pour l’instant",
		unavailable:
			"Impossible de charger vos agents. Redémarrez Kiroshi pour réessayer.",
		previewUnreadable:
			"Impossible de charger les derniers messages. Redémarrez Kiroshi pour réessayer.",
		conversationUnsaved:
			"Impossible d’enregistrer votre modification de cette conversation. Refaites-la pour réessayer.",
		mission: {
			state: {
				waiting: "en attente de vous",
				failed: "bloquée",
				ready: "prête à fusionner",
				working: "en cours",
			},
			unavailable: {
				title: "Impossible de charger les missions",
				description: "Redémarrez Kiroshi pour réessayer.",
			},
		},
		actions: "Actions pour {{name}}",
		titled: "{{name}} · {{title}}",
		openInNewTab: "Ouvrir dans un nouvel onglet",
		settings: "Ouvrir les réglages",
		duplicate: "Dupliquer",
		spaces: {
			label: "Espaces",
			lastSpace:
				"Un agent reste dans au moins un espace. Pour retirer un agent de son dernier espace, supprimez l’agent.",
		},
		pin: "Épingler",
		pinDrop: "Déposer ici pour épingler",
		unpin: "Détacher",
		delete: "Supprimer",
		needsYou: "Vous attend",
		working: "{{pose}}…",
		pose: {
			thinking: "réfléchit",
			searching: "cherche",
			working: "travaille",
			writing: "écrit",
			waiting: "attend",
		},
		idle: "au repos",
		announcement: {
			none: "Aucun agent sélectionné",
			selected: "{{name}} sélectionné, {{state}}",
		},
		section: {
			actions: "Actions pour la section {{name}}",
			moveTo: "Déplacer vers une section",
			none: "Aucune section",
			create: "Créer une section",
			createField: "Nom de la nouvelle section",
			createDefault: "Nouvelle section",
			rename: "Renommer",
			renameField: "Renommer {{name}}",
			moveUp: "Monter",
			moveDown: "Descendre",
			delete: "Supprimer",
			empty: "Déposez un agent ici",
			unreadable:
				"Impossible de charger les sections de cet espace. Redémarrez Kiroshi pour réessayer.",
		},
		seedRefused: "Votre premier agent n’a pas pu être créé",
	},
	rail: {
		label: "Navigation",
		conversations: "Conversations",
		missions: "Missions",
		searchMissions: "Rechercher des missions",
		spaceSettings: "Réglages de l’espace",
		dot: "{{name}}, nouvelle activité",
		badge: {
			attention: "{{name}}, en attente de vous",
			done: "{{name}}, activité terminée",
			failed: "{{name}}, activité en échec",
		},
	},
	spaces: {
		label: "Espaces",
		switch: "Changer d’espace, {{name}} ouvert",
		switchHosted: "Changer d’espace, {{name}} ouvert, {{host}}",
		switchInvited_one: "Changer d’espace, {{name}} ouvert, 1 invitation",
		switchInvited_many:
			"Changer d’espace, {{name}} ouvert, {{count}} invitations",
		switchInvited_other:
			"Changer d’espace, {{name}} ouvert, {{count}} invitations",
		switchHostedInvited_one:
			"Changer d’espace, {{name}} ouvert, {{host}}, 1 invitation",
		switchHostedInvited_many:
			"Changer d’espace, {{name}} ouvert, {{host}}, {{count}} invitations",
		switchHostedInvited_other:
			"Changer d’espace, {{name}} ouvert, {{host}}, {{count}} invitations",
		open: "Ouvrir {{name}}",
		create: "Créer un espace",
		shortcut: "⌘{{rank}}",
		host: {
			shared: "Partagé",
			up: "En ligne",
			connecting: "Connexion…",
			down: "Non connecté",
		},
		remove: {
			lastSpace: "Un agent a besoin d’au moins un espace.",
			failed: "Impossible de retirer cet agent de l’espace. Réessayez.",
		},
		invitations: {
			label: "Invitations",
			invitedBy: "Invité par {{email}}",
			expires: "Expire le {{date}}",
			accept: "Accepter",
			decline: "Refuser",
			joining: "Connexion…",
			retry: "Réessayer",
			failed: {
				servers:
					"Impossible d’accepter. Les serveurs de Kiroshi n’ont pas répondu.",
				offline:
					"Impossible d’accepter, cet ordinateur est hors ligne. Réessayez une fois connecté.",
			},
			withdrawn:
				"{{email}} a retiré cette invitation. Demandez-lui de vous inviter à nouveau.",
			expired:
				"Cette invitation a expiré le {{date}}. Demandez à {{email}} de vous inviter à nouveau.",
			hostOffline:
				"L’ordinateur de {{host}} est hors ligne. Vous pourrez accepter quand il sera de retour.",
		},
		removed: {
			notice: "{{host}} vous a retiré de {{name}}.",
			noticeDescription:
				"Il n’apparaît plus dans vos espaces. Ses conversations restent sur le Kiroshi de {{host}}.",
			memberNotice: "Vous n’êtes plus membre de {{name}}",
			memberNoticeDescription:
				"Ses conversations ne sont plus sur cet appareil. Demandez une nouvelle invitation à {{host}}.",
			deletedNotice: "{{host}} a supprimé {{name}}",
			deletedNoticeDescription:
				"Ses conversations ne sont plus sur cet appareil.",
		},
		signOut: {
			title: "Se déconnecter de Kiroshi ?",
			description:
				"{{name}} quitte cet ordinateur jusqu’à votre prochaine connexion. Ses conversations restent chez {{host}}.",
			confirm: "Se déconnecter",
			notice: "Déconnecté. {{name}} a quitté cet ordinateur.",
		},
	},
	dialog: {
		untitled: "Agent sans titre",
		breadcrumb: "Réglages",
		tab: {
			general: "Général",
			appearance: "Apparence",
			instructions: "Instructions",
			skills: "Compétences",
			applications: "Applications",
			secrets: "Secrets",
			history: "Historique",
			approvals: "Autorisations",
			runtime: "Exécution",
			danger: "Zone sensible",
		},
		name: {
			label: "Nom",
			placeholder: "Sans nom",
		},
		title: {
			label: "Titre",
			placeholder: "Intitulé court du rôle",
		},
		instructions: {
			label: "Instructions",
			placeholder: "L’invite système avec laquelle cet agent tourne toujours",
		},
		memory: {
			label: "Mémoire",
			hint: "Ce dont cet agent se souvient d’une conversation à l’autre. Modifiez-la ou effacez-la ; il continue d’apprendre.",
			empty: "Cet agent n’a encore aucun souvenir.",
			save: "Enregistrer la mémoire",
			clear: {
				action: "Effacer",
				title: "Effacer la mémoire de cet agent ?",
				description:
					"Il recommence à apprendre dès votre prochaine conversation. C’est irréversible.",
				confirm: "Effacer la mémoire",
			},
		},
	},
	history: {
		empty: "Aucune modification pour l’instant.",
		unavailable:
			"Impossible de charger l’historique. Rouvrez les réglages pour réessayer.",
		summary_one:
			"Liste 1 modification depuis le {{date}}. Annuler une modification en écrit une nouvelle : rien n’est jamais supprimé.",
		summary_many:
			"Liste {{count}} modifications depuis le {{date}}. Annuler une modification en écrit une nouvelle : rien n’est jamais supprimé.",
		summary_other:
			"Liste {{count}} modifications depuis le {{date}}. Annuler une modification en écrit une nouvelle : rien n’est jamais supprimé.",
		noMatch: "Aucune modification ne correspond à « {{text}} ».",
		retouches_one: "(1 fois)",
		retouches_many: "({{count}} fois)",
		retouches_other: "({{count}} fois)",
		undone: "Annulée plus haut",
		recordFailed: {
			title: {
				bot: "Impossible d’ajouter la modification d’un agent à l’historique",
				user: "Impossible d’ajouter une modification de votre profil à l’historique",
				space:
					"Impossible d’ajouter une modification de l’espace à l’historique",
			},
			description:
				"La modification reste enregistrée, mais vous ne pouvez pas l’annuler depuis l’historique ({{detail}}). Ouvrez les réglages pour la vérifier.",
		},
		day: {
			today: "Aujourd’hui",
			yesterday: "Hier",
		},
		search: {
			label: "Rechercher dans l’historique",
			placeholder: "Rechercher dans l’historique",
			clear: "Effacer la recherche",
		},
		author: {
			user: "Vous",
		},
		diff: {
			show: "Afficher les modifications",
			hide: "Masquer les modifications",
			loading: "Chargement des modifications…",
			filename: "Modifications",
		},
		undo: {
			action: "Annuler",
			label: "Annuler « {{title}} »",
			title: "Annuler « {{title}} » ?",
			description:
				"Tout revient à l’état d’avant cette modification. L’annulation est une modification à part entière : vous pouvez l’annuler aussi.",
			confirm: "Annuler cette modification",
		},
		change: {
			back: "Historique",
			date: "{{day}}, {{time}}",
			added_one: "1 ligne ajoutée",
			added_many: "{{count}} lignes ajoutées",
			added_other: "{{count}} lignes ajoutées",
			removed_one: "1 ligne supprimée",
			removed_many: "{{count}} lignes supprimées",
			removed_other: "{{count}} lignes supprimées",
			consequence: {
				counted_one:
					"Remet tout dans l’état d’avant cette modification, sur 1 fichier, et écrit cela comme une nouvelle modification que vous pouvez annuler aussi.",
				counted_many:
					"Remet tout dans l’état d’avant cette modification, sur {{count}} fichiers, et écrit cela comme une nouvelle modification que vous pouvez annuler aussi.",
				counted_other:
					"Remet tout dans l’état d’avant cette modification, sur {{count}} fichiers, et écrit cela comme une nouvelle modification que vous pouvez annuler aussi.",
				uncounted:
					"Remet tout dans l’état d’avant cette modification, et écrit cela comme une nouvelle modification que vous pouvez annuler aussi.",
			},
			unavailable:
				"Impossible de lire les fichiers de cette modification. Revenez en arrière et rouvrez-la pour réessayer.",
		},
	},
	skills: {
		untitled: "Compétence sans titre",
		add: "Ajouter une compétence",
		create: "Ajouter la compétence",
		save: "Enregistrer la compétence",
		unsaved: "Modifications non enregistrées",
		back: "Toutes les compétences",
		section: {
			instructions: "Instructions",
			triggering: "Déclenchement",
			execution: "Exécution",
			tools: "Outils",
			files: "Fichiers",
			advanced: "Avancé",
		},
		empty: {
			title: "Aucune compétence",
			description:
				"Écrivez une compétence que cet agent peut réutiliser, et choisissez si elle se charge à chaque tour.",
		},
		name: {
			label: "Nom",
			placeholder: "notes-de-version",
			hint: "Minuscules, chiffres et traits d’union. L’agent lit la description, pas le nom.",
			blank: "Une compétence a besoin d’un nom.",
		},
		description: {
			label: "Description",
			placeholder: "Quand cet agent doit l’utiliser",
		},
		whenToUse: {
			label: "Quand l’utiliser",
			placeholder: "Les demandes auxquelles cette compétence répond",
		},
		budget: {
			label: "{{used}} caractères sur {{max}}",
			hint: "La description et le quand l’utiliser partagent un même budget de caractères.",
			over: "{{over}} caractères de trop. Raccourcissez l’un des deux champs pour enregistrer.",
		},
		body: {
			label: "Contenu",
			placeholder: "Écrivez la compétence en markdown",
		},
		argumentHint: {
			label: "Indication d’arguments",
			placeholder: "[version] [--brouillon]",
			hint: "Ce qui vous est demandé quand vous lancez cette compétence vous-même.",
		},
		arguments: {
			label: "Arguments",
			placeholder: "Un argument par ligne",
		},
		paths: {
			label: "Chemins",
			placeholder: "docs/**/*.md",
			hint: "Un motif par ligne. Les fichiers qui rendent cette compétence pertinente.",
		},
		modelInvocation: {
			label: "Empêcher l’agent d’y recourir",
			description:
				"Désactivé, l’agent décide d’après la description. Activé, vous seul pouvez la lancer.",
		},
		userInvocable: {
			label: "Vous laisser l’invoquer",
			description:
				"Elle apparaît dans le menu de commandes. Lancez-la par son nom avec les arguments ci-dessus.",
		},
		preloaded: {
			label: "Précharger cette compétence",
			tag: "Préchargée",
			description:
				"Activé, elle est dans l’invite de cet agent à chaque tour. Désactivé, l’agent la lit seulement au besoin.",
		},
		system: {
			tag: "Système",
			notice:
				"Kiroshi écrit cette compétence et la tient à jour. Elle est en lecture seule ici.",
		},
		model: {
			label: "Modèle",
			placeholder: "Celui de l’agent",
			hint: "Laissez vide pour utiliser le modèle de l’agent.",
		},
		effort: {
			label: "Effort",
			default: "Celui de l’agent",
			option: {
				low: "Faible",
				medium: "Moyen",
				high: "Élevé",
			},
		},
		context: {
			label: "Contexte",
			default: "La conversation d’où elle est lancée",
			hint: "Fork lance la compétence dans une copie de la conversation. Agent et Exécuter en arrière-plan ne valent que pour un fork.",
			option: {
				shared: "Partagé",
				fork: "Fork",
			},
		},
		shell: {
			label: "Shell",
			placeholder: "/bin/zsh",
			hint: "Le shell des commandes de cette compétence. Laissez vide pour utiliser celui par défaut.",
		},
		agent: {
			label: "Agent",
			placeholder: "L’agent lui-même",
			hint: "Qui exécute le fork.",
		},
		background: {
			label: "Exécuter en arrière-plan",
			description:
				"Le fork se termine de son côté pendant que la conversation continue.",
		},
		allowedTools: {
			label: "Outils autorisés",
			placeholder: "Read\nGrep",
			hint: "Un nom d’outil par ligne. Laissez vide pour autoriser tous les outils de l’agent.",
		},
		disallowedTools: {
			label: "Outils interdits",
			placeholder: "Bash",
		},
		hooks: {
			label: "Hooks",
			placeholder: '{\n  "PreToolUse": []\n}',
			hint: "Ce qui s’exécute autour du tour de cette compétence, tel que le bundle le définit.",
		},
		license: {
			label: "Licence",
			placeholder: "MIT",
		},
		compatibility: {
			label: "Compatibilité",
			placeholder: ">=1.4",
			hint: "Ce que cette compétence exige de son environnement.",
		},
		metadata: {
			label: "Métadonnées",
			placeholder: '{\n  "author": "Ada Martin"\n}',
			hint: "Données du bundle que Kiroshi n’utilise pas. Elles sont conservées telles quelles.",
		},
		leave: {
			title: "Quitter sans enregistrer ?",
			description:
				"Vous perdrez vos modifications non enregistrées. La compétence enregistrée reste telle quelle.",
			action: "Quitter",
		},
		delete: {
			action: "Supprimer la compétence",
			description:
				"L’agent ne pourra plus utiliser cette compétence. C’est irréversible.",
			confirm: {
				title: "Supprimer {{name}} ?",
			},
		},
		files: {
			back: "Tous les fichiers",
			save: "Enregistrer le fichier",
			loading: "Chargement du fichier…",
			retry: "Réessayer",
			add: {
				label: "Nouveau fichier",
				placeholder: "reference/api.md",
				hint: "Un chemin dans le dossier de la compétence. Le fichier s’ouvre vide.",
				blank: "Un fichier a besoin d’un chemin.",
				taken: "Cette compétence a déjà un fichier à ce chemin.",
				action: "Ajouter le fichier",
			},
			text: {
				label: "Contenu",
				placeholder: "Ce que ce fichier contient",
			},
			failure: {
				read: "Impossible d’ouvrir ce fichier. Réessayez.",
				write:
					"Impossible d’enregistrer ce fichier. Enregistrez à nouveau ; votre texte est toujours là.",
				delete: "Impossible de supprimer ce fichier. Réessayez.",
			},
			delete: {
				action: "Supprimer le fichier",
				description:
					"Le fichier est supprimé du dossier de la compétence. C’est irréversible.",
				confirm: {
					title: "Supprimer {{path}} ?",
				},
			},
		},
	},
	applications: {
		untitled: "Application sans titre",
		add: "Ajouter une application",
		create: "Ajouter l’application",
		save: "Enregistrer les modifications",
		unsaved: "Modifications non enregistrées",
		back: "Toutes les applications",
		search: "Rechercher des applications",
		paste: "Coller une configuration",
		verified: "Vérifiée",
		uses_one: "{{count}} utilisation",
		uses_many: "{{count, number}} utilisations",
		uses_other: "{{count, number}} utilisations",
		hostedOn: "Tourne sur <host>{{host}}</host>",
		intro: {
			agent:
				"Ce à quoi {{name}} se connecte pour les outils qu’il n’a pas seul.",
			space: "Ce à quoi chaque agent de {{name}} se connecte.",
			profile: "Ce à quoi vous vous connectez, dans chaque espace.",
		},
		footnote: {
			space:
				"Chaque agent d’ici peut ajouter ses propres applications, et vous pouvez en ajouter pour tous les espaces.",
			profile: "Elles parviennent à chacun de vos agents, dans chaque espace.",
		},
		open: "Ouvrir {{name}}",
		section: {
			connection: "Connexion",
			secrets: "Secrets",
			advanced: "Avancé",
		},
		connection: {
			state: {
				connected: "Connecté",
				needsAuthorization: "Autorisation requise",
				connecting: "Connexion…",
				failed: "Connexion impossible",
			},
			connect: "Connecter",
			retry: "Réessayer",
			cancel: "Annuler",
			disconnect: "Déconnecter",
			row: {
				connect: "Connecter {{name}}",
				retry: "Réessayer {{name}}",
			},
			waiting: "En attente de votre navigateur",
			description: {
				needsAuthorization:
					"{{name}} vous identifie via votre navigateur. Kiroshi garde le jeton avec les secrets de cette application, jamais dans la configuration ci-dessous.",
				connecting:
					"Un onglet est ouvert sur {{host}}. Autorisez Kiroshi là-bas et cet écran se met à jour tout seul.",
				unsaved: "Disponible une fois cette application enregistrée.",
			},
			reason: {
				alreadyRunning:
					"Une connexion est déjà en cours. Terminez-la ou annulez-la, puis réessayez.",
				store:
					"Kiroshi n’a pas pu écrire le jeton dans les secrets de cette application, rien n’a été gardé.",
				transport:
					"Kiroshi n’a pas pu joindre l’agent, la connexion n’a donc jamais démarré.",
				refusedUrl:
					"Kiroshi a refusé d’ouvrir le lien de connexion donné par cette application. Vérifiez son adresse.",
				browserRefused:
					"Votre navigateur n’a pas voulu s’ouvrir. Réessayez, ou ouvrez le lien de connexion vous-même.",
				timedOut: "La connexion a expiré avant de revenir. Réessayez.",
				unknown: "La connexion s’est arrêtée : {{detail}}",
			},
			confirm: {
				title: "Déconnecter {{name}} ?",
				description:
					"Kiroshi abandonne le jeton et demande à {{name}} de l’oublier. Cet agent perd les outils de {{name}} jusqu’à une nouvelle connexion.",
			},
			session: {
				title: "{{name}} a été laissé de côté",
			},
			refused: {
				title: "La connexion ne fonctionne plus",
				description_one:
					"Kiroshi n’a pas pu renouveler le jeton, le seul outil de {{name}} a donc été absent {{sessions}} de {{agent}}. Se reconnecter suffit en général.",
				description_many:
					"Kiroshi n’a pas pu renouveler le jeton, les {{count}} outils de {{name}} ont donc été absents {{sessions}} de {{agent}}. Se reconnecter suffit en général.",
				description_other:
					"Kiroshi n’a pas pu renouveler le jeton, les {{count}} outils de {{name}} ont donc été absents {{sessions}} de {{agent}}. Se reconnecter suffit en général.",
				sessions_one: "de la dernière session",
				sessions_many: "des {{count}} dernières sessions",
				sessions_other: "des {{count}} dernières sessions",
				action: "Se reconnecter",
			},
		},
		install: {
			signIn: {
				title: "{{name}} vous connecte",
				description:
					"Un onglet du navigateur s’ouvre dès que vous l’ajoutez. Kiroshi garde le jeton avec les secrets de cette application, et le renouvelle tout seul.",
				action: "Ajouter et se connecter",
				fact: "Vous connecte. {{name}} s’ouvre dans votre navigateur et demande d’autoriser Kiroshi.",
			},
			key: {
				title: "Ce dont {{name}} a besoin",
				reveal: "Afficher",
				conceal: "Masquer",
				revealLabel: "Afficher {{field}}",
				concealLabel: "Masquer {{field}}",
				description: {
					agent:
						"Gardées avec les secrets de cette application, jamais dans la configuration. {{name}} voit les outils, jamais ces valeurs.",
					space:
						"Gardées avec les secrets de cette application, jamais dans la configuration. Chaque agent de {{name}} voit les outils, jamais ces valeurs.",
					profile:
						"Gardées avec les secrets de cette application, jamais dans la configuration. Chacun de vos agents voit les outils, jamais ces valeurs.",
				},
			},
			none: "Rien à configurer. Elle tourne sur cette machine, sans clé ni connexion.",
			hostedNone: "Rien à configurer. Ni clé, ni connexion.",
			unavailable: {
				title: "Kiroshi ne peut pas ajouter {{name}}",
				description: "Impossible de l’ajouter d’ici : {{reason}}.",
			},
			hosting: "Tourne sur <host>{{host}}</host>, pas sur cette machine.",
			tools: {
				title: "Ce qu’elle apporte",
				count: {
					plain_one: "{{count}} outil",
					plain_many: "{{count}} outils",
					plain_other: "{{count}} outils",
				},
			},
			footnote: {
				agent:
					"Les applications tournent sur votre machine, sous votre compte. En ajouter une rouvre la session de {{name}} pour que les outils soient là tout de suite.",
				space:
					"Les applications tournent sur votre machine, sous votre compte. En ajouter une ici donne ses outils à chaque agent de {{name}}.",
				profile:
					"Les applications tournent sur votre machine, sous votre compte. En ajouter une ici donne ses outils à chacun de vos agents, dans chaque espace.",
			},
			hostedFootnote: {
				agent:
					"Celle-ci tourne sur le serveur de {{source}}, pas sur votre machine. L’ajouter rouvre la session de {{name}} pour que les outils soient là tout de suite.",
				space:
					"Celle-ci tourne sur le serveur de {{source}}, pas sur votre machine. L’ajouter ici donne ses outils à chaque agent de {{name}}.",
				profile:
					"Celle-ci tourne sur le serveur de {{source}}, pas sur votre machine. L’ajouter ici donne ses outils à chacun de vos agents, dans chaque espace.",
			},
			done: "Ajoutée",
			failed: "Impossible de l’ajouter : {{reason}}",
			missing: "Aucune valeur pour {{fields}}.",
			rollback: {
				title: "{{name}} est restée dans la liste",
				description:
					"Sa clé n’a pas été écrite, et son retrait a été refusé lui aussi : {{reason}}.",
			},
		},
		notice:
			"Cet agent lance ses applications sur votre machine, sous votre compte. Ajoutez seulement ceux en qui vous avez confiance.",
		empty: {
			title: {
				agent: "Aucune application à lui",
				space: "Rien de partagé dans {{name}} pour l’instant",
				profile: "Aucune application à vous",
			},
			description: {
				agent:
					"Ajoutez-en une ici et cet agent reçoit des outils qu’il n’a pas seul. Elle tourne sur votre machine.",
				space:
					"Ajoutez-en une ici et chaque agent de cet espace reçoit ses outils.",
				profile:
					"Ajoutez-en une ici et chacun de vos agents reçoit ses outils, dans chaque espace. Idéal pour ce qui est à vous plutôt qu’à un projet.",
			},
		},
		catalogue: {
			loading: "Chargement du catalogue d’applications…",
			directory: "Depuis l’annuaire sélectionné.",
			empty: "Rien dans cette catégorie pour l’instant.",
			failed: "Impossible de joindre le catalogue d’applications.",
			partlyFailed:
				"Impossible de lire une partie du catalogue. Réessayez pour voir le reste.",
			stale: "Cette liste a été lue il y a plus d’un jour.",
			retry: "Réessayer",
			category: {
				everything: "Tout",
				"on-this-machine": "Sur cette machine",
				"commerce-shopping": "Commerce & achats",
				communication: "Communication",
				"consumer-health": "Santé grand public",
				creative: "Création",
				"data-analytics": "Données & analyse",
				"developer-tools": "Outils de développement",
				education: "Éducation",
				"financial-services": "Services financiers",
				"health-life-sciences": "Santé & sciences du vivant",
				legal: "Juridique",
				"media-entertainment": "Médias & divertissement",
				nonprofit: "Associatif",
				productivity: "Productivité",
				"sales-marketing": "Ventes & marketing",
				travel: "Voyage",
				other: "Autre",
			},
			unavailable: "Impossible de lire les applications que Kiroshi connaît.",
			unrefreshed: {
				title: "Impossible d’actualiser l’annuaire des applications",
				description:
					"Vous voyez la dernière liste lue. Rouvrez le catalogue pour réessayer.",
			},
			nothing: "Aucun résultat pour {{query}}. Essayez un autre nom.",
			setup: {
				signIn: "Vous connecte",
				apiKey: "Demande une clé d’API",
				none: "Rien à configurer",
				unavailable: "Impossible de l’ajouter ici",
			},
		},
		unavailable:
			"Impossible de charger les applications. Rouvrez les réglages pour réessayer.",
		reopen: {
			refused: {
				title: "Impossible de rouvrir la session de {{agent}}",
				description:
					"{{name}} la rejoindra à la prochaine ouverture de cette session.",
			},
		},
		name: {
			label: "Nom",
			placeholder: "atlas",
			hint: "Minuscules, chiffres et traits d’union. L’agent connaît l’application sous ce nom.",
			blank: "Une application a besoin d’un nom.",
		},
		config: {
			label: "Configuration",
			placeholder:
				'{\n  "command": "npx",\n  "args": ["-y", "@scope/server"]\n}',
			hint: "Collez le JSON des instructions de l’application. Une application locale nomme une commande, une application distante une URL.",
			invalid:
				"Ce n’est pas un objet JSON. Vérifiez les accolades, les virgules et les guillemets.",
		},
		transport: {
			label: "Transport",
			hint: "Une application locale lance une commande. Une application distante se connecte à une URL.",
			option: {
				local: "Démarré sur cette machine",
				remote: "Joint par le réseau",
			},
		},
		command: {
			label: "Commande",
			placeholder: "npx",
			hint: "Le programme que cet agent démarre. Il tourne avec les accès de votre compte.",
		},
		args: {
			label: "Arguments",
			placeholder: "-y\n@scope/server",
			hint: "Un argument par ligne, dans l’ordre.",
		},
		url: {
			label: "URL",
			placeholder: "https://exemple.com/mcp",
			hint: "L’adresse à laquelle cet agent se connecte. Rien ne tourne sur votre machine.",
		},
		endpoint: {
			label: "Point d’accès",
			hint: "La façon dont Kiroshi joint l’URL. Streamable HTTP compte comme HTTP.",
			option: {
				http: "HTTP",
				sse: "Événements envoyés par le serveur",
				ws: "WebSocket",
			},
		},
		headers: {
			label: "En-têtes",
			placeholder: "Authorization: Bearer jeton",
			hint: "Un en-tête par ligne, nom et valeur. Mettez ici la clé de l’application.",
		},
		secrets: {
			label: "Secrets",
			placeholder: "ATLAS_TOKEN=sk-…",
			hint: "Un nom et une valeur par ligne. L’application reçoit ces secrets et aucun autre.",
		},
		leave: {
			title: "Partir sans enregistrer ?",
			description:
				"Vous perdrez vos modifications non enregistrées. L’application enregistrée reste telle quelle.",
			action: "Partir",
		},
		launch: {
			label: "Ce que cela démarre",
			secrets: "Secrets",
			unknown: "Ajoutez une commande ou une URL à cette configuration.",
			reveal: "Afficher la valeur de {{name}}",
			conceal: "Masquer la valeur de {{name}}",
		},
		delete: {
			action: "Retirer l’application",
			description: "Cet agent cesse de le démarrer. C’est irréversible.",
			confirm: {
				title: "Retirer {{name}} ?",
			},
		},
	},
	secrets: {
		add: "Ajouter un secret",
		notice:
			"Kiroshi transmet chaque valeur à ce qui tourne ici et ne l’affiche plus jamais.",
		unreadable: {
			title: "Impossible de charger les secrets",
			description: "Rouvrez les réglages pour réessayer.",
		},
		empty: {
			title: "Aucun secret",
			description:
				"Ajoutez un secret pour transmettre une valeur à ce qui tourne ici. Vous ne la reverrez plus.",
		},
		scope: {
			user: "Toi",
			space: "Espace",
			bot: "Agent",
			server: "Application",
		},
		row: {
			scopes: "Défini dans {{defined}} · Servi depuis {{served}}",
			overridden: "Remplacé par {{scope}}",
			overriding: "Remplace {{scope}}",
			needsValue: "Valeur manquante",
			unsetHere: "Vide ici",
			noValue: "Défini dans {{defined}} · Aucune valeur",
			replace: "Remplacer la valeur de {{name}}",
			remove: "Retirer {{name}}",
		},
		set: {
			add: {
				title: "Ajouter un secret",
				description:
					"La valeur est transmise à ce qui tourne ici. Vous ne la reverrez plus.",
			},
			replace: {
				title: "Remplacer une valeur",
				description:
					"Saisissez une nouvelle valeur pour {{name}}. L’actuelle reste masquée.",
			},
			name: {
				label: "Nom",
				placeholder: "ATLAS_TOKEN",
				hint: "Majuscules, chiffres et tirets bas. Les programmes lisent le secret sous ce nom.",
				invalid:
					"Utilisez des majuscules, des chiffres et des tirets bas, en commençant par une lettre ou un tiret bas.",
			},
			value: {
				label: "Valeur",
				hint: "Enregistrée une fois, jamais réaffichée.",
			},
			submit: "Enregistrer le secret",
			failed: "Impossible d’enregistrer ce secret. Réessayez.",
		},
		remove: {
			title: "Retirer {{name}} ?",
			description: "Plus rien ici ne le reçoit. C’est irréversible.",
			action: "Retirer le secret",
			failed: "Impossible de retirer ce secret. Réessayez.",
		},
	},
	runtime: {
		model: {
			label: "Modèle",
			placeholder: "Choisissez un modèle",
			unreadable: "Impossible de lire les modèles proposés par cette machine.",
		},
		effort: {
			label: "Effort",
			option: {
				default: "Par défaut",
				low: "Faible",
				medium: "Moyen",
				high: "Élevé",
				xhigh: "Très élevé",
				max: "Maximal",
			},
		},
		outputStyle: {
			label: "Style de réponse",
			option: {
				Concise: {
					label: "Concis",
					hint: "Des réponses courtes qui commencent par le résultat.",
				},
				default: {
					label: "Standard",
					hint: "Les réponses standard de l’agent.",
				},
			},
		},
	},
	approvals: {
		mode: {
			label: "Réponse par défaut à une demande",
			option: {
				auto: {
					label: "Décider seul",
					hint: "L’agent décide seul, dans les limites des règles ci-dessous.",
				},
				default: {
					label: "Demander à chaque fois",
					hint: "Vous validez chaque outil que les règles ci-dessous ne couvrent pas.",
				},
				acceptEdits: {
					label: "Accepter les modifications",
					hint: "Les modifications de fichiers passent. Vous validez tout le reste.",
				},
				plan: {
					label: "Planifier d’abord",
					hint: "L’agent lit et planifie, et ne change rien sans votre accord.",
				},
				dontAsk: {
					label: "Ne jamais demander",
					hint: "Rien ne vous est demandé. Seules les règles de refus ci-dessous arrêtent l’agent.",
				},
			},
		},
		rule: {
			add: "Ajouter",
			placeholder: "Bash(git status:*)",
			invalid: "Écrivez une règle sous la forme Outil ou Outil(spécificateur).",
			remove: "Retirer la règle {{rule}}",
			allow: {
				label: "Autorisé",
				hint: "S’exécute sans vous demander.",
				empty: "Aucune règle d’autorisation.",
			},
			ask: {
				label: "Soumis",
				hint: "Vous est demandé à chaque fois, quel que soit le mode.",
				empty: "Aucune règle de demande.",
			},
			deny: {
				label: "Refusé",
				hint: "Toujours refusé, quel que soit le mode.",
				empty: "Aucune règle de refus.",
			},
		},
		directories: {
			label: "Autres dossiers",
			hint: "Les dossiers que l’agent peut atteindre en plus du sien.",
			placeholder: "/Users/vous/notes",
			add: "Ajouter",
			empty: "Aucun dossier en plus du sien.",
			invalid: "Indiquez le chemin complet du dossier.",
			remove: "Retirer le dossier {{path}}",
		},
	},
	identity: {
		avatar: "Avatar",
		uploadedImage: "Image importée",
		colour: {
			label: "Couleur",
			none: "Aucune couleur",
			own: "Votre teinte",
			ownValue: "Votre teinte · {{hue}}°",
			degree: "°",
			option: {
				red: "Rouge",
				yellow: "Jaune",
				green: "Vert",
				cyan: "Cyan",
				blue: "Bleu",
				purple: "Violet",
				pink: "Rose",
				orange: "Orange",
			},
		},
		picture: {
			label: "Image",
			file: "Fichier image de l’avatar",
			add: "Ajouter une image",
			change: "Changer l’image",
			remove: "Retirer l’image",
		},
	},
	danger: {
		delete: "Supprimer l’agent",
		description:
			"L’agent est supprimé partout, pas seulement retiré de ses espaces. C’est irréversible.",
		confirm: {
			title: "Supprimer {{name}} ?",
		},
		failed: "Impossible de supprimer cet agent. Réessayez.",
	},
} as const

export { bots }
