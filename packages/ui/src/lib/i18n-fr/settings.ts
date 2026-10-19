const settings = {
	breadcrumb: {
		title: "Réglages",
	},
	rail: {
		account: "Compte",
		space: "Espace",
		members: "Membres",
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
			caption:
				"Votre nom, votre offre et vos ordinateurs connectés se gèrent sur kiroshi.app.",
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
			description:
				"Chaque appareil listé ici lit vos espaces. Retirez celui que vous n’utilisez plus.",
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
			bot: "Un compagnon",
		},
	},
	notifications: {
		label: "Me prévenir quand",
		event: {
			question: {
				label: "Un compagnon pose une question",
				description: "Il attend votre réponse pour continuer.",
			},
			permission: {
				label: "Un compagnon demande une autorisation",
				description:
					"Il attend votre autorisation pour lancer une commande ou modifier un fichier.",
			},
			turn: {
				label: "Un compagnon termine son tour",
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
			running_one:
				"{{count}} compagnon tourne encore. Arrêtez-le pour redémarrer.",
			running_many:
				"{{count}} compagnons tournent encore. Arrêtez-les pour redémarrer.",
			running_other:
				"{{count}} compagnons tournent encore. Arrêtez-les pour redémarrer.",
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
		kiroshi: {
			label: "Kiroshi",
			whatsNew: "Nouveautés de la {{version}}",
			releaseNotes: "Notes de version",
			releaseNotesName: "Notes de version, s’ouvre dans votre navigateur",
		},
	},
	space: {
		untitled: "Espace sans nom",
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
			},
			stopFailed: {
				title: "Impossible d’arrêter d’héberger {{name}}",
				description: "Désactivez-le de nouveau.",
			},
		},
		danger: {
			delete: "Supprimer l’espace",
			description:
				"Les compagnons présents uniquement dans cet espace sont supprimés avec lui. C’est irréversible.",
			last: "Vous ne pouvez pas supprimer votre dernier espace.",
			confirm: {
				title: "Supprimer {{name}} ?",
			},
		},
	},
} as const

export { settings }
