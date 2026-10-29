const settings = {
	breadcrumb: {
		title: "Réglages",
	},
	screen: {
		back: "Retour aux conversations",
		backToAgents: "Retour aux agents",
		backToSettings: "Retour à vos réglages",
		menu: "Réglages",
		subtitle: {
			space: "Réglages de l’espace",
			agent: "Réglages de l’agent",
			conversation: "Réglages de la conversation",
			user: "Réglages de l’utilisateur",
			invitation: "Invitation",
		},
		group: {
			settings: "Réglages",
			subjectSettings: "Réglages",
			spaces: "Espaces",
		},
		space: {
			current: "Ouvert",
			invitation: "Invitation",
			left: {
				title: "Vous avez quitté {{name}}",
				description:
					"Demandez une nouvelle invitation à {{host}} pour le rejoindre.",
			},
		},
	},
	rail: {
		account: "Compte",
		space: "Espace",
		members: "Membres",
		agents: "Agents",
		secrets: "Secrets",
		appearance: "Apparence",
		notifications: "Notifications",
		language: "Langue",
		skills: "Compétences",
		applications: "Applications",
		history: "Historique",
		diagnostics: "Diagnostic",
		danger: "Zone sensible",
		about: "À propos",
		invitation: "Invitation",
	},
	account: {
		signedOut: {
			title: "Se connecter à Kiroshi",
			body: "Hébergez un espace pour des personnes hors de votre réseau, ou rejoignez celui qu’on héberge pour vous.",
			signIn: "Se connecter avec votre navigateur",
			caption:
				"Votre compte, votre offre et vos ordinateurs connectés se trouvent sur kiroshi.app.",
		},
		waiting: {
			label: "En attente de votre navigateur…",
			cancel: "Annuler",
			caption:
				"Terminez dans votre navigateur. Kiroshi prend le relais ensuite.",
			browserDidNotOpen: "Le navigateur ne s’est pas ouvert ?",
			copySignInLink: "Copier le lien de connexion",
		},
		signedIn: {
			plan: {
				beta: "Gratuit pendant la bêta",
				pro: "Pro",
				free: "Gratuit",
			},
			manage: "Gérer le compte",
			signOut: "Se déconnecter",
		},
		onboarding: {
			body: "Facultatif. Hébergez un espace pour des personnes hors de votre réseau, ou rejoignez celui qu’on héberge pour vous.",
			skip: "Passer pour l’instant",
			signedIn: {
				title: "Vous êtes connecté",
				body: "Vos conversations restent sur votre ordinateur. Le compte vous relie seulement aux espaces et aux appareils au-delà de votre réseau.",
				continue: "Continuer",
			},
		},
		signedOutFromTheSite: {
			title: "Vous avez été déconnecté sur kiroshi.app",
			description:
				"Cet ordinateur a été déconnecté depuis Appareils. Reconnectez-vous pour utiliser vos espaces au-delà de votre réseau.",
		},
		deviceRevoked: {
			title:
				"Cet ordinateur est maintenant connecté à un autre compte Kiroshi.",
			description: "Reconnectez-vous pour l’utiliser ici.",
		},
		unreachable: {
			title: "Impossible de joindre Kiroshi",
			description: "Vérifiez votre connexion et reconnectez-vous.",
		},
		failed: {
			cancelled: "Connexion annulée",
			timedOut: "La connexion a pris trop de temps",
			description:
				"Appuyez sur Se connecter avec votre navigateur pour réessayer.",
		},
		readFailed: "Impossible de lire votre compte Kiroshi",
		signInFailed: "Impossible de lancer la connexion à Kiroshi",
		cancelFailed: "Impossible d’annuler la connexion",
		signInLinkCopied: "Lien de connexion copié",
		copySignInLinkFailed: "Impossible de copier le lien de connexion",
		manageAccountFailed: "Impossible d’ouvrir votre compte sur kiroshi.app",
		signOutFailed: "Impossible de se déconnecter de Kiroshi",
		devices: {
			title: "Vos appareils",
			thisDevice: "Cet appareil",
			activeNow: "Actif maintenant",
			otherDevices: "Autres appareils",
			remove: "Retirer",
			empty:
				"Aucun autre appareil ne lit vos espaces. Pour en ajouter un, connectez-vous dessus avec {{email}}, puis approuvez-le ici.",
			confirm: {
				title: "Retirer {{device}} ?",
				body: "Il sera déconnecté et ne lira plus vos espaces.",
				remove: "Retirer",
				removing: "Retrait…",
				cancel: "Annuler",
				failed:
					"Impossible de retirer {{device}}. Vérifiez votre connexion et réessayez.",
			},
			removed: {
				title: "{{device}} a été déconnecté",
				description: "Il ne lit plus vos espaces.",
			},
		},
	},
	plugin: {
		author: {
			bot: "Un agent",
		},
	},
	notifications: {
		label: "Me prévenir quand",
		event: {
			question: {
				label: "Un agent pose une question",
				description: "Il attend votre réponse pour continuer.",
			},
			permission: {
				label: "Un agent demande une autorisation",
				description:
					"Il attend votre autorisation pour lancer une commande ou modifier un fichier.",
			},
			turn: {
				label: "Un agent termine son tour",
				description: "Il a fini et attend votre prochain message.",
			},
		},
		sound: {
			label: "Son",
			switch: "Jouer un son",
			description:
				"Kiroshi joue un bref carillon à chaque notification, même quand votre système l’affiche en silence.",
		},
	},
	language: {
		label: "Langue",
		machine: "Système",
	},
	appearance: {
		scheme: {
			label: "Thème",
			option: {
				light: "Clair",
				dark: "Sombre",
				system: "Système",
			},
		},
	},
	diagnostics: {
		label: "Diagnostic",
		description:
			"Copier le diagnostic place dans le presse-papiers les détails de l’ordinateur où Kiroshi tourne et ceux de l’agent, prêts pour un signalement de bug.",
		copy: "Copier le diagnostic",
		copyFailed: "Impossible de copier le diagnostic. Réessayez.",
		reveal: "Afficher le journal",
		revealFailed: "Impossible d’afficher le journal. Réessayez.",
		clear: {
			action: "Vider le journal",
			title: "Vider le journal ?",
			description:
				"Chaque ligne que Kiroshi a écrite dans son journal sur cet ordinateur est supprimée. C’est irréversible.",
			failed: "Impossible de vider le journal. Réessayez.",
		},
	},
	about: {
		updates: {
			label: "Mises à jour",
		},
		version: "Kiroshi {{version}}",
		status: {
			upToDate: "À jour · Vérifié {{when}}",
			checking: "Recherche de mises à jour…",
			available: "Kiroshi {{version}} est disponible.",
			downloading:
				"Téléchargement de {{version}}. Vous pouvez continuer à travailler en attendant.",
			ready:
				"La {{version}} est prête. Redémarrez Kiroshi pour terminer la mise à jour.",
			readyHeld: "La {{version}} est prête.",
			running_one: "{{count}} agent tourne encore. Arrêtez-le pour redémarrer.",
			running_many:
				"{{count}} agents tournent encore. Arrêtez-les pour redémarrer.",
			running_other:
				"{{count}} agents tournent encore. Arrêtez-les pour redémarrer.",
			failed: "Impossible de télécharger la {{version}}.",
			failedHint: "Vérifiez votre connexion, puis téléchargez-la à nouveau.",
		},
		action: {
			check: "Vérifier les mises à jour",
			download: "Télécharger la mise à jour",
			restart: "Redémarrer maintenant",
			downloadAgain: "Télécharger à nouveau",
		},
		channel: {
			label: "Canal de version",
			description:
				"La bêta reçoit les nouveautés plus tôt, avec quelques aspérités.",
			option: {
				stable: "Stable",
				beta: "Bêta",
			},
		},
		betaNotice: {
			title: "Les versions bêta sont moins testées",
			description:
				"De retour sur Stable, vous gardez cette bêta jusqu’à ce que Stable la dépasse.",
		},
		whatsNew: {
			label: "Montrer les nouveautés après une mise à jour",
			description:
				"La première fois que Kiroshi s’ouvre sur une nouvelle version, il montre ce qui a changé.",
		},
		gettingStarted: {
			label: "Premiers pas",
			importFromClaudeCode: {
				label: "Importer depuis Claude Code",
				description:
					"Récupère les agents, les compétences et CLAUDE.md depuis ~/.claude. Vous choisissez ce qui arrive.",
				nothingToImport:
					"Rien à récupérer : il n’y a pas de dossier ~/.claude sur cet ordinateur.",
			},
			replayOnboarding: {
				label: "Revoir l’accueil",
				description:
					"Montre de nouveau les écrans d’accueil. Vos agents, vos conversations et votre compte restent tels quels.",
			},
		},
		kiroshi: {
			label: "Kiroshi",
			whatsNew: "Nouveautés de la {{version}}",
			releaseNotes: "Notes de version",
			releaseNotesName: "Notes de version, s’ouvre dans votre navigateur",
		},
	},
	space: {
		untitled: "Espace sans nom",
		standing: {
			yours: "À vous · non partagé",
			yoursShared: "À vous · partagé",
			joined: "Rejoint · hébergé par {{host}}",
			joinedNotConnected: "Rejoint · hébergé par {{host}} · Non connecté",
			invitation: "Invitation de {{email}} · Expire le {{date}}",
		},
		open: "Ouvrir",
		notShared: {
			title: "Pas encore partagé",
			description:
				"Partagez {{name}} pour inviter des personnes. Sa suppression se trouve dans Zone sensible.",
			share: "Partager",
		},
		name: {
			label: "Nom",
			placeholder: "Sans nom",
		},
		host: {
			label: "Hôte",
			hint: "Cet espace vit sur un autre Kiroshi.",
		},
		colour: {
			label: "Couleur",
			none: "Aucune couleur",
			hint: "N'importe quelle teinte. La clarté et l'intensité viennent de la recette, pour rester lisible en clair comme en sombre.",
		},
		transfer: {
			export: "Exporter cet espace",
			import: "Importer un espace",
			exported: "{{name}} exporté",
			imported: "{{name}} importé",
			exportFailed: "Impossible d’exporter {{name}}",
			importFailed: "Impossible d’importer l’espace",
			retry: "Réessayer",
			reason: {
				unsupportedArchive:
					"Cette archive est au format version {{found}}, cette app lit la version {{supported}}.",
				unversionedArchive:
					"Cette archive ne porte aucune version de format, cette app lit la version {{supported}}.",
				unreadableArchive: "L’archive n’a pas pu être lue.",
				unwritableArchive: "L’archive n’a pas pu être écrite.",
				generic: "Une erreur est survenue, rien n’a été modifié.",
			},
		},
		agents: {
			title: "Agents",
			caption:
				"Tous les agents de {{space}}. Choisissez-en un pour changer sa façon de travailler.",
			create: "Créer un agent",
			empty: "Aucun agent dans cet espace pour l’instant.",
			counts: "{{skills}} · {{applications}}",
			countsUnreadable:
				"Impossible de lire les compétences et les applications des agents. Rouvrez Agents pour réessayer.",
			skills_zero: "aucune compétence",
			skills_one: "{{count}} compétence",
			skills_many: "{{count}} compétences",
			skills_other: "{{count}} compétences",
			applications_zero: "aucune application",
			applications_one: "{{count}} application",
			applications_many: "{{count}} applications",
			applications_other: "{{count}} applications",
		},
		members: {
			invite: {
				label: "Inviter des personnes",
				placeholder: "E-mail",
				action: "Inviter",
				hint: "Kiroshi leur envoie une invitation par e-mail. Elle sert une fois, pendant 7 jours.",
				refusal: {
					invited: "{{email}} est déjà invité.",
					self: "C’est votre propre compte.",
					malformed: "Saisissez une adresse e-mail, comme sam@example.com.",
				},
				notShared: "Activez Partager {{name}} pour inviter quelqu’un.",
				signedOut: "Connectez-vous à Kiroshi pour inviter quelqu’un.",
				hostOffline:
					"{{name}} est hors ligne. Vous pourrez inviter des personnes quand l’ordinateur de {{host}} sera de retour.",
			},
			invitations: "Invitations",
			list: "Membres",
			status: {
				host: "Hôte",
				expired: "Expirée",
			},
			pending_one: "Invité · expire dans 1 jour",
			pending_many: "Invité · expire dans {{count}} jours",
			pending_other: "Invité · expire dans {{count}} jours",
			expired: "Envoyée le {{date}}, non utilisée",
			you: "{{name}} (vous)",
			remove: "Retirer",
			removeLabel: "Retirer {{name}}",
			withdrawLabel: "Retirer l’invitation à {{email}}",
			inviteAgainLabel: "Inviter {{email}} de nouveau",
			needsInvitation: "Doit être invité de nouveau",
			inviteMemberAgain: "Inviter de nouveau",
			invitedAgainFailure: {
				listed: {
					title: "Invitation envoyée à {{email}}",
					description:
						"La liste des membres ne s’est pas actualisée. Elle affiche l’invitation d’ici quelques secondes.",
				},
				removed: {
					title:
						"{{name}} a été retiré, l’invitation à {{email}} n’est pas partie",
					description:
						"Saisissez cette adresse sous Inviter des personnes et sélectionnez Inviter.",
				},
				generic: {
					title: "Impossible d’inviter {{name}} de nouveau",
					description: "Rien n’a changé, réessayez.",
				},
			},
			confirm: {
				title: "Retirer {{name}} de {{space}} ?",
				description:
					"{{name}} perd l’accès immédiatement. Vous pourrez inviter {{name}} de nouveau.",
			},
			sent: "Invitation envoyée à {{email}}",
			sentDescription: "Elle sert une fois, jusqu’au {{date}}.",
			withdrawn: "Invitation à {{email}} retirée",
			withdrawnDescription: "Le lien de leur e-mail ne fonctionne plus.",
			failure: {
				invite: {
					notHosting:
						"{{space}} n’est plus hébergé. Activez l’hébergement pour inviter {{email}}.",
					limitReached:
						"{{space}} ne peut pas accueillir plus de membres. Retirez quelqu’un pour inviter {{email}}.",
					notOwner:
						"Ce compte n’héberge pas {{space}}. Connectez-vous avec le compte qui l’héberge pour inviter {{email}}.",
					needsSignIn:
						"Impossible d’inviter {{email}}, vous êtes déconnecté. Connectez-vous à Kiroshi et invitez cette personne de nouveau.",
					unreachable:
						"Impossible de joindre Kiroshi pour inviter {{email}}. Vérifiez votre connexion et réessayez.",
					offline:
						"Impossible d’inviter {{email}}, cet ordinateur est hors ligne. Connectez-vous à Internet et réessayez.",
					timedOut:
						"Kiroshi a mis trop de temps à répondre, {{email}} n’a pas été invité. Réessayez dans un instant.",
					unsent:
						"L’invitation à {{email}} n’est pas partie de cet ordinateur. Vérifiez votre connexion et réessayez.",
					relayStatus:
						"Kiroshi a répondu par l’erreur {{status}}, {{email}} n’a pas été invité. Réessayez dans un instant.",
					relayConflict:
						"Kiroshi a refusé d’inviter {{email}} ({{code}}). Vérifiez la liste des membres, puis réessayez.",
					unreadableConflict:
						"Kiroshi a refusé d’inviter {{email}} sans dire pourquoi. Vérifiez la liste des membres, puis réessayez.",
					unreadableList:
						"Impossible de lire la liste des membres envoyée par Kiroshi, {{email}} n’a pas été invité. Réessayez dans un instant.",
					listNotReadBack:
						"L’invitation à {{email}} a été envoyée, mais la liste des membres ne s’est pas actualisée. Rouvrez les réglages de cet espace pour la voir.",
					generic:
						"Impossible d’inviter {{email}}. Rien n’a changé, réessayez.",
				},
				withdraw: {
					gone: "L’invitation à {{email}} n’existe déjà plus. Il n’y a rien à retirer.",
					joined:
						"{{name}} a déjà rejoint l’espace. Sélectionnez Retirer pour l’exclure de {{space}}.",
					notHosting:
						"{{space}} n’est plus hébergé. Activez l’hébergement pour retirer l’invitation à {{email}}.",
					notOwner:
						"Ce compte n’héberge pas {{space}}. Connectez-vous avec le compte qui l’héberge pour retirer l’invitation à {{email}}.",
					needsSignIn:
						"Impossible de retirer l’invitation à {{email}}, vous êtes déconnecté. Connectez-vous à Kiroshi et réessayez.",
					unreachable:
						"Impossible de joindre Kiroshi pour retirer l’invitation à {{email}}. Vérifiez votre connexion et réessayez.",
					generic:
						"Impossible de retirer l’invitation à {{email}}. Rien n’a changé, réessayez.",
				},
				remove: {
					gone: "{{name}} n’est plus membre. Il n’y a rien à retirer.",
					pending:
						"{{name}} n’a pas encore rejoint l’espace. Sélectionnez Retirer de nouveau pour retirer l’invitation.",
					host: "Vous hébergez {{space}}, vous ne pouvez donc pas être retiré. Désactivez plutôt l’hébergement.",
					hostedBy:
						"{{name}} héberge {{space}} et ne peut pas être retiré. Il n’y a rien à faire.",
					notHosting:
						"{{space}} n’est plus hébergé. Activez l’hébergement pour retirer {{name}}.",
					notOwner:
						"Ce compte n’héberge pas {{space}}. Connectez-vous avec le compte qui l’héberge pour retirer {{name}}.",
					needsSignIn:
						"Impossible de retirer {{name}}, vous êtes déconnecté. Connectez-vous à Kiroshi et réessayez.",
					unreachable:
						"Impossible de joindre Kiroshi pour retirer {{name}}. Vérifiez votre connexion et réessayez.",
					generic:
						"Impossible de retirer {{name}}. Rien n’a changé, réessayez.",
				},
			},
		},
		hosting: {
			label: "Partager {{name}}",
			description:
				"Invitez des personnes qui ne sont pas sur votre réseau. {{name}} tourne sur cet ordinateur, elles y accèdent donc tant que Kiroshi est ouvert ici.",
			signedOut:
				"Connectez-vous à Kiroshi pour inviter des personnes qui ne sont pas sur votre réseau.",
			signIn: "Se connecter",
			connecting: "Connexion…",
			online: "En ligne",
			failed: {
				title: "Impossible d’héberger {{name}}",
				description: "Vérifiez votre connexion et réactivez-le.",
				reasons: {
					notOwner:
						"Un autre compte héberge cet espace. Connectez-vous avec ce compte, ou réactivez-le pour l’héberger depuis celui-ci.",
					deviceAwaitingApproval:
						"Cet ordinateur n’est pas encore approuvé. Approuvez-le sur un appareil que vous utilisez déjà, puis réactivez-le.",
					deviceRefused:
						"Quelqu’un a choisi Pas moi sur un autre appareil, cet ordinateur a donc été déconnecté. Reconnectez-vous et approuvez-le sur un appareil que vous utilisez déjà.",
					keysMissing:
						"Cet ordinateur n’a pas pu lire les clés de cet espace. Quittez Kiroshi, rouvrez-le, puis réactivez l’hébergement.",
					instanceGone:
						"Cet espace n’existe plus sur Kiroshi. Réactivez-le pour l’héberger depuis cet ordinateur.",
					takenOver:
						"Un autre ordinateur héberge maintenant cet espace. Réactivez-le pour l’héberger depuis celui-ci.",
					streamClosed:
						"Cet ordinateur a arrêté d’héberger cet espace. Réactivez l’hébergement.",
					unknown: "Vérifiez votre connexion et réactivez-le.",
				},
			},
			stopFailed: {
				title: "Impossible d’arrêter d’héberger {{name}}",
				description: "Désactivez-le de nouveau.",
			},
		},
		danger: {
			delete: "Supprimer l’espace",
			description:
				"Les agents présents uniquement dans cet espace sont supprimés avec lui. C’est irréversible.",
			last: "Vous ne pouvez pas supprimer votre dernier espace.",
			confirm: {
				title: "Supprimer {{name}} ?",
			},
		},
	},
} as const

export { settings }
