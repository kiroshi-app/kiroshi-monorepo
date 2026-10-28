const common = {
	boot: {
		status: "Démarrage de Kiroshi",
	},
	spaces: {
		unavailable: {
			title: "Impossible de charger vos espaces",
			description: "Vos compagnons sont toujours là.",
		},
		leave: {
			title: "Quitter {{name}} ?",
			description:
				"Rien n’est supprimé sur l’hôte. Vous pourrez le rejoindre à nouveau avec une nouvelle invitation.",
			action: "Quitter l’espace",
		},
	},
	skipLink: "Passer à la conversation",
	companion: {
		unnamed: "Compagnon",
	},
	dialog: {
		close: "Fermer",
	},
	confirm: {
		cancel: "Annuler",
	},
	sidebar: {
		label: "Barre latérale",
		toggle: "Afficher ou masquer la barre latérale",
		close: "Fermer la barre latérale",
		resize: "Redimensionner la barre latérale",
	},
	windowControls: {
		minimize: "Réduire",
		maximize: "Agrandir",
		restore: "Restaurer",
		close: "Fermer",
		failure: {
			minimize: "Impossible de réduire Kiroshi.",
			maximize: "Impossible d’agrandir ou de restaurer Kiroshi.",
			close: "Impossible de fermer Kiroshi.",
			state: "Impossible de savoir si Kiroshi est agrandi.",
			snap: "Les dispositions d’ancrage sont indisponibles sur le bouton Agrandir.",
			pointer: "Le bouton Agrandir ne peut pas afficher le survol ni l’appui.",
		},
	},
	titleBar: {
		tabs: "Onglets",
		back: "Précédent",
		forward: "Suivant",
		newTab: "Nouvel onglet",
		closeTab: "Fermer l’onglet",
		closeTabDescription: "Ferme {{title}}",
		pinTab: "Épingler l’onglet",
		unpinTab: "Désépingler l’onglet",
		closeOtherTabs: "Fermer les autres onglets",
		duplicateTab: "Dupliquer l’onglet",
		reopenClosedTab: "Rouvrir le dernier onglet fermé",
		moveTabToNewWindow: "Déplacer dans une nouvelle fenêtre",
		moveTabFailed: {
			title: "Impossible d’ouvrir une nouvelle fenêtre",
			description:
				"L’onglet est resté ici. Choisissez Déplacer dans une nouvelle fenêtre dans le menu de l’onglet pour réessayer.",
			descriptionWithReason:
				"L’onglet est resté ici ({{reason}}). Choisissez Déplacer dans une nouvelle fenêtre dans le menu de l’onglet pour réessayer.",
		},
		reopenWindowFailed: {
			title: "Impossible de rouvrir une fenêtre",
			description:
				"Ses onglets ont été fermés. Rouvrez-les depuis la barre latérale.",
			descriptionWithReason:
				"Ses onglets ont été fermés ({{reason}}). Rouvrez-les depuis la barre latérale.",
		},
		pinTabShortcut: "Ctrl⇧P",
		newTabShortcut: "⌘T",
		reopenClosedTabShortcut: "⌘⇧T",
		closeTabShortcut: "⌘W",
		closeOtherTabsShortcut: "⌘⌥W",
		more: "{{count}} de plus",
		tabNeedsYou: "{{title}}, vous attend",
		tabMoved: "{{title}} déplacé en position {{position}} sur {{count}}",
	},
	notice: {
		label: "Avis",
		close: "Fermer l’avis",
		copy: "Copier",
		copied: "Copié",
		copyFailed:
			"Impossible de copier le rapport. Appuyez à nouveau sur Copier.",
	},
	devices: {
		approval: {
			title: "{{device}} veut utiliser votre compte",
			body: "Si c’est le vôtre, approuvez-le et il lira vos espaces. Sinon, choisissez Pas moi et il sera déconnecté.",
			notMe: "Pas moi",
			approve: "Approuver",
			approving: "Approbation…",
			retry: "Réessayer",
			failed:
				"Impossible d’approuver {{device}}. Vérifiez votre connexion et réessayez.",
			approved: {
				title: "{{device}} est approuvé",
				description:
					"Il lit vos espaces maintenant. Retirez-le quand vous voulez dans Vos appareils.",
			},
			rejected: {
				title: "{{device}} a été déconnecté",
				description: "Il n’a jamais lu vos espaces.",
			},
		},
		newDevice: {
			thisDevice: "Cet appareil",
			noOtherDevice: "Je n’ai pas d’autre appareil",
			signOut: "Se déconnecter",
			waiting: {
				title:
					"Approuvez cet appareil depuis un appareil que vous utilisez déjà",
				body: "Ouvrez Kiroshi sur un appareil qui utilise {{email}} et approuvez celui-ci.",
				status: "En attente d’approbation…",
			},
			code: {
				title: "Consultez vos e-mails",
				body: "Nous avons envoyé un code à 6 chiffres à {{email}}. Saisissez-le pour approuver cet ordinateur. Il ne sert qu’une fois, pendant 5 minutes.",
				label: "Code à 6 chiffres",
				approve: "Approuver cet ordinateur",
				resend: "Envoyer un nouveau code",
			},
			expired: {
				title: "La demande a expiré",
				body: "Personne n’a approuvé cet appareil à temps. Redemandez, puis approuvez-le sur un appareil que vous utilisez déjà.",
				askAgain: "Redemander",
			},
			rejected: {
				title: "Cet appareil n’a pas été approuvé",
				body: "Une personne utilisant {{email}} a indiqué qu’il n’était pas à elle, il a donc été déconnecté.",
				backToSignIn: "Retour à la connexion",
			},
		},
	},
	notification: {
		question: "Vous a posé une question",
		approval: "Demande votre autorisation",
		finishedTurn: "A terminé son tour",
		spoke: "{{name}} a dit quelque chose",
		mission: {
			question: "Vous a posé une question sur {{ticket}}",
			waiting_human: "A besoin de vous sur {{ticket}}",
			ready_to_merge: "{{ticket}} est prête à fusionner",
		},
		failure: {
			clicks:
				"Les notifications n’ouvriront plus leur conversation. Redémarrez Kiroshi pour corriger.",
			focus:
				"Des notifications peuvent s’afficher pendant que vous êtes dans Kiroshi. Redémarrez Kiroshi pour corriger.",
			reveal:
				"Impossible de mettre Kiroshi au premier plan. Basculez-y vous-même.",
			send: "Impossible d’afficher une notification. Vérifiez l’autorisation de notification de Kiroshi.",
		},
	},
	update: {
		badge: {
			available: "Télécharger la mise à jour",
			downloading: "Téléchargement de la mise à jour",
			ready: "Redémarrer pour mettre à jour",
			readyVersion: "Redémarrer pour passer à la version {{version}}",
			botsBusy_one:
				"{{count}} compagnon tourne encore. Arrêtez-le pour redémarrer.",
			botsBusy_many:
				"{{count}} compagnons tournent encore. Arrêtez-les pour redémarrer.",
			botsBusy_other:
				"{{count}} compagnons tournent encore. Arrêtez-les pour redémarrer.",
			error: "Mise à jour échouée, télécharger à nouveau",
			retry: "Télécharger à nouveau la mise à jour",
		},
	},
	whatsNew: {
		firstLaunch: {
			eyebrow: "Nouveautés de la version {{version}}",
			legend: "Aussi dans cette mise à jour",
			dismiss: "Compris",
		},
		fromAbout: {
			eyebrow: "Version {{version}}",
			legend: "Aussi dans cette version",
			dismiss: "Fermer",
		},
		beta: "Bêta",
		releaseNotes: "Notes de version",
	},
} as const

export { common }
