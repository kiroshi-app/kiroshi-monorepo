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
	notice: {
		label: "Avis",
		close: "Fermer l’avis",
		copy: "Copier",
		copied: "Copié",
		copyFailed:
			"Impossible de copier le rapport. Appuyez à nouveau sur Copier.",
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
			error: "Mise à jour échouée, télécharger à nouveau",
			retry: "Télécharger à nouveau la mise à jour",
		},
		panel: {
			title: "Mise à jour prête",
			version: "Version {{version}}",
			botsBusy_one:
				"{{count}} compagnon tourne encore. Arrêtez-le pour redémarrer.",
			botsBusy_many:
				"{{count}} compagnons tournent encore. Arrêtez-les pour redémarrer.",
			botsBusy_other:
				"{{count}} compagnons tournent encore. Arrêtez-les pour redémarrer.",
			restart: "Redémarrer maintenant",
			postpone: "Me le rappeler plus tard",
			releaseNotes: "Lire les notes de version complètes dans votre navigateur",
			notes: "Notes de version",
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
