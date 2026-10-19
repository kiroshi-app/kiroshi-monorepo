const chat = {
	emptyState: {
		ready: {
			title: "Commencer avec l’agent",
			description:
				"Kiroshi dialogue directement avec l’agent. Rien ne quitte votre appareil.",
		},
		unavailable: {
			title: "Impossible de joindre l’agent",
			description: "L’agent intégré de Kiroshi n’a pas répondu. Réessayez.",
		},
		notConnected: {
			title: "Vous n’êtes pas connecté",
			description:
				"Connectez votre compte Claude pour que vos compagnons puissent répondre.",
		},
		settings: "Ouvrir les réglages du compagnon",
		hint: "Écrivez à un compagnon pour commencer.",
		setup: "Réessayer",
		signIn: "Se connecter",
	},
	conversationEmptyState: {
		description_one: "{{count}} compagnon est prêt.",
		description_many: "{{count}} compagnons sont prêts.",
		description_other: "{{count}} compagnons sont prêts.",
		hint: "Écrivez à un compagnon pour commencer.",
		nobody: {
			title: "Personne n’est encore dans cette conversation",
			description:
				"Tapez @ et choisissez un nom. Le compagnon que vous mentionnez rejoint la conversation, et peut à son tour inviter ceux dont il a besoin.",
			suggested: "Ceux à qui vous parlez le plus",
		},
	},
	conversationArrival: {
		invitedByPerson:
			"{{name}} a rejoint cette conversation, sur votre invitation",
		invitedByCompanion:
			"{{name}} a rejoint cette conversation, à l’invitation de {{inviter}}",
	},
	connection: {
		checking: "Vérification de l’agent…",
		ready: "Agent prêt",
		unavailable: "Agent indisponible",
		crashed: "Agent arrêté",
	},
	transcript: {
		label: "Conversation",
		loadOlder: "Charger les messages plus anciens",
		loadNewer: "Charger les messages plus récents",
		jumpToLatest: "Aller au dernier message",
		newMessages: "Nouveaux messages",
		newCounted_one: "{{count}} nouveau message",
		newCounted_many: "{{count}} nouveaux messages",
		newCounted_other: "{{count}} nouveaux messages",
		startOfHistory: "Début de la conversation",
		day: {
			today: "Aujourd’hui",
			yesterday: "Hier",
		},
		landing: {
			unavailable: {
				title: "Impossible d’ouvrir ce message",
				description: "Ouvrez à nouveau le résultat de recherche.",
			},
		},
		message: {
			user: "message de l’utilisateur",
			assistant: "message de l’assistant",
			person: "message de {{name}}",
			mission: "mission ouverte",
			actions: "Actions du message",
		},
		showMore: "Afficher plus",
		showLess: "Afficher moins",
		author: {
			lead: "Chef",
			deleted: "Compagnon supprimé",
		},
		cause: {
			label: "Rapport de routine",
			mission: "Convocation de mission",
			unavailable: {
				title: "Impossible de charger les rapports de routine",
				description: "Rouvrez la conversation pour réessayer.",
				soloDescription: "Rouvrez la conversation pour réessayer.",
			},
		},
		mention: {
			unknown: "Compagnon inconnu",
			counted_one: "{{count}} mention",
			counted_many: "{{count}} mentions",
			counted_other: "{{count}} mentions",
			unresolved: {
				title_one: "Impossible de convoquer un compagnon",
				title_many: "Impossible de convoquer ces compagnons",
				title_other: "Impossible de convoquer ces compagnons",
				description_one:
					"{{names}} a été nommé mais n’a pas de siège dans cette conversation.",
				description_many:
					"{{names}} ont été nommés mais n’ont pas de siège dans cette conversation.",
				description_other:
					"{{names}} ont été nommés mais n’ont pas de siège dans cette conversation.",
			},
		},
	},
	turn: {
		copy: "Copier",
		reply: "Répondre",
		pin: "Épingler",
		unpin: "Retirer l’épingle",
		copied: "Copié",
		retry: "Réessayer",
		cancel: "Annuler ce message",
		footer: {
			cancelled: "Arrêté",
			failed: "Cette réponse a échoué",
			queued: "En attente d’envoi",
		},
	},
	reply: {
		label: "Réponse à {{author}}",
		dismiss: "Annuler la réponse",
	},
	pinned: {
		title: "Messages épinglés",
		counted_one: "Messages épinglés, {{count}} épinglé",
		counted_many: "Messages épinglés, {{count}} épinglés",
		counted_other: "Messages épinglés, {{count}} épinglés",
		jump: "Aller",
		jumpTo: "Aller au message de {{author}}",
		unpin: "Retirer l’épingle du message de {{author}}",
		empty: "Aucun message épinglé dans cette conversation.",
		unavailable: {
			title: "Impossible de synchroniser les messages épinglés",
			description: "Réessayez dans un instant.",
		},
	},
	working: {
		name: "Sans nom",
		verb: {
			thinking: "réfléchit",
			searching: "cherche",
			working: "travaille",
			writing: "écrit",
			waiting: "vous attend",
		},
		state: "{{name}} {{verb}}…",
		labelled: "{{name}} · {{label}}",
		mcp: "{{server}} · {{tool}}",
		waitingTitled: "{{name}} vous attend… · {{title}}",
		upNext: "{{name}} passe ensuite…",
		stop: "Arrêter {{name}}",
	},
	notice: {
		retry: "Réessayer",
		dismiss: "Ignorer l’avis",
	},
	spaceAccessBanner: {
		removed: {
			title: "Vous n’êtes plus membre de {{space}}",
			body: "Ses conversations ne sont plus sur cet appareil. Demandez une nouvelle invitation à {{host}}.",
		},
		deleted: {
			title: "{{host}} a supprimé {{space}}",
			body: "Ses conversations ne sont plus sur cet appareil.",
		},
		offline: {
			title: "{{space}} est hors ligne",
			body: "Vous pouvez lire ce qui est ici. Vous pourrez de nouveau envoyer quand Kiroshi sera ouvert sur l’ordinateur de {{host}}.",
		},
	},
	attachments: {
		label: "Pièces jointes",
		open: "Ouvrir {{name}}",
		remove: "Retirer {{name}}",
		attach: "Joindre des fichiers",
	},
	composer: {
		label: "Message",
		placeholder: "Message",
		send: "Envoyer",
		offline:
			"{{space}} est hors ligne. Vous pourrez écrire à nouveau dès que l’ordinateur de {{host}} sera de retour.",
		commands: "Commandes",
		mentions: "Compagnons",
		lead: "Meneur",
		mentioned_one: "{{count}} mention dans le brouillon",
		mentioned_many: "{{count}} mentions dans le brouillon",
		mentioned_other: "{{count}} mentions dans le brouillon",
		outside: "Pas dans cette conversation",
		invite: "Ajouter à cette conversation",
		further_one: "Continuez à taper pour atteindre l’autre dans {{space}}",
		further_many:
			"Continuez à taper pour atteindre les {{count}} autres dans {{space}}",
		further_other:
			"Continuez à taper pour atteindre les {{count}} autres dans {{space}}",
	},
	toolApproval: {
		title: "Autoriser cet outil à s’exécuter ?",
		status: {
			pending: "Autorisation requise",
			allowed: "Autorisé une fois",
			denied: "Refusé",
		},
		sensitive: "Masqué",
		input: "Entrée de l’outil",
		allowOnce: "Autoriser une fois",
		deny: "Refuser",
	},
	toolQuestion: {
		freeText: "Autre réponse",
		freeTextPlaceholder: "Écrivez votre propre réponse…",
		blank: "Répondez à cette question pour continuer.",
		preview: "Aperçu",
		submit: "Envoyer les réponses",
		next: "Passer à la question suivante",
		continue: "Continuer",
		dismiss: "Ignorer",
		copy: "Copier",
		copied: "Copié",
		copyAnnounced: "Lien copié dans le presse-papiers",
		copyFailed:
			"Copie impossible. Sélectionnez le lien et copiez-le vous-même.",
	},
	applicationInstall: {
		openSettings: "Ouvrir les réglages",
		receipt: {
			companion: "{{destination}} a {{name}} dans toutes ses conversations.",
			space: "Chaque compagnon de {{destination}} a {{name}}.",
			user: "Vous avez {{name}} dans toutes vos conversations.",
		},
		secret_one: "Sa clé va dans {{secret}}.",
		secret_many: "Ses clés vont dans {{secret}}.",
		secret_other: "Ses clés vont dans {{secret}}.",
		unreadable:
			"Impossible de lire les applications ajoutées à cette conversation.",
	},
	code: {
		snippet: "Extrait de code",
		namedSnippet: "Extrait de code, {{name}}",
		copy: "Copier le code",
		copied: "Copié",
		copyTooltip: "Copier",
		copyAnnounced: "Code copié dans le presse-papiers",
		copyFailed: "Impossible de copier le code. Réessayez.",
		writing: "Écriture",
		ready: "Prêt",
	},
	table: {
		label: "Tableau",
		copy: "Copier le tableau",
		copyAnnounced: "Tableau copié dans le presse-papiers",
	},
	diagram: {
		label: "Diagramme",
	},
	task: {
		done: "Fait",
		todo: "À faire",
	},
	screen: {
		label: "Conversation avec l’agent",
		identity: "{{name}} · réglages du compagnon",
		conversationIdentity: "{{name}} · réglages de la conversation",
		placeholder: "Message à {{name}}",
		approval: {
			description: "L’agent attend votre autorisation pour lancer cet outil.",
			path: "Chemin",
		},
		question: {
			recall: "{{author}} attend votre réponse",
		},
		attachmentsRefused: "Impossible de joindre les fichiers",
		restart: "Redémarrer la session",
		notice: {
			crashed: "L’agent s’est arrêté",
			resumeFailed: "Impossible de reprendre la conversation",
			settingsRejected: "Impossible d’appliquer les réglages du compagnon",
			serverEnvRejected: "Impossible de démarrer une application",
			notAuthenticated: "Vous n’êtes pas connecté",
			unavailable: "Impossible de joindre l’agent",
			failed: "Impossible d’envoyer cette demande",
			unauthorized: {
				title: "L’hôte a refusé cet appel.",
				description: "Rouvrez le lien depuis l’application de bureau.",
			},
			hostOnly:
				"Seul l’hôte de cet espace peut faire cela. Demandez-lui de le faire depuis son Kiroshi.",
			hostOffline: {
				title: "Impossible de joindre l’hôte de cet espace",
				description:
					"Son ordinateur est hors ligne. Réessayez une fois qu’il est de nouveau en ligne.",
			},
			joinRefused: {
				unavailable: {
					title: "Impossible d’ouvrir les espaces rejoints",
					description:
						"Kiroshi ne peut pas lire son stockage sur cet ordinateur. Redémarrez Kiroshi, puis réessayez.",
				},
				storage: {
					title: "Impossible de lire la connexion à cet espace",
					description:
						"Kiroshi n’a pas pu charger ce qu’il a enregistré sur cet espace. Réessayez dans un instant.",
				},
				unknownJoinedSpace: {
					title: "Cet espace n’est plus dans votre liste",
					description:
						"Vous l’avez peut-être quitté. Demandez une nouvelle invitation à son hôte.",
				},
				undeliverable: {
					title: "Impossible d’ouvrir cet espace",
					description:
						"Kiroshi n’a pas pu transmettre la demande. Redémarrez Kiroshi, puis réessayez.",
				},
				proxyUnavailable: {
					title: "Impossible de se connecter à cet espace",
					description:
						"La connexion à son hôte n’a pas pu s’ouvrir. Vérifiez votre réseau, puis réessayez.",
				},
				ownerNotRemovable: {
					title: "Cet espace vous appartient",
					description: "Le propriétaire d’un espace ne peut pas le quitter.",
				},
				needsSignIn: {
					title: "Impossible de quitter cet espace",
					description: "Vous êtes déconnecté. Connectez-vous, puis réessayez.",
				},
				sessionRevoked: {
					title: "Impossible de quitter cet espace",
					description:
						"Votre session a pris fin. Reconnectez-vous, puis réessayez.",
				},
				sessionStore: {
					title: "Impossible de quitter cet espace",
					description:
						"Kiroshi n’a pas pu lire votre connexion sur cet ordinateur. Redémarrez Kiroshi, puis réessayez.",
				},
				relayUnreachable: {
					title: "Impossible de quitter cet espace",
					description:
						"Kiroshi n’a pas pu joindre son cloud. Vérifiez votre réseau, puis réessayez.",
				},
				relayRefused: {
					title: "Impossible de quitter cet espace",
					description:
						"Le cloud de Kiroshi n’a pas confirmé votre départ. Réessayez dans un instant.",
				},
				malformedLink: {
					title: "Impossible de lire ce lien d’invitation",
					description:
						"Le lien est incomplet ou abîmé. Demandez un nouveau lien à l’hôte.",
				},
				linkUsed: {
					title: "Ce lien d’invitation a déjà servi",
					description:
						"Un lien n’admet qu’un seul ordinateur. Demandez un nouveau lien à l’hôte.",
				},
				noInvitation: {
					title: "Vous n’êtes pas invité dans cet espace",
					description:
						"Votre compte n’a aucune invitation pour lui. Demandez à l’hôte de vous inviter, puis rouvrez le lien.",
				},
				notInRoster: {
					title: "Cet ordinateur ne fait pas partie de l’espace",
					description:
						"Son hôte n’a pas listé cet ordinateur. Demandez un nouveau lien à l’hôte.",
				},
				badSignature: {
					title: "Impossible de se fier à la réponse de cet espace",
					description:
						"Ses clés ne correspondent pas à ce que l’hôte a signé. Demandez un nouveau lien à l’hôte.",
				},
				removedByRotation: {
					title: "Cet ordinateur a été retiré de l’espace",
					description:
						"Son hôte ne l’accepte plus. Demandez un nouveau lien à l’hôte pour le rejoindre.",
				},
				needsJoinLink: {
					title: "Cet espace demande un lien d’invitation",
					description:
						"Cet ordinateur n’a encore aucune clé pour lui. Demandez un lien à l’hôte, puis ouvrez-le ici.",
				},
				keyStore: {
					title: "Impossible de lire les clés de cet ordinateur",
					description:
						"Kiroshi n’a pas pu ouvrir les clés qu’il garde pour vos espaces. Redémarrez Kiroshi, puis réessayez.",
				},
				unexpected: {
					title: "Un problème est survenu avec cet espace",
					description:
						"Kiroshi n’a pas pu terminer la demande. Réessayez dans un instant.",
				},
			},
			readFailed: "Impossible de charger les messages précédents",
		},
		transport: {
			binaryNotFound: "Impossible de trouver l’agent. Réinstallez Kiroshi.",
			notAuthenticated:
				"Vous êtes déconnecté de votre abonnement Claude. Connectez-vous à Claude, puis relancez la conversation.",
			notConnected:
				"Votre compte Claude n’est pas connecté. Connectez-vous pour continuer.",
			authCheckFailed:
				"Impossible de vérifier votre connexion ({{detail}}). Redémarrez la session.",
			spawnFailed:
				"Impossible de démarrer l’agent ({{detail}}). Redémarrez la session.",
			startupTimeout:
				"L’agent n’a pas répondu en {{timeoutMs}} ms. Redémarrez la session.",
			crashed: "L’agent s’est arrêté (code {{code}}). Redémarrez la session.",
			crashedDetail:
				"L’agent s’est arrêté (code {{code}}) : {{detail}}. Redémarrez la session.",
			crashedUnknownCode:
				"L’agent s’est arrêté (code inconnu). Redémarrez la session.",
			crashedUnknownCodeDetail:
				"L’agent s’est arrêté (code inconnu) : {{detail}}. Redémarrez la session.",
			resumeFailed:
				"L’agent a démarré une nouvelle session. Continuez, vos messages sont toujours là.",
			invalidFrame: "Trame illisible ignorée ({{detail}}). Continuez.",
			settingsRejected:
				"Impossible d’appliquer settings.json ({{detail}}). Corrigez-le, puis redémarrez la session.",
			serverEnvRejected:
				"{{detail}}. Les autres applications tournent toujours, corrigez celui-ci puis redémarrez la session.",
			notStarted:
				"Aucune session en cours. Démarrez une session pour continuer.",
			turnAlreadyRunning:
				"Un tour est déjà en cours. Attendez-le ou arrêtez-le.",
			transitionInProgress: "La session change déjà. Patientez un instant.",
			noActiveTurn: "Aucun tour à arrêter.",
			staleRuntimeSession:
				"Cette session a été remplacée. Continuez dans la session actuelle.",
			unknownPermission:
				"Demande d’autorisation introuvable ({{id}}). Ignorez-la.",
			writeFailed: "Impossible d’envoyer le message ({{detail}}). Réessayez.",
			readFailed:
				"Impossible de charger les messages précédents ({{detail}}). Réessayez.",
			unknownFailure: "Une erreur est survenue ({{detail}}). Réessayez.",
		},
		attachment: {
			megabytes: "{{size}} Mo",
			storage:
				"Impossible d’enregistrer les fichiers ({{failure}}). Joignez-les à nouveau.",
			unknownConversation:
				"Cette conversation n’existe plus. Rouvrez le compagnon et joignez-les à nouveau.",
			tooMany:
				"Un message accepte {{limit}} fichiers au maximum, et {{staged}} sont en attente. Retirez-en.",
			tooLarge:
				"{{name}} dépasse la limite de {{limit}} par fichier. Joignez un fichier plus léger.",
			tooLargeTogether:
				"Ces fichiers totalisent {{bytes}}, au-delà de la limite de {{limit}} par message. Retirez-en.",
			unwritable:
				"Impossible d’enregistrer les fichiers ({{detail}}). Joignez-les à nouveau.",
		},
	},
	namelessConversation: {
		separator: ", ",
	},
	conversationSeating: {
		failed: "Impossible de changer qui est dans cette conversation. Réessayez.",
		refused:
			"Impossible de faire venir {{name}} dans cette conversation. Réessayez.",
		unavailable: "Impossible de charger les compagnons à suggérer. Réessayez.",
	},
	conversationSettings: {
		breadcrumb: "Paramètres",
		untitled: "Conversation sans nom",
		tab: {
			general: "Général",
			participants: "Participants",
			instructions: "Instructions",
			danger: "Zone de danger",
		},
		name: {
			label: "Nom",
			placeholder: "Le sujet de cette conversation",
		},
		icon: {
			label: "Icône",
			option: {
				MessageSquare: "Message",
				Bug: "Bogue",
				Rocket: "Fusée",
				ShieldKey: "Bouclier",
				Pen: "Stylo",
				FileText: "Fichier",
				Download: "Téléchargement",
				Laptop: "Ordinateur",
				Smartphone: "Téléphone",
				BookOpen: "Livre",
				CreditCard: "Carte",
				Megaphone: "Mégaphone",
				PanelLeft: "Panneau",
				Code: "Code",
				Terminal: "Terminal",
				Server: "Serveur",
				Globe: "Globe",
				Palette: "Palette",
				Lightbulb: "Ampoule",
				ChartLine: "Graphique",
				Calendar: "Calendrier",
				Users: "Personnes",
				Flag: "Drapeau",
				Sparkles: "Étincelles",
			},
		},
		instructions: {
			label: "Instructions",
			placeholder:
				"Ce que chaque compagnon de cette conversation doit garder en tête",
		},
		participants: {
			label: "Dans cette conversation",
			lead: "Meneur",
			promote: "Confier la conduite à {{name}}",
			dismiss: "Retirer {{name}}",
			last: "Une conversation a besoin d’au moins un compagnon.",
		},
		danger: {
			delete: "Supprimer la conversation",
			description:
				"Ses messages sont supprimés ; ses compagnons restent dans l’espace. C’est irréversible.",
			confirm: {
				title: "Supprimer {{name}} ?",
			},
		},
	},
	activity: {
		panel: {
			close: "Fermer l’activité",
			label: "Activité",
			toggle: "Afficher ou masquer l’activité",
			title: "Activité",
		},
		missions: {
			group: {
				waiting: "En attente de vous",
				inProgress: "En cours",
				earlierToday: "Plus tôt aujourd’hui",
			},
		},
		routines: {
			title: "Routines",
			back: "Retour à l’activité",
		},
		runs: {
			reported: "rapporté",
		},
		empty: {
			title: "Rien ne tourne ici",
			description:
				"Les missions et les rapports de routine de cette conversation s’affichent ici.",
		},
		failure: {
			missions: {
				title: "Impossible de charger les missions",
				description:
					"Les missions sont toujours là ; seule la liste n’a pas pu se charger.",
			},
			routines: {
				title: "Impossible de charger les routines",
				description:
					"Les routines continuent de tourner ; seule la liste n’a pas pu se charger.",
			},
			activity: {
				title: "Impossible de charger l’activité",
				description:
					"Les missions et les routines sont toujours là ; seule la liste n’a pas pu se charger.",
			},
			write: {
				title: "Impossible de modifier la routine",
				description: "Votre modification n’est pas enregistrée. Réessayez.",
			},
		},
	},
	routines: {
		form: {
			new: "Créer une routine",
			edit: "Modifier la routine",
			back: "Retour aux routines",
			save: "Enregistrer la routine",
			title: {
				label: "Titre",
				placeholder: "Résumé du matin",
			},
			instruction: {
				label: "Instruction",
				placeholder:
					"Lis ce qui est arrivé cette nuit et écris un court résumé.",
			},
			source: {
				label: "Déclencheur",
				placeholder: "Choisissez ce qui déclenche cette routine",
				tied: "Vous ne pouvez pas changer le déclencheur d’une routine enregistrée.",
			},
			expression: {
				label: "Expression cron",
				placeholder: "0 8 * * *",
			},
			path: {
				label: "Fichier surveillé",
				placeholder: "/notes/CHANGELOG.md",
			},
			webhook: {
				url: "Adresse",
				key: "Clé",
				header: "Nom de l’en-tête",
				copy: "Copier {{field}} de cette routine",
				copied: "{{field}} copié",
				reading: "Chargement de l’adresse et de la clé…",
				pending:
					"Enregistrez la routine pour obtenir son adresse, sa clé et son nom d’en-tête.",
				failure:
					"Impossible de charger l’adresse et la clé. Rouvrez la routine pour réessayer.",
			},
			filter: {
				label: "Filtre",
				everyEvent: "Chaque événement déclenche cette routine.",
				add: "Ajouter une ligne",
				row: "Ligne {{rank}}",
				remove: "Supprimer la ligne sur {{field}}",
				matchMode: {
					label: "Déclencher quand",
					all: "Chaque ligne est vraie",
					any: "Une ligne est vraie",
				},
				field: {
					label: "Champ",
					otherPath: "Un autre chemin",
				},
				path: {
					label: "Chemin",
					placeholder: "sender.address",
				},
				operator: {
					label: "Opérateur",
				},
				value: {
					label: "Valeur",
					true: "Vrai",
					false: "Faux",
				},
				operators: {
					exists: "est présent",
					not_exists: "est absent",
					equals: "est égal à",
					not_equals: "est différent de",
					contains: "contient",
					not_contains: "ne contient pas",
					starts_with: "commence par",
					ends_with: "finit par",
					gt: "est supérieur à",
					lt: "est inférieur à",
				},
				fieldTypes: {
					string: "texte",
					number: "nombre",
					boolean: "booléen",
					datetime: "date",
				},
			},
			error: {
				blankTitle: "Une routine a besoin d’un titre.",
				blankInstruction: "Une routine a besoin d’une instruction.",
				blankValue: "Cette ligne a besoin d’une valeur.",
				untypedComparison: "Choisissez un champ déclaré par le déclencheur.",
				unreadableExpression:
					"Impossible de lire cet horaire. Vérifiez l’expression cron.",
				unsupportedOperator:
					"{{operator}} ne convient pas à un champ {{fieldType}}. Choisissez un autre opérateur.",
			},
		},
		detail: {
			title: "Routine",
			back: "Retour à la routine",
			runNow: {
				action: "Exécuter maintenant",
				refusal: {
					disabled: "Cette routine est désactivée. Activez-la pour l’exécuter.",
					filter: "Rien n’a tourné : le filtre n’a rien laissé passer.",
					dedupeValueMissing:
						"Rien n’a tourné : ce déclencheur ne distingue pas les événements.",
					alreadySeen: "Rien n’a tourné : cet événement a déjà été exécuté.",
				},
			},
			history: {
				label: "Historique des exécutions",
				reading: "Chargement des exécutions…",
				counted_one: "{{count}} exécution",
				counted_many: "{{count}} exécutions",
				counted_other: "{{count}} exécutions",
				page_one: "{{count}} dernière exécution lue",
				page_many: "{{count}} dernières exécutions lues",
				page_other: "{{count}} dernières exécutions lues",
				reported_one: "{{count}} rapport",
				reported_many: "{{count}} rapports",
				reported_other: "{{count}} rapports",
				latest: "La plus récente {{when}}",
				outcome: {
					reported: "Rapportée",
					nothing: "Rien à rapporter",
					skipped: "Ignorée",
					failed: "Échouée",
					running: "En cours",
				},
				empty: {
					title: "Aucune exécution enregistrée",
					description: "Les exécutions s’affichent ici au fur et à mesure.",
				},
				failure: {
					title: "Impossible de charger les exécutions",
					description:
						"La routine continue de tourner ; seul son historique n’a pas pu se charger.",
				},
			},
		},
		row: {
			delete: "Supprimer {{title}}",
			stopped: "S’est arrêtée",
		},
		confirm: {
			title: "Supprimer {{title}} ?",
			description:
				"Son historique d’exécutions est supprimé ; ses rapports passés restent dans la conversation. C’est irréversible.",
			label: "Supprimer la routine",
			failure: "Impossible de supprimer la routine. Réessayez.",
		},
		empty: {
			title: "Aucune routine",
			description:
				"Créez une routine pour faire travailler un compagnon selon un horaire ou quand un fichier change.",
		},
		leave: {
			title: "Quitter sans enregistrer ?",
			description:
				"Vous perdrez vos modifications non enregistrées. La routine enregistrée reste telle quelle.",
			action: "Quitter",
		},
	},
	missions: {
		panel: {
			empty: {
				title: "Aucune mission pour l’instant",
				description:
					"Les missions ouvertes par vos compagnons dans cet espace apparaissent ici.",
			},
		},
		state: {
			waiting_human: "Bloquée sur vous",
			ready_to_merge: "Prête à fusionner",
			failed: "Bloquée",
			done: "Terminée",
			closed: "Fermée",
		},
		live: "En cours maintenant",
		event: {
			source: {
				bot: "Le compagnon",
				reader: "Vous",
				agent: "L’agent",
				github: "GitHub",
			},
			line: {
				opened: "Mission ouverte par {{source}}",
				note: "Note enregistrée par {{source}}",
				agent_asked: "Question envoyée à l’agent par {{source}}",
				answered: "Réponse envoyée à l’agent",
				escalated: "Remontée à un humain par {{source}}",
				ready: "Marquée prête à fusionner par {{source}}",
				checks_failed: "Vérifications en échec signalées par {{source}}",
				failed: "Échec signalé par {{source}}",
				closed: "Mission fermée par {{source}}",
				dismissed: "Fermée par vous",
				reopened: "Mission rouverte par {{source}}",
			},
			kind: {
				opened: "Ouverture",
				note: "Note",
				agent_asked: "Question",
				answered: "Réponse",
				escalated: "Remontée",
				ready: "Prête à fusionner",
				checks_failed: "Vérifications en échec",
				failed: "En échec",
				closed: "Fermée",
				dismissed: "Fermée",
				reopened: "Rouverte",
			},
			link: "Ouvrir {{host}}",
		},
		activity: {
			commitsAhead_one: "{{count}} commit d'avance",
			commitsAhead_many: "{{count}} commits d'avance",
			commitsAhead_other: "{{count}} commits d'avance",
		},
		pullRequest: {
			label: "#{{number}}",
			open: "Ouvrir la pull request n° {{number}}",
		},
		menu: {
			label: "Actions de la mission",
			open: "Ouvrir la mission",
			openPullRequest: "Ouvrir la PR",
			copy: "Copier",
			copyKind: {
				issue_id: "Identifiant du ticket",
				branch: "Branche",
				pull_request_url: "URL de la PR",
				workspace_path: "Chemin de l’espace de travail",
			},
			messageAgent: "Écrire à l’agent",
			stopAgent: "Arrêter l’agent",
			answer: "Répondre à la question",
			close: "Fermer",
			reopen: "Rouvrir",
			copied: "{{kind}} copié",
			failed: {
				openPullRequest: "Impossible d’ouvrir la pull request",
				copy: "Impossible de copier dans le presse-papiers",
				stopAgent: "Impossible d’arrêter l’agent",
				close: "Impossible de fermer la mission",
				reopen: "Impossible de rouvrir la mission",
			},
		},
		card: {
			open: "Ouvrir la mission : {{objective}}",
		},
		header: {
			tools: "Outils",
			back: "Retour à la conversation",
			openedAt: "ouverte {{time}}",
		},
		feed: {
			label: "Conversation de la mission",
		},
		summons: {
			working: "Ouvert par la mission",
			waiting_bot: "Ouvert par la question de l’agent",
		},
		composer: {
			placeholder: "Répondre à cette mission…",
		},
		failure: {
			read: {
				title: "Impossible de charger cette mission",
				description:
					"La mission est toujours là ; seule cette vue n’a pas pu se charger.",
			},
			send: {
				title: "Impossible d’envoyer votre réponse",
				description: "Renvoyez-la.",
			},
			run: {
				title: "Impossible de lancer le compagnon sur sa mission",
				description: "Ouvrez sa conversation pour vérifier.",
			},
		},
	},
	onboarding: {
		step: "{{step}} sur {{total}}",
		welcome: {
			header: "Configuration",
			question: "Prêt à commencer ?",
			start: {
				label: "Commencer",
				description: "Trois étapes, environ une minute.",
			},
			more: {
				label: "Dites-m’en plus d’abord",
				description: "Ce qu’est Kiroshi, avant de connecter quoi que ce soit.",
			},
		},
		account: {
			header: "Votre compte Claude",
			question: "Utiliser le compte déjà présent sur cette machine ?",
			use: {
				label: "Utiliser ce compte",
				description:
					"Connecté avec votre abonnement Claude, sous votre propre session.",
			},
			another: {
				label: "Utiliser un autre compte",
				description: "Reconnectez-vous avec un autre compte.",
			},
		},
		access: {
			header: "Votre compte Claude",
			question: "Comment voulez-vous vous connecter ?",
			signIn: {
				label: "Se connecter avec Claude",
				description:
					"Ouvre votre navigateur une fois. Fonctionne avec votre abonnement Pro ou Max.",
			},
			apiKey: {
				label: "Coller une clé API",
				description: "Paiement à l’usage, sans connexion.",
			},
		},
		code: {
			header: "Connexion",
			question: "Collez le code que Claude vous a donné",
			link: "Ouvrez ce lien et connectez-vous",
			entry: "Puis collez le code qu’il vous donne",
			exit: "Coller une clé à la place",
		},
		apiKey: {
			header: "Clé API",
			question: "Collez votre clé API Anthropic",
			entry: "Clé",
			placeholder: "sk-ant-…",
			exit: "Se connecter à la place",
		},
		signInFailed: {
			header: "Connexion",
			question: "Réessayer, ou utiliser une clé à la place ?",
			title: "Impossible de vous connecter",
			retry: {
				label: "Réessayer",
				description: "Ouvre votre navigateur une nouvelle fois.",
			},
		},
		connection: {
			keyFailed: {
				title: "Impossible d’utiliser cette clé",
				sentence: "Cette clé a été refusée, donc rien n’a été enregistré.",
				anotherKey: "Essayer une autre clé",
				anotherKeyDescription: "Collez une autre clé API Anthropic.",
				signIn: "Se connecter à la place",
			},
		},
		firstReply: {
			header: "Dernière étape",
			question: "Tout fonctionne. Prêt pour la dernière ?",
			pick: {
				label: "Choisir mon premier compagnon",
				description: "Encore une question, et vous êtes prêt.",
			},
			keepTalking: {
				label: "Continuer à discuter d’abord",
				description: "Posez-moi encore quelques questions. J’attends.",
			},
		},
		arrival: {
			failure: "{{name}} n’a pas pu dire bonjour",
		},
	},
} as const

export { chat }
