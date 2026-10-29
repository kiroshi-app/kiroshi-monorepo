const chat = {
	emptyState: {
		ready: {
			title: "Commencer avec l’agent",
			description:
				"Kiroshi dialogue directement avec l’agent. Rien ne quitte votre appareil.",
			descriptionNamed:
				"Kiroshi dialogue directement avec {{name}}. Rien ne quitte votre appareil.",
		},
		unavailable: {
			title: "Impossible de joindre l’agent",
			titleNamed: "Impossible de joindre {{name}}",
			description: "L’agent intégré de Kiroshi n’a pas répondu. Réessayez.",
			descriptionNamed: "{{name}} n’a pas répondu. Réessayez.",
		},
		notConnected: {
			title: "Vous n’êtes pas connecté",
			description:
				"Connectez votre compte Claude pour que vos agents puissent répondre.",
		},
		settings: "Ouvrir les réglages de l’agent",
		hint: "Écrivez à un agent pour commencer.",
		setup: "Réessayer",
		signIn: "Se connecter",
	},
	conversationEmptyState: {
		description_one: "{{count}} agent est prêt.",
		description_many: "{{count}} agents sont prêts.",
		description_other: "{{count}} agents sont prêts.",
		hint: "Écrivez à un agent pour commencer.",
		nobody: {
			title: "Personne n’est encore dans cette conversation",
			description:
				"Tapez @ et choisissez un nom. L’agent que vous mentionnez rejoint la conversation, et peut à son tour inviter ceux dont il a besoin.",
			suggested: "Ceux à qui vous parlez le plus",
		},
	},
	conversationArrival: {
		invitedByPerson:
			"{{name}} a rejoint cette conversation, sur votre invitation",
		invitedByAgent:
			"{{name}} a rejoint cette conversation, à l’invitation de {{inviter}}",
		createdBy: "{{creator}} a créé {{name}}",
	},
	connection: {
		checking: "Vérification de {{name}}…",
		ready: "{{name}} est prêt",
		unavailable: "{{name}} est indisponible",
		crashed: "{{name}} s’est arrêté",
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
			deleted: "Agent supprimé",
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
			unknown: "Agent inconnu",
			counted_one: "{{count}} mention",
			counted_many: "{{count}} mentions",
			counted_other: "{{count}} mentions",
			unresolved: {
				title_one: "Impossible de convoquer un agent",
				title_many: "Impossible de convoquer ces agents",
				title_other: "Impossible de convoquer ces agents",
				description_one:
					"{{names}} a été nommé mais n’a pas de siège dans cette conversation.",
				description_many:
					"{{names}} ont été nommés mais n’ont pas de siège dans cette conversation.",
				description_other:
					"{{names}} ont été nommés mais n’ont pas de siège dans cette conversation.",
			},
			notStarted: {
				title_one: "{{names}} n’a pas démarré",
				title_many: "{{names}} n’ont pas démarré",
				title_other: "{{names}} n’ont pas démarré",
				description_one:
					"Faites-le venir dans cette conversation, ou choisissez un autre agent.",
				description_many:
					"Faites-les venir dans cette conversation, ou choisissez d’autres agents.",
				description_other:
					"Faites-les venir dans cette conversation, ou choisissez d’autres agents.",
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
		offline: {
			title: "{{space}} est hors ligne",
			body: "Vous pouvez lire ce qui est ici. Vous pourrez de nouveau envoyer quand Kiroshi sera ouvert sur l’ordinateur de {{host}}.",
			reasons: {
				relayUnreachable:
					"Vous pouvez lire ce qui est ici. Impossible de joindre Kiroshi, vérifiez votre connexion pour envoyer de nouveau.",
				rekeySendFailed:
					"Vous pouvez lire ce qui est ici. Impossible de demander la nouvelle clé à {{host}}, vérifiez votre connexion pour envoyer de nouveau.",
				hostSilent:
					"Vous pouvez lire ce qui est ici. {{host}} n’a pas encore répondu, demandez-lui d’ouvrir Kiroshi sur son ordinateur.",
				socketClosed:
					"Vous pouvez lire ce qui est ici. La connexion à Kiroshi s’est fermée, vérifiez votre connexion pour envoyer de nouveau.",
				rekeyNotVerified:
					"Vous pouvez lire ce qui est ici. Impossible de vérifier la clé envoyée par {{host}}, demandez-lui un nouveau lien.",
				notMember:
					"Vous pouvez lire ce qui est ici. Kiroshi indique que ce compte n’est plus dans {{space}}, demandez un nouveau lien à {{host}}.",
				unknownInstance:
					"Vous pouvez lire ce qui est ici. Kiroshi n’héberge plus {{space}}, demandez à {{host}} de réactiver l’hébergement.",
				deviceKeysUnreadable:
					"Vous pouvez lire ce qui est ici. Impossible de lire les clés de cet ordinateur, quittez Kiroshi et rouvrez-le.",
				deviceAwaitingApproval:
					"Vous pouvez lire ce qui est ici. Cet ordinateur n’est pas encore approuvé, approuvez-le depuis un autre ordinateur connecté à votre compte.",
				socketUrlFailed:
					"Vous pouvez lire ce qui est ici. Impossible d’obtenir l’adresse de {{space}} auprès de Kiroshi, quittez Kiroshi et rouvrez-le.",
				rosterMissing:
					"Vous pouvez lire ce qui est ici. {{host}} n’a pas encore envoyé la liste des membres, demandez-lui d’ouvrir Kiroshi sur son ordinateur.",
				keychainReadFailed:
					"Vous pouvez lire ce qui est ici. Impossible de lire la clé de {{space}} dans le stockage sécurisé de cet ordinateur, quittez Kiroshi et rouvrez-le.",
			},
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
		mentions: "Agents",
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
		send: "Envoyer",
		next: "Passer à la question suivante",
		nextLabel: "Suivante",
		continue: "Continuer",
		skip: "Passer",
		minimise: "Réduire",
		pickAny: "Choisissez toutes celles qui conviennent.",
		waiting: {
			title: "{{name}} attend votre réponse",
			unnamedTitle: "En attente de votre réponse",
			mark: "?",
			answer: "Répondre",
		},
		copy: "Copier",
		copied: "Copié",
		copyAnnounced: "Lien copié dans le presse-papiers",
		copyFailed:
			"Copie impossible. Sélectionnez le lien et copiez-le vous-même.",
	},
	answeredQuestion: {
		byViewer: "Vous avez répondu",
		byMember: "{{name}} a répondu",
	},
	applicationInstall: {
		openSettings: "Ouvrir les réglages",
		receipt: {
			agent: "{{destination}} a {{name}} dans toutes ses conversations.",
			space: "Chaque agent de {{destination}} a {{name}}.",
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
		identity: "{{name}} · réglages de l’agent",
		conversationIdentity: "{{name}} · réglages de la conversation",
		placeholder: "Message à {{name}}",
		approval: {
			description: "L’agent attend votre autorisation pour lancer cet outil.",
			descriptionNamed:
				"{{name}} attend votre autorisation pour lancer cet outil.",
			path: "Chemin",
		},
		question: {
			recall: "{{author}} attend votre réponse",
		},
		attachmentsRefused: "Impossible de joindre les fichiers",
		restart: "Redémarrer la session",
		notice: {
			crashed: "L’agent s’est arrêté",
			crashedNamed: "{{name}} s’est arrêté",
			resumeFailed: "Impossible de reprendre la conversation",
			settingsRejected: "Impossible d’appliquer les réglages de l’agent",
			settingsRejectedNamed: "Impossible d’appliquer les réglages de {{name}}",
			serverEnvRejected: "Impossible de démarrer une application",
			notAuthenticated: "Vous n’êtes pas connecté",
			unavailable: "Impossible de joindre l’agent",
			unavailableNamed: "Impossible de joindre {{name}}",
			failed: "Impossible d’envoyer cette demande",
			stopFailed: "Impossible d’arrêter l’agent",
			stopFailedNamed: "Impossible d’arrêter {{name}}",
			dockBadgeFailed:
				"Impossible de mettre à jour le nombre sur l’icône de Kiroshi",
			questionRunFailed: {
				title: "L’exécution de {{name}} a échoué avant votre réponse",
				description:
					"La question est fermée. Envoyez un message pour reprendre.",
			},
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
			describeRefused: {
				title: "Impossible d’enregistrer le nom et la couleur",
				description:
					"{{reason}} L’espace a gardé son nom et sa couleur précédents.",
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
				invitationExpired: {
					title: "Cette invitation a expiré",
					description: "Demandez à l’hôte de vous inviter à nouveau.",
				},
				invitationWithdrawn: {
					title: "Cette invitation a été retirée",
					description:
						"L’hôte l’a annulée. Demandez-lui de vous inviter à nouveau.",
				},
				invitationUsed: {
					title: "Cette invitation a déjà servi",
					description:
						"Une invitation ne s’accepte qu’une fois. Demandez à l’hôte de vous inviter à nouveau.",
				},
				invitationOtherEmail: {
					title: "Cette invitation vise une autre adresse",
					description:
						"Connectez-vous avec l’adresse invitée par l’hôte, puis acceptez-la à nouveau.",
				},
				couldNotAccept: {
					title: "Impossible d’accepter cette invitation",
					description:
						"Le cloud de Kiroshi ne l’a pas prise en compte. Vérifiez votre connexion, puis réessayez.",
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
				waitingForHost: {
					title: "En attente de l’hôte",
					description:
						"Cet espace s’ouvrira dès que son hôte sera en ligne et acceptera cet ordinateur.",
					reasons: {
						relayUnreachable:
							"Impossible de joindre Kiroshi pour ouvrir cet espace. Vérifiez votre connexion.",
						rekeySendFailed:
							"Impossible de demander la clé de cet espace à l’hôte. Vérifiez votre connexion.",
						hostSilent:
							"L’hôte n’a pas encore accepté cet ordinateur. Demandez-lui d’ouvrir Kiroshi sur son ordinateur.",
						socketClosed:
							"La connexion à Kiroshi s’est fermée avant l’ouverture de cet espace. Vérifiez votre connexion.",
						rekeyNotVerified:
							"Impossible de vérifier la clé envoyée par l’hôte pour cet espace. Demandez un nouveau lien à l’hôte.",
						notMember:
							"Kiroshi indique que ce compte n’est pas membre de cet espace. Demandez un nouveau lien à l’hôte.",
						unknownInstance:
							"Kiroshi n’héberge plus cet espace. Demandez à l’hôte de réactiver l’hébergement.",
						deviceKeysUnreadable:
							"Impossible de lire les clés de cet ordinateur. Quittez Kiroshi et rouvrez-le.",
						deviceAwaitingApproval:
							"Cet ordinateur n’est pas encore approuvé. Approuvez-le depuis un autre ordinateur connecté à votre compte.",
						socketUrlFailed:
							"Impossible d’obtenir l’adresse de cet espace auprès de Kiroshi. Quittez Kiroshi et rouvrez-le.",
						rosterMissing:
							"L’hôte n’a pas encore envoyé la liste des membres de cet espace. Demandez-lui d’ouvrir Kiroshi sur son ordinateur.",
						keychainReadFailed:
							"Impossible de lire la clé de cet espace dans le stockage sécurisé de cet ordinateur. Quittez Kiroshi, rouvrez-le et autorisez l’accès si cet ordinateur le demande.",
					},
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
			binaryNotFoundNamed:
				"Impossible de trouver {{name}}. Réinstallez Kiroshi.",
			notAuthenticated:
				"Vous êtes déconnecté de votre abonnement Claude. Connectez-vous à Claude, puis relancez la conversation.",
			notConnected:
				"Votre compte Claude n’est pas connecté. Connectez-vous pour continuer.",
			authCheckFailed:
				"Impossible de vérifier votre connexion ({{detail}}). Redémarrez la session.",
			spawnFailed:
				"Impossible de démarrer l’agent ({{detail}}). Redémarrez la session.",
			spawnFailedNamed:
				"Impossible de démarrer {{name}} ({{detail}}). Redémarrez la session.",
			startupTimeout:
				"L’agent n’a pas répondu en {{timeoutMs}} ms. Redémarrez la session.",
			startupTimeoutNamed:
				"{{name}} n’a pas répondu en {{timeoutMs}} ms. Redémarrez la session.",
			crashed: "L’agent s’est arrêté (code {{code}}). Redémarrez la session.",
			crashedNamed:
				"{{name}} s’est arrêté (code {{code}}). Redémarrez la session.",
			crashedDetail:
				"L’agent s’est arrêté (code {{code}}) : {{detail}}. Redémarrez la session.",
			crashedDetailNamed:
				"{{name}} s’est arrêté (code {{code}}) : {{detail}}. Redémarrez la session.",
			crashedUnknownCode:
				"L’agent s’est arrêté (code inconnu). Redémarrez la session.",
			crashedUnknownCodeNamed:
				"{{name}} s’est arrêté (code inconnu). Redémarrez la session.",
			crashedUnknownCodeDetail:
				"L’agent s’est arrêté (code inconnu) : {{detail}}. Redémarrez la session.",
			crashedUnknownCodeDetailNamed:
				"{{name}} s’est arrêté (code inconnu) : {{detail}}. Redémarrez la session.",
			resumeFailed:
				"L’agent a démarré une nouvelle session. Continuez, vos messages sont toujours là.",
			resumeFailedNamed:
				"{{name}} a démarré une nouvelle session. Continuez, vos messages sont toujours là.",
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
			runLapsedSilent:
				"L’agent ne répondait plus, sa réponse s’est arrêtée. Renvoyez votre message.",
			runLapsedSilentNamed:
				"{{name}} ne répondait plus, sa réponse s’est arrêtée. Renvoyez votre message.",
			runLapsedInterrupt:
				"L’agent n’a pas répondu à l’arrêt, sa réponse s’est arrêtée. Renvoyez votre message.",
			runLapsedInterruptNamed:
				"{{name}} n’a pas répondu à l’arrêt, sa réponse s’est arrêtée. Renvoyez votre message.",
			readFailed:
				"Impossible de charger les messages précédents ({{detail}}). Réessayez.",
			unknownFailure: "Une erreur est survenue ({{detail}}). Réessayez.",
		},
		attachment: {
			megabytes: "{{size}} Mo",
			storage:
				"Impossible d’enregistrer les fichiers ({{failure}}). Joignez-les à nouveau.",
			unknownConversation:
				"Cette conversation n’existe plus. Rouvrez l’agent et joignez-les à nouveau.",
			tooMany:
				"Un message accepte {{limit}} fichiers au maximum, et {{staged}} sont en attente. Retirez-en.",
			tooLarge:
				"{{name}} dépasse la limite de {{limit}} par fichier. Joignez un fichier plus léger.",
			tooLargeTogether:
				"Ces fichiers totalisent {{bytes}}, au-delà de la limite de {{limit}} par message. Retirez-en.",
			unreadable: "Impossible de lire {{name}}. Joignez-le à nouveau.",
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
		unavailable: "Impossible de charger les agents à suggérer. Réessayez.",
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
				"Ce que chaque agent de cette conversation doit garder en tête",
		},
		participants: {
			label: "Dans cette conversation",
			lead: "Meneur",
			promote: "Confier la conduite à {{name}}",
			dismiss: "Retirer {{name}}",
			last: "Une conversation a besoin d’au moins un agent.",
		},
		danger: {
			delete: "Supprimer la conversation",
			description:
				"Ses messages sont supprimés ; ses agents restent dans l’espace. C’est irréversible.",
			confirm: {
				title: "Supprimer {{name}} ?",
			},
			failed: "Impossible de supprimer cette conversation. Réessayez.",
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
				"Créez une routine pour faire travailler un agent selon un horaire ou quand un fichier change.",
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
					"Les missions ouvertes par vos agents dans cet espace apparaissent ici.",
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
				bot: "L’agent",
				reader: "Vous",
				agent: "La session de code",
				github: "GitHub",
			},
			line: {
				opened: "Mission ouverte par {{source}}",
				note: "Note enregistrée par {{source}}",
				agent_asked: "Question envoyée à la session de code par {{source}}",
				answered: "Réponse envoyée à la session de code",
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
			messageAgent: "Écrire à la session de code",
			stopAgent: "Arrêter la session de code",
			answer: "Répondre à la question",
			close: "Fermer",
			reopen: "Rouvrir",
			copied: "{{kind}} copié",
			failed: {
				openPullRequest: "Impossible d’ouvrir la pull request",
				copy: "Impossible de copier dans le presse-papiers",
				stopAgent: "Impossible d’arrêter la session de code",
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
			waiting_bot: "Ouvert par la question de la session de code",
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
				title: "Impossible de lancer l’agent sur sa mission",
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
				label: "Choisir mon premier agent",
				description: "Encore une question, et vous êtes prêt.",
			},
			keepTalking: {
				label: "Continuer à discuter d’abord",
				description: "Posez-moi encore quelques questions. J’attends.",
			},
		},
		arrival: {
			failure: "{{name}} n’a pas pu dire bonjour",
			firstCompanionMissing:
				"Impossible de rencontrer votre premier compagnon. Redémarrez Kiroshi, puis réessayez.",
			unknownCompanion: "le compagnon n’est pas sur cet ordinateur",
		},
		intro: {
			skip: "Passer l’intro",
			back: "Retour",
			next: "Suivant",
			getStarted: "Commencer",
			companions: {
				title: "Des compagnons travaillent avec vous",
				body: "Chaque compagnon a un nom, un métier et sa propre mémoire. Confiez-lui quelque chose et il s’y tient, sur votre ordinateur.",
				atlas: { name: "Atlas", job: "Relit le code" },
				juniper: { name: "Juniper", job: "Tient la documentation" },
				wren: { name: "Wren", job: "Rédige les notes de version" },
			},
			conversations: {
				title: "Des conversations, puis des missions",
				body: "Parlez avec un compagnon ou plusieurs à la fois. Un long travail devient une mission que vous suivez pendant que vous faites autre chose.",
				thread: "Semaine de lancement",
				ask: "Vous pouvez préparer tous les deux la documentation et les notes de version pour vendredi ?",
				reply:
					"C’est parti. Je lance les notes de version en mission pour que vous puissiez suivre.",
				mission: "Notes de version de la 2.4",
				missionDetail: "Mission · Wren · 3 sections sur 5 rédigées",
				status: "En cours",
			},
			tools: {
				title: "Vos outils, là où vous les autorisez",
				body: "Donnez à un compagnon un Dossier où travailler, les Applications qu’il peut utiliser et les Secrets dont il a besoin. Rien au-delà de ce que vous lui confiez.",
				folders: "Dossiers",
				foldersDetail: "~/Code/orbit-web",
				applications: "Applications",
				applicationsDetail: "GitHub, Linear, Notion",
				secrets: "Secrets",
				secretsDetail: "LINEAR_API_KEY",
			},
		},
		connect: {
			foundIn: "{{plan}} · trouvé dans Claude Code",
			provider: {
				title: "Connecter le fournisseur de modèle",
				body: "Vos compagnons ont besoin d’un modèle pour réfléchir. Utilisez votre abonnement Claude, ou une clé.",
			},
			browser: {
				body: "Votre navigateur a ouvert claude.ai. Connectez-vous avec votre abonnement Pro ou Max.",
				waiting: "En attente de votre connexion, dans votre navigateur…",
				checking: "Vérification du code avec Claude…",
				placeholder: "Code de Claude",
				reopen: "Rouvrir la page de connexion",
			},
			continue: "Continuer",
			connecting: "Connexion…",
			failed: {
				cancelled:
					"La connexion a été annulée. Réessayez, ou collez une clé à la place.",
				timedOut:
					"La connexion a expiré. Réessayez, ou collez une clé à la place.",
				linkRefused:
					"Le lien de connexion a été refusé. Réessayez, ou collez une clé à la place.",
			},
			agentMissing: {
				title: "Impossible de trouver l’agent",
				body: "Kiroshi ne peut pas démarrer sans lui. Réinstallez Kiroshi, puis rouvrez-le.",
				download: "Télécharger Kiroshi à nouveau",
			},
			key: {
				body: "Paiement à l’usage, sans connexion. Créez une clé dans la console Anthropic.",
			},
		},
	},
} as const

export { chat }
