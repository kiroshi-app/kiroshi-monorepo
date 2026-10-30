const common = {
	boot: {
		status: "Démarrage de Kiroshi",
	},
	spaces: {
		unavailable: {
			title: "Impossible de charger vos espaces",
			description: "Vos agents sont toujours là.",
		},
		leave: {
			title: "Quitter {{name}} ?",
			description:
				"Rien n’est supprimé sur l’hôte. Vous pourrez le rejoindre à nouveau avec une nouvelle invitation.",
			action: "Quitter l’espace",
		},
	},
	skipLink: "Passer à la conversation",
	agent: {
		unnamed: "Agent",
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
		closeTabNamed: "Fermer {{title}}",
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
		redockTabFailed: {
			title: "Impossible de déplacer l’onglet",
			description:
				"L’onglet est resté ici. Faites-le de nouveau glisser vers l’autre fenêtre.",
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
	claudeImport: {
		listLabel: "Votre configuration Claude Code",
		select: {
			title: "Récupérez votre configuration Claude Code",
			body: "Trouvé dans ~/.claude sur votre ordinateur. Tout est sélectionné ; décochez ce que vous préférez laisser.",
			bodyMany:
				"{{count}} agents et plus trouvés dans ~/.claude. Tout est sélectionné ; décochez ce que vous préférez laisser.",
			nothingSelected:
				"Rien n’est sélectionné. Cochez ce que vous voulez récupérer, ou passez cette étape.",
			namesTaken: {
				one: "Un nom est déjà pris dans Kiroshi. Il arrive avec un numéro ; rien n’est remplacé.",
				two: "Deux noms sont déjà pris dans Kiroshi. Ils arrivent avec un numéro ; rien n’est remplacé.",
				other:
					"{{count}} noms sont déjà pris dans Kiroshi. Ils arrivent avec un numéro ; rien n’est remplacé.",
			},
			import: "Importer",
			importItems_one: "Importer {{count}} élément",
			importItems_many: "Importer {{count}} éléments",
			importItems_other: "Importer {{count}} éléments",
			importCompanions_one: "Importer {{count}} agent",
			importCompanions_many: "Importer {{count}} agents",
			importCompanions_other: "Importer {{count}} agents",
			skip: "Passer pour l’instant",
			notNow: "Pas maintenant",
		},
		fromSettings: {
			title: "Importer depuis Claude Code",
			body: "Trouvé dans ~/.claude. Ce qui est déjà dans Kiroshi reste tel quel ; seul ce qui est nouveau est sélectionné.",
			cancel: "Annuler",
		},
		importing: {
			title: "Récupération de votre configuration",
			body: "{{done}} sur {{count}} terminés. Cela prend quelques secondes.",
			action: "Import en cours…",
		},
		done: {
			title: "Votre configuration est là",
			companions_one: "{{companions}} est prêt.",
			companions_many: "{{companions}} sont prêts.",
			companions_other: "{{companions}} sont prêts.",
			companionsWith_one: "{{companions}} est prêt, avec {{extras}}.",
			companionsWith_many: "{{companions}} sont prêts, avec {{extras}}.",
			companionsWith_other: "{{companions}} sont prêts, avec {{extras}}.",
			instructions: "votre CLAUDE.md",
			instructionsAndSkills_one:
				"Votre CLAUDE.md et {{count}} compétence sont prêts.",
			instructionsAndSkills_many:
				"Votre CLAUDE.md et {{count}} compétences sont prêts.",
			instructionsAndSkills_other:
				"Votre CLAUDE.md et {{count}} compétences sont prêts.",
			onlyInstructions: "Votre CLAUDE.md est prêt.",
			onlySkills_one: "{{count}} compétence est prête.",
			onlySkills_many: "{{count}} compétences sont prêtes.",
			onlySkills_other: "{{count}} compétences sont prêtes.",
			continue: "Continuer",
		},
		landing: {
			companions_one: "Tout est prêt. {{companions}} vient de Claude Code.",
			companions_many: "Tout est prêt. {{companions}} viennent de Claude Code.",
			companions_other:
				"Tout est prêt. {{companions}} viennent de Claude Code.",
			companionsWith_one:
				"Tout est prêt. {{companions}} vient de Claude Code, avec {{extras}}.",
			companionsWith_many:
				"Tout est prêt. {{companions}} viennent de Claude Code, avec {{extras}}.",
			companionsWith_other:
				"Tout est prêt. {{companions}} viennent de Claude Code, avec {{extras}}.",
			extras: "Tout est prêt, avec {{extras}} de Claude Code.",
		},
		partlyFailed: {
			title: "L’essentiel de votre configuration est là",
			body: "La compétence {{name}} n’a pas été récupérée. Réessayez, ou ajoutez-la plus tard depuis les Réglages.",
			bodyNamed:
				"{{name}} n’a pas été récupéré. Réessayez, ou ajoutez-le plus tard depuis les Réglages.",
			retry: "Réessayer {{name}}",
		},
		unreadable: {
			title: "Impossible de lire ~/.claude",
			body: "Kiroshi n’a pas eu le droit d’ouvrir ce dossier, donc rien n’a été récupéré. Autorisez votre compte à le lire, puis réessayez.",
			retry: "Réessayer",
		},
		row: {
			inKiroshi: "Déjà dans Kiroshi.",
			skills_one: "{{count}} compétence",
			skills_many: "{{count}} compétences",
			skills_other: "{{count}} compétences",
			newSkills_one: "{{count}} nouvelle compétence",
			newSkills_many: "{{count}} nouvelles compétences",
			newSkills_other: "{{count}} nouvelles compétences",
			nameTaken:
				"{{name}} existe déjà dans Kiroshi, donc celui-ci arrive sous le nom {{renamed}}. Renommez-le ensuite.",
			companionNameTaken:
				"Vous avez déjà un agent nommé {{name}}, donc celui-ci arrive sous le nom {{renamed}}.",
			unparsable: "Impossible de le récupérer : son {{file}} est illisible.",
			type: {
				companion: "Agent",
				instructions: "Instructions",
				skill: "Compétences",
			},
			status: {
				done: "Terminé",
				pending: "En cours",
				failed: "Échec",
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
				"{{count}} agent tourne encore. Arrêtez-le pour redémarrer.",
			botsBusy_many:
				"{{count}} agents tournent encore. Arrêtez-les pour redémarrer.",
			botsBusy_other:
				"{{count}} agents tournent encore. Arrêtez-les pour redémarrer.",
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
