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
		danger: "Zone sensible",
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
				hint: "Elles rejoignent l’espace en se connectant à Kiroshi avec cet e-mail.",
				refusal: {
					invited: "{{email}} est déjà invité.",
					self: "C’est votre propre compte.",
					malformed: "Saisissez une adresse e-mail, comme sam@example.com.",
				},
				notShared: "Activez Partager {{name}} pour inviter quelqu’un.",
			},
			status: {
				host: "Hôte",
				joined: "A rejoint",
				pending: "En attente",
			},
			remove: "Retirer",
			removeLabel: "Retirer {{name}}",
			confirm: {
				title: "Retirer {{name}} de {{space}} ?",
				description:
					"{{name}} perd l’accès immédiatement. Vous pourrez inviter {{name}} de nouveau.",
			},
			withdrawn: "Invitation à {{email}} retirée",
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
