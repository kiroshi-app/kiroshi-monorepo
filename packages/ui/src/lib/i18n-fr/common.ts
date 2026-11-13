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
		unnamed: {
			host: "l’hôte",
			space: "cet espace",
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
		collapseUnsaved:
			"Impossible de mémoriser l’affichage de la barre latérale. Basculez-la de nouveau pour l’enregistrer.",
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
		revealTabFailed: {
			title: "Impossible d’afficher l’autre fenêtre",
			description:
				"La conversation est ouverte dans une autre fenêtre. Passez à cette fenêtre pour la voir.",
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
	library: {
		title: "Bibliothèque",
		subtitle: "Chaque image et chaque document de cet espace.",
		search: "Rechercher dans la Bibliothèque",
		import: "Importer",
		newDocument: "Nouveau document",
		newBoard: "Nouveau tableau",
		boardFileReplaced:
			"Une modification de {{name}} faite hors de Kiroshi a été remplacée par le tableau en direct.",
		blankBoard: "Tableau vierge",
		saved: {
			title: "Enregistré dans la Bibliothèque",
			image: "Image enregistrée dans la Bibliothèque",
			open: "Ouvrir",
		},
		filters: {
			label: "Afficher",
			all: "Tout",
			images: "Images",
			documents: "Documents",
			boards: "Tableaux",
		},
		noResult: {
			images: "Aucune image dans cette Bibliothèque pour l’instant.",
			documents: "Aucun document dans cette Bibliothèque pour l’instant.",
			boards: "Aucun tableau dans cette Bibliothèque pour l’instant.",
			search: "Rien ne correspond à « {{query}} ».",
		},
		start: "Commencer un document",
		templates: {
			blank: {
				name: "Document vierge",
				description: "Une page vide, sans rien à remplir.",
				placeholder:
					"Commencez à écrire. Tapez # pour un titre et - pour une liste.",
			},
			brief: {
				name: "Brief",
				preview:
					"# Brief\n\nCe que l’on fabrique, pour qui et pourquoi maintenant.\n\n## Objectif\n\nLe résultat sur lequel ce travail s’engage.\n\n## Terminé quand\n\nCe qui doit être vrai pour le dire fini.",
				description: "L’objectif et quand c’est terminé, pour un travail.",
				intro: "Ce que l’on fabrique, pour qui et pourquoi maintenant.",
				goal: {
					heading: "Objectif",
					placeholder:
						"Le résultat sur lequel ce travail s’engage, en une ou deux phrases.",
				},
				doneWhen: {
					heading: "Terminé quand",
					placeholder: "Ce qui doit être vrai pour le dire fini.",
				},
			},
			meetingNotes: {
				name: "Notes de réunion",
				preview:
					"# Notes de réunion\n\n## Décisions\n\n- Une ligne par décision\n- La raison qui la porte\n\n## Prochaines étapes\n\nQui fait quoi, et pour quand.",
				description: "Les décisions et les prochaines étapes, datées du jour.",
				title:
					"Notes de réunion, {{date, datetime(day: numeric)}} {{date, datetime(month: long)}}",
				intro: "Qui était là, et à quoi servait la réunion.",
				decisions: {
					heading: "Décisions",
					placeholder: "Une ligne par décision, avec la raison qui la porte.",
				},
				nextSteps: {
					heading: "Prochaines étapes",
					placeholder: "Qui fait quoi, et pour quand.",
				},
			},
			checklist: {
				name: "Liste de contrôle",
				preview:
					"# Liste de contrôle\n\n- Rédiger le plan\n- Réunir les références\n- Livrer la version finale",
				description: "Des choses à cocher, une par ligne.",
				item: "Une chose à faire par ligne.",
			},
		},
		picker: {
			subtitle:
				"Partez d’une page vierge, ou d’un modèle que vous pourrez changer ensuite.",
			templates: "Modèles",
			cancel: "Annuler",
			create: "Créer le document",
		},
		editor: {
			untitled: "Sans titre",
			created: "Créé à l’instant",
			createdFrom: "Créé à l’instant à partir de {{template}}",
			title: "Titre",
			body: "Texte du document",
			toolbar: {
				label: "Mise en forme",
				bold: "Gras",
				italic: "Italique",
				strikethrough: "Barré",
				code: "Code",
				link: "Lien",
				heading: "Titre de section",
				list: "Liste",
				boldShortcut: "⌘B",
				italicShortcut: "⌘I",
				strikethroughShortcut: "⌘⇧S",
				codeShortcut: "⌘E",
				linkShortcut: "⌘K",
				linkField: "Adresse du lien",
				confirmLink: "Ajouter le lien",
			},
			blocks: {
				types: {
					paragraph: "Texte",
					heading: "Titre de section",
					list: "Liste",
					checklist: "Liste de tâches",
					quote: "Citation",
					gallery: "Galerie",
					callout: "Encadré",
					table: "Tableau",
					code: "Code",
					"web-page": "Carte de page web",
					collapsible: "Sections repliables",
					other: "Bloc",
				},
				markdown: {
					heading: "#",
					list: "-",
					checklist: "[]",
					quote: ">",
					code: "```",
				},
				slash: {
					label: "Blocs",
					text: "Texte",
					rich: "Blocs enrichis",
					moveKeys: "↑↓",
					move: "Parcourir",
					insertKey: "↵",
					insert: "Insérer",
					closeKey: "échap",
					close: "Fermer",
				},
				handle: {
					insert: "Ajouter une ligne en dessous",
					menu: "Menu du bloc, glisser pour déplacer",
				},
				menu: {
					turnInto: "Transformer en",
					duplicate: "Dupliquer",
					moveUp: "Monter",
					moveDown: "Descendre",
					delete: "Supprimer",
					shortcuts: {
						mac: {
							duplicate: "⌘D",
							moveUp: "⌥⇧↑",
							moveDown: "⌥⇧↓",
							delete: "⌫",
						},
						other: {
							duplicate: "Ctrl+D",
							moveUp: "Alt+Maj+↑",
							moveDown: "Alt+Maj+↓",
							delete: "Retour arrière",
						},
					},
				},
				skeleton: {
					column: "Colonne",
				},
				gallery: {
					add: "Ajouter des images",
					hint: "Faites glisser pour réordonner. La première image ouvre la galerie.",
					addFailed: "Impossible d’ajouter les images. Réessayez.",
					tile: "Image {{position}} sur {{count}}, les flèches la déplacent",
					remove: "Retirer l’image {{position}}",
					caption: "Légende de l’image {{position}}",
					captionPlaceholder: "Ajouter une légende",
				},
				checklist: {
					item: "Élément {{position}}",
					move: "Déplacer l’élément {{position}}, les flèches le déplacent",
				},
				callout: {
					text: "Texte de l’encadré",
					tone: "Ton de l’encadré",
				},
				table: {
					cell: "Ligne {{row}}, colonne {{column}}",
					empty: "Vide",
					addRow: "Ajouter une ligne",
					addColumn: "Ajouter une colonne",
				},
				code: {
					body: "Code",
					language: "Langage, {{name}}",
					search: "Rechercher un langage",
					noMatch: "Aucun langage ne correspond",
					languages: {
						text: "Texte brut",
						bash: "Shell",
						json: "JSON",
						typescript: "TypeScript",
						python: "Python",
						css: "CSS",
						diff: "Diff",
						html: "HTML",
						markdown: "Markdown",
						rust: "Rust",
						tsx: "TSX",
						yaml: "YAML",
					},
				},
				webPage: {
					link: "Lien",
					updateKey: "↵",
					update: "Mettre à jour",
					failed:
						"Impossible de charger l’aperçu de ce lien. Vérifiez l’adresse, puis appuyez sur Entrée pour réessayer.",
				},
			},
		},
		bringIn: {
			title: "Importer des fichiers",
			drop: "Déposez des images ou des documents ici",
			formats: "PNG, JPG, Markdown et texte brut.",
			action: "Importer des fichiers…",
		},
		drop: {
			title_one: "Déposez pour ajouter {{count}} fichier à la Bibliothèque",
			title_many: "Déposez pour ajouter {{count}} fichiers à la Bibliothèque",
			title_other: "Déposez pour ajouter {{count}} fichiers à la Bibliothèque",
			more_one: "et {{count}} autre",
			more_many: "et {{count}} autres",
			more_other: "et {{count}} autres",
		},
		importing: {
			label: "Importation de {{name}}",
			detail: "Importation… {{percent}} %",
		},
		added: {
			title_one: "{{count}} fichier ajouté",
			title_many: "{{count}} fichiers ajoutés",
			title_other: "{{count}} fichiers ajoutés",
			stillImporting_one: "{{name}} est encore en cours d’importation.",
			stillImporting_many:
				"{{count}} fichiers sont encore en cours d’importation.",
			stillImporting_other:
				"{{count}} fichiers sont encore en cours d’importation.",
		},
		comments: {
			pin: {
				open: "Commentaire de {{name}}",
				resolved: "Commentaire résolu de {{name}}",
			},
			composer: {
				placeholder: "Commenter, @ pour mentionner",
				reply: "Répondre, @ pour mentionner",
				mention: "Mentionner quelqu’un",
				send: "Envoyer",
				shortcut: {
					mac: "⌘⌥M",
					other: "Ctrl+Alt+M",
				},
			},
			mentions: {
				label: "Mentionner",
				agents: "Agents",
				people: "Personnes",
			},
			thread: {
				resolve: "Résoudre",
				more: "Plus",
				close: "Fermer",
				working: "y travaille",
				replies_one: "{{count}} réponse, {{names}}",
				replies_many: "{{count}} réponses, {{names}}",
				replies_other: "{{count}} réponses, {{names}}",
				resolvedBy: "Résolu par {{name}}",
				reopen: "Rouvrir",
			},
			list: {
				label: "Commentaires",
				open: "Ouverts",
				resolved: "Résolus",
				replies_one: "{{count}} réponse",
				replies_many: "{{count}} réponses",
				replies_other: "{{count}} réponses",
				emptyOpen: "Aucun commentaire ouvert",
				emptyResolved: "Aucun commentaire résolu",
			},
			bar: {
				comment: "Commenter",
				shortcut: "C",
				count_one: "{{count}} commentaire ouvert",
				count_many: "{{count}} commentaires ouverts",
				count_other: "{{count}} commentaires ouverts",
			},
			hint: {
				document:
					"Cliquez sur un bloc pour commenter, sélectionnez du texte pour un passage",
				board: "Cliquez sur une forme ou sur le tableau pour commenter",
				image: "Cliquez pour un point, faites glisser pour une zone",
				escape: "Échap",
			},
			anchor: {
				block: "Sur ce paragraphe",
				passage: "Sur « {{text}} »",
				goneText: "Sur un texte qui n’est plus dans le document",
				goneShape: "Sur une forme qui n’est plus sur le tableau",
				imagePoint: "Sur un point de l’image",
				imageZone: "Sur une zone de l’image",
			},
		},
		itemMenu: {
			label: "Actions pour {{name}}",
			open: "Ouvrir",
			openInNewTab: "Ouvrir dans un nouvel onglet",
			rename: "Renommer",
			copy: "Copier",
			download: "Télécharger",
			showInFolder: "Afficher dans le dossier",
			delete: "Supprimer",
			deleteConfirm: {
				title: "Supprimer {{name}} ?",
				description: "C’est irréversible.",
				failure: "Impossible de supprimer {{name}}. Réessayez.",
			},
		},
		imageMenu: {
			saveToLibrary: "Enregistrer dans la Bibliothèque",
			copyImage: "Copier l’image",
			openInViewer: "Ouvrir dans la visionneuse",
		},
		lightbox: {
			download: "Télécharger",
			copy: "Copier",
			copied: "Copié",
			more: "Plus",
			back: "Retour",
			close: "Fermer",
			previous: "Image précédente",
			next: "Image suivante",
			zoomOut: "Dézoomer",
			zoomIn: "Zoomer",
			fit: "Ajuster",
			fitToStage: "Ajuster à la fenêtre",
			zoom: "{{percent}} %",
			zoomThenFit: "{{percent}} %, ajuster à la fenêtre",
			position: "{{position}} sur {{count}}",
		},
		document: {
			back: "Bibliothèque",
			more: "Plus",
			download: "Télécharger",
			copy: "Copier",
			copied: "Copié",
			close: "Fermer",
			agents: {
				writing_one: "{{count}} agent écrit",
				writing_many: "{{count}} agents écrivent",
				writing_other: "{{count}} agents écrivent",
				stopAll: "Tout arrêter",
				caret: "{{name}} écrit",
				title: "{{name}} écrit…",
				summary_one: "{{count}} phrase ajoutée à « {{section}} »",
				summary_many: "{{count}} phrases ajoutées à « {{section}} »",
				summary_other: "{{count}} phrases ajoutées à « {{section}} »",
				stop: "Arrêter {{name}}",
				openConversation: "Ouvrir la conversation",
			},
			readOnly: "Lecture seule",
			placeholder: "Commencez à écrire, ou tapez / pour ajouter un bloc.",
			start: {
				label: "Commencer avec",
				checklist: "Liste de tâches",
				gallery: "Galerie",
				table: "Tableau",
				template: "Un modèle",
			},
			drop_one: "Déposez pour ajouter {{count}} image ici",
			drop_many: "Déposez pour ajouter {{count}} images ici",
			drop_other: "Déposez pour ajouter {{count}} images ici",
			failedImport: {
				choose: "Choisir un autre fichier",
				remove: "Retirer",
			},
		},
		panel: {
			openInLibrary: "Ouvrir dans la Bibliothèque",
			close: "Fermer",
			resize: "Redimensionner le panneau du document",
		},
		tab: {
			loadingDocument: "Chargement du document…",
			loadingImage: "Chargement de l’image…",
			unavailable: {
				missing: {
					title: "Cet élément n’est plus dans la Bibliothèque.",
					body: "Il a été supprimé ou déplacé. Fermez cet onglet.",
					action: "Fermer l’onglet",
				},
				unreadable: {
					title: "Impossible d’ouvrir {{name}}",
					body: "Impossible de lire cet élément sur l’ordinateur où tourne Kiroshi. Revenez à la Bibliothèque et rouvrez-le.",
					action: "Retour à la Bibliothèque",
				},
			},
		},
		documentPicker: {
			label: "Joindre depuis la Bibliothèque",
			search: "Rechercher des documents",
			attachFiles: "Joindre des fichiers de cet ordinateur",
		},
		failure: {
			list: "Impossible d’ouvrir la Bibliothèque",
			image: "Impossible d’afficher une image de la Bibliothèque",
			save: "Impossible d’enregistrer le fichier",
			copy: "Impossible de copier l’image",
			reveal: "Impossible d’afficher le fichier dans son dossier",
			delete: "Impossible de supprimer l’élément",
			document: {
				create:
					"Impossible de créer le document. Réessayez depuis Nouveau document.",
				open: "Impossible d’ouvrir le document. Rouvrez-le depuis la Bibliothèque.",
				save: "Impossible d’enregistrer vos dernières modifications. Gardez le document ouvert et modifiez-le à nouveau pour réessayer.",
				write:
					"L’écriture de {{name}} s’est interrompue. Redemandez-la depuis la conversation.",
				caret:
					"Impossible de montrer aux autres où vous êtes dans le document. Continuez à modifier pour réessayer.",
				stopAll:
					"Impossible d’arrêter les agents qui écrivent dans ce document. Appuyez sur Tout arrêter pour réessayer.",
				stop: "Impossible d’arrêter {{name}}. Appuyez sur Arrêter {{name}} pour réessayer.",
				saveAsDocument:
					"Impossible d’enregistrer le message comme document. Réessayez avec Enregistrer comme document.",
			},
			board: {
				open: "Impossible d’ouvrir le tableau. Ouvrez-le à nouveau depuis la Bibliothèque.",
				save: "Impossible d’enregistrer vos dernières modifications du tableau. Il affiche ce qui a été enregistré : refaites-les.",
				refused:
					"Impossible d’afficher les dernières modifications du tableau. Fermez-le et rouvrez-le depuis la Bibliothèque.",
				stopAll:
					"Impossible d’arrêter les agents qui dessinent sur ce tableau. Appuyez sur Tout arrêter pour réessayer.",
			},
			import: {
				title: "Impossible d’importer {{name}}",
				tooLarge:
					"Ce fichier est trop lourd pour la Bibliothèque. Réduisez sa taille, puis importez-le à nouveau.",
				invalidName:
					"Le nom de ce fichier ne convient pas à la Bibliothèque. Renommez le fichier, puis importez-le à nouveau.",
				unsupported:
					"Ce type de fichier ne peut pas aller dans la Bibliothèque. Importez une image PNG, JPEG, GIF ou WebP, ou un document Markdown ou texte brut.",
				undecodable:
					"Impossible de lire le contenu de ce fichier. Enregistrez-le à nouveau depuis l’app qui l’a créé, puis importez-le à nouveau.",
				notUtf8:
					"Impossible de lire le texte de ce document. Enregistrez-le en texte UTF-8, puis importez-le à nouveau.",
				missing:
					"Impossible de retrouver le fichier dans la Bibliothèque après l’import. Importez-le à nouveau.",
				unwritable:
					"Impossible d’enregistrer le fichier sur l’ordinateur où tourne Kiroshi. Vérifiez qu’il reste de la place sur son disque, puis importez à nouveau le fichier.",
				unreadable:
					"Impossible de lire le dossier de la Bibliothèque sur l’ordinateur où tourne Kiroshi. Vérifiez que le dossier est toujours là, puis importez à nouveau le fichier.",
				unknownSpace:
					"Cet espace n’existe plus sur l’ordinateur où tourne Kiroshi. Ouvrez un autre espace, puis importez-y le fichier.",
				unavailable:
					"Impossible d’ouvrir la Bibliothèque sur l’ordinateur où tourne Kiroshi. Redémarrez Kiroshi sur cet ordinateur, puis importez à nouveau le fichier.",
				storage:
					"Impossible d’enregistrer le fichier dans la Bibliothèque. Importez-le à nouveau.",
				imageUnreadable:
					"Impossible de lire cette image. Vérifiez qu’elle s’ouvre toujours, puis enregistrez-la à nouveau dans la Bibliothèque.",
				refused:
					"Impossible d’ajouter ce fichier à la Bibliothèque. Vérifiez le fichier, puis importez-le à nouveau.",
				generic:
					"Un problème est survenu pendant l’import. Importez à nouveau le fichier.",
				url: {
					unsupportedScheme:
						"Seuls les liens web (http ou https) peuvent être importés. Déposez plutôt un lien web.",
					privateAddress:
						"Kiroshi n’importe pas depuis une adresse privée. Déposez plutôt un lien public.",
					networkFailure:
						"Impossible d’atteindre ce lien. Vérifiez l’adresse, puis déposez-le à nouveau.",
					tooLarge:
						"L’image derrière ce lien est trop lourde pour la Bibliothèque. Déposez le lien d’une image plus petite.",
					unknownSpace:
						"Cet espace n’existe plus sur l’ordinateur où tourne Kiroshi. Ouvrez un autre espace, puis déposez-y le lien.",
				},
			},
		},
	},
	board: {
		empty: {
			title: "Un tableau vide",
			body: "Choisissez un outil ci-dessous, collez un lien ou une image, ou glissez un élément depuis la Bibliothèque. Les agents de cet espace peuvent aussi dessiner ici.",
		},
		zoom: {
			controls: "Zoom",
			zoomOut: "Dézoomer",
			zoomIn: "Zoomer",
			level: "{{percent}} %",
		},
		presence: {
			drawing_one: "{{count}} agent dessine",
			drawing_many: "{{count}} agents dessinent",
			drawing_other: "{{count}} agents dessinent",
		},
		card: {
			open: "Ouvrir",
			drawing_one: "Tableau · {{name}} dessine · {{count}} élément",
			drawing_many: "Tableau · {{name}} dessine · {{count}} éléments",
			drawing_other: "Tableau · {{name}} dessine · {{count}} éléments",
			atRest_one: "Tableau · {{count}} élément · {{edited}}",
			atRest_many: "Tableau · {{count}} éléments · {{edited}}",
			atRest_other: "Tableau · {{count}} éléments · {{edited}}",
			failed: "Impossible de lire ce tableau. Ouvrez-le pour réessayer.",
		},
		libraryCard: {
			documentMeta: "Document · depuis la Bibliothèque",
		},
		canvas: {
			label: "Tableau",
			loading: "Chargement du tableau…",
			objects: "Éléments du tableau",
		},
		comments: {
			anchor: {
				node: "Sur « {{title}} »",
				board: "Sur le tableau",
			},
		},
		object: {
			named: "{{kind}} : {{text}}",
			editText: "Modifier le texte",
			kind: {
				sticky: "Note autocollante",
				text: "Texte",
				shape: "Forme",
				section: "Section",
				image: "Image",
				link: "Lien",
			},
			moved: "Déplacé en {{x}}, {{y}}",
			resized: "Redimensionné à {{width}} sur {{height}}",
		},
		connector: {
			editLabel: "Libellé de la flèche",
		},
		connectorFlyout: {
			label: "Type de flèche",
			routing: {
				straight: "Droit",
				elbow: "Coudé",
			},
		},
		selectionBar: {
			label: "Style de la forme",
			shapeType: "Type de forme",
			shape: {
				"rounded-rectangle": "Rectangle arrondi",
				ellipse: "Ellipse",
			},
			fill: {
				surface: "Sans couleur",
				yellow: "Jaune",
				green: "Vert",
				blue: "Bleu",
				pink: "Rose",
			},
			textSize: "Taille du texte",
			textSizeMedium: "M",
			more: "Plus",
		},
		dock: {
			label: "Outils du tableau",
			tool: {
				select: "Sélection",
				hand: "Main",
				sticky: "Note autocollante",
				shape: "Forme",
				text: "Texte",
				connector: "Flèche",
				section: "Section",
				image: "Image",
				library: "Bibliothèque",
			},
		},
		picker: {
			title: "Depuis la Bibliothèque",
			hint: "Glissez sur le tableau",
			empty: "Rien dans la Bibliothèque pour l’instant.",
		},
		drop: {
			images_one: "Déposez pour ajouter {{count}} image ici",
			images_many: "Déposez pour ajouter {{count}} images ici",
			images_other: "Déposez pour ajouter {{count}} images ici",
			files_one: "Déposez pour ajouter {{count}} fichier ici",
			files_many: "Déposez pour ajouter {{count}} fichiers ici",
			files_other: "Déposez pour ajouter {{count}} fichiers ici",
			unknown: "Déposez pour ajouter des fichiers ici",
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
