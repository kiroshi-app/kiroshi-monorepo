pub(super) static ENTRIES: [(&str, &str, &str); 2123] = [
	("bots.roster.label", "Conversations", "Conversations"),
	("bots.roster.create", "Create an agent", "Créer un agent"),
	("bots.roster.createMenu", "Create", "Créer"),
	("bots.roster.conversation.create", "Start a conversation", "Démarrer une conversation"),
	("bots.roster.conversation.others", "+{{count}}", "+{{count}}"),
	("bots.roster.conversation.preview", "{{name}}: {{text}}", "{{name}} : {{text}}"),
	("bots.roster.conversation.you", "You", "Vous"),
	("bots.roster.conversation.notSent", "Not sent", "Non envoyé"),
	("bots.roster.empty", "No agents yet", "Aucun agent pour l’instant"),
	("bots.roster.unavailable", "Couldn’t load your agents. Restart Kiroshi to retry.", "Impossible de charger vos agents. Redémarrez Kiroshi pour réessayer."),
	("bots.roster.failed", "Couldn’t load your agents.", "Impossible de charger vos agents."),
	("bots.roster.retry", "Retry", "Réessayer"),
	("bots.roster.previewUnreadable", "Couldn’t load the latest messages. Restart Kiroshi to retry.", "Impossible de charger les derniers messages. Redémarrez Kiroshi pour réessayer."),
	("bots.roster.settingsUnsaved", "Couldn’t save this agent’s settings. Make the change again to retry.", "Impossible d’enregistrer les réglages de cet agent. Refaites la modification pour réessayer."),
	("bots.roster.conversationUnsaved", "Couldn’t save your change to this conversation. Make it again to retry.", "Impossible d’enregistrer votre modification de cette conversation. Refaites-la pour réessayer."),
	("bots.roster.mission.state.waiting", "waiting for you", "en attente de vous"),
	("bots.roster.mission.state.failed", "blocked", "bloquée"),
	("bots.roster.mission.state.ready", "ready to merge", "prête à fusionner"),
	("bots.roster.mission.state.working", "working", "en cours"),
	("bots.roster.mission.unavailable.title", "Couldn’t load missions", "Impossible de charger les missions"),
	("bots.roster.mission.unavailable.description", "Restart Kiroshi to retry.", "Redémarrez Kiroshi pour réessayer."),
	("bots.roster.actions", "Actions for {{name}}", "Actions pour {{name}}"),
	("bots.roster.titled", "{{name}} · {{title}}", "{{name}} · {{title}}"),
	("bots.roster.openInNewTab", "Open in a new tab", "Ouvrir dans un nouvel onglet"),
	("bots.roster.settings", "Open settings", "Ouvrir les réglages"),
	("bots.roster.duplicate", "Duplicate", "Dupliquer"),
	("bots.roster.spaces.label", "Spaces", "Espaces"),
	("bots.roster.spaces.lastSpace", "An agent stays in at least one space. To remove an agent from its last space, delete the agent.", "Un agent reste dans au moins un espace. Pour retirer un agent de son dernier espace, supprimez l’agent."),
	("bots.roster.pin", "Pin", "Épingler"),
	("bots.roster.pinDrop", "Drop here to pin", "Déposer ici pour épingler"),
	("bots.roster.unpin", "Unpin", "Détacher"),
	("bots.roster.moved", "{{name}} moved to position {{position}} of {{count}}", "{{name}} déplacé en position {{position}} sur {{count}}"),
	("bots.roster.movedInSection", "{{name}} moved to position {{position}} of {{count}} in {{section}}", "{{name}} déplacé en position {{position}} sur {{count}} dans {{section}}"),
	("bots.roster.delete", "Delete", "Supprimer"),
	("bots.roster.needsYou", "Needs you", "Vous attend"),
	("bots.roster.working", "{{pose}}…", "{{pose}}…"),
	("bots.roster.backgroundTasks_one", "waiting on {{count}} background task", "attend {{count}} tâche en arrière-plan"),
	("bots.roster.backgroundTasks_other", "waiting on {{count}} background tasks", "attend {{count}} tâches en arrière-plan"),
	("bots.roster.pose.thinking", "thinking", "réfléchit"),
	("bots.roster.pose.searching", "searching", "cherche"),
	("bots.roster.pose.working", "working", "travaille"),
	("bots.roster.pose.writing", "writing", "écrit"),
	("bots.roster.pose.waiting", "waiting", "attend"),
	("bots.roster.idle", "idle", "au repos"),
	("bots.roster.announcement.none", "No agent selected", "Aucun agent sélectionné"),
	("bots.roster.announcement.selected", "{{name}} selected, {{state}}", "{{name}} sélectionné, {{state}}"),
	("bots.roster.section.actions", "Actions for the {{name}} section", "Actions pour la section {{name}}"),
	("bots.roster.section.moveTo", "Move to section", "Déplacer vers une section"),
	("bots.roster.section.none", "No section", "Aucune section"),
	("bots.roster.section.create", "Create a section", "Créer une section"),
	("bots.roster.section.createField", "New section name", "Nom de la nouvelle section"),
	("bots.roster.section.createDefault", "New section", "Nouvelle section"),
	("bots.roster.section.rename", "Rename", "Renommer"),
	("bots.roster.section.renameField", "Rename {{name}}", "Renommer {{name}}"),
	("bots.roster.section.moveUp", "Move up", "Monter"),
	("bots.roster.section.moveDown", "Move down", "Descendre"),
	("bots.roster.section.delete", "Delete", "Supprimer"),
	("bots.roster.section.empty", "Drop an agent here", "Déposez un agent ici"),
	("bots.roster.section.unreadable", "Couldn’t load the sections of this space. Restart Kiroshi to retry.", "Impossible de charger les sections de cet espace. Redémarrez Kiroshi pour réessayer."),
	("bots.roster.seedRefused", "Your first agent couldn’t be set up", "Votre premier agent n’a pas pu être créé"),
	("bots.rail.label", "Navigation", "Navigation"),
	("bots.rail.conversations", "Conversations", "Conversations"),
	("bots.rail.missions", "Missions", "Missions"),
	("bots.rail.library", "Library", "Bibliothèque"),
	("bots.rail.searchMissions", "Search missions", "Rechercher des missions"),
	("bots.rail.spaceSettings", "Space settings", "Réglages de l’espace"),
	("bots.rail.dot", "{{name}}, new activity", "{{name}}, nouvelle activité"),
	("bots.rail.badge.attention", "{{name}}, waiting for you", "{{name}}, en attente de vous"),
	("bots.rail.badge.done", "{{name}}, activity finished", "{{name}}, activité terminée"),
	("bots.rail.badge.failed", "{{name}}, activity failed", "{{name}}, activité en échec"),
	("bots.spaces.label", "Spaces", "Espaces"),
	("bots.spaces.switch", "Change space, {{name}} open", "Changer d’espace, {{name}} ouvert"),
	("bots.spaces.switchHosted", "Change space, {{name}} open, {{host}}", "Changer d’espace, {{name}} ouvert, {{host}}"),
	("bots.spaces.switchInvited_one", "Change space, {{name}} open, 1 invitation", "Changer d’espace, {{name}} ouvert, 1 invitation"),
	("bots.spaces.switchInvited_other", "Change space, {{name}} open, {{count}} invitations", "Changer d’espace, {{name}} ouvert, {{count}} invitations"),
	("bots.spaces.switchHostedInvited_one", "Change space, {{name}} open, {{host}}, 1 invitation", "Changer d’espace, {{name}} ouvert, {{host}}, 1 invitation"),
	("bots.spaces.switchHostedInvited_other", "Change space, {{name}} open, {{host}}, {{count}} invitations", "Changer d’espace, {{name}} ouvert, {{host}}, {{count}} invitations"),
	("bots.spaces.open", "Open {{name}}", "Ouvrir {{name}}"),
	("bots.spaces.create", "Create a space", "Créer un espace"),
	("bots.spaces.shortcut", "⌘{{rank}}", "⌘{{rank}}"),
	("bots.spaces.host.shared", "Shared", "Partagé"),
	("bots.spaces.host.up", "Online", "En ligne"),
	("bots.spaces.host.connecting", "Connecting…", "Connexion…"),
	("bots.spaces.host.down", "Not connected", "Non connecté"),
	("bots.spaces.remove.lastSpace", "An agent needs at least one space.", "Un agent a besoin d’au moins un espace."),
	("bots.spaces.remove.failed", "Couldn’t remove this agent from the space. Retry.", "Impossible de retirer cet agent de l’espace. Réessayez."),
	("bots.spaces.invitations.label", "Invitations", "Invitations"),
	("bots.spaces.invitations.invitedBy", "Invited by {{email}}", "Invité par {{email}}"),
	("bots.spaces.invitations.expires", "Expires {{date}}", "Expire le {{date}}"),
	("bots.spaces.invitations.accept", "Accept", "Accepter"),
	("bots.spaces.invitations.decline", "Decline", "Refuser"),
	("bots.spaces.invitations.joining", "Joining…", "Connexion…"),
	("bots.spaces.invitations.retry", "Try again", "Réessayer"),
	("bots.spaces.invitations.failed.servers", "Couldn’t accept. Kiroshi’s servers didn’t answer.", "Impossible d’accepter. Les serveurs de Kiroshi n’ont pas répondu."),
	("bots.spaces.invitations.failed.offline", "Couldn’t accept, this computer is offline. Try again once you’re connected.", "Impossible d’accepter, cet ordinateur est hors ligne. Réessayez une fois connecté."),
	("bots.spaces.invitations.withdrawn", "{{email}} withdrew this invitation. Ask them to invite you again.", "{{email}} a retiré cette invitation. Demandez-lui de vous inviter à nouveau."),
	("bots.spaces.invitations.expired", "This invitation expired on {{date}}. Ask {{email}} to invite you again.", "Cette invitation a expiré le {{date}}. Demandez à {{email}} de vous inviter à nouveau."),
	("bots.spaces.invitations.hostOffline", "{{host}}’s computer is offline. You can accept once it’s back.", "L’ordinateur de {{host}} est hors ligne. Vous pourrez accepter quand il sera de retour."),
	("bots.spaces.removed.notice", "{{host}} removed you from {{name}}.", "{{host}} vous a retiré de {{name}}."),
	("bots.spaces.removed.noticeDescription", "It’s gone from your spaces. Its conversations stay on {{host}}’s Kiroshi.", "Il n’apparaît plus dans vos espaces. Ses conversations restent sur le Kiroshi de {{host}}."),
	("bots.spaces.removed.memberNotice", "You’re no longer a member of {{name}}", "Vous n’êtes plus membre de {{name}}"),
	("bots.spaces.removed.memberNoticeDescription", "Its conversations aren’t on this device anymore. Ask {{host}} for a new invitation.", "Ses conversations ne sont plus sur cet appareil. Demandez une nouvelle invitation à {{host}}."),
	("bots.spaces.removed.deletedNotice", "{{host}} deleted {{name}}", "{{host}} a supprimé {{name}}"),
	("bots.spaces.removed.deletedNoticeDescription", "Its conversations aren’t on this device anymore.", "Ses conversations ne sont plus sur cet appareil."),
	("bots.spaces.signOut.title", "Sign out of Kiroshi?", "Se déconnecter de Kiroshi ?"),
	("bots.spaces.signOut.description", "{{name}} leaves this computer until you sign in again. Its conversations stay with {{host}}.", "{{name}} quitte cet ordinateur jusqu’à votre prochaine connexion. Ses conversations restent chez {{host}}."),
	("bots.spaces.signOut.confirm", "Sign out", "Se déconnecter"),
	("bots.spaces.signOut.notice", "Signed out. {{name}} left this computer.", "Déconnecté. {{name}} a quitté cet ordinateur."),
	("bots.dialog.untitled", "Untitled agent", "Agent sans titre"),
	("bots.dialog.breadcrumb", "Settings", "Réglages"),
	("bots.dialog.tab.general", "General", "Général"),
	("bots.dialog.tab.appearance", "Appearance", "Apparence"),
	("bots.dialog.tab.instructions", "Instructions", "Instructions"),
	("bots.dialog.tab.skills", "Skills", "Compétences"),
	("bots.dialog.tab.applications", "Applications", "Applications"),
	("bots.dialog.tab.secrets", "Secrets", "Secrets"),
	("bots.dialog.tab.history", "History", "Historique"),
	("bots.dialog.tab.approvals", "Approvals", "Autorisations"),
	("bots.dialog.tab.runtime", "Runtime", "Exécution"),
	("bots.dialog.tab.danger", "Danger zone", "Zone sensible"),
	("bots.dialog.name.label", "Name", "Nom"),
	("bots.dialog.name.placeholder", "No name", "Sans nom"),
	("bots.dialog.title.label", "Title", "Titre"),
	("bots.dialog.title.placeholder", "Short role label", "Intitulé court du rôle"),
	("bots.dialog.instructions.label", "Instructions", "Instructions"),
	("bots.dialog.instructions.placeholder", "The system prompt this agent always runs with", "L’invite système avec laquelle cet agent tourne toujours"),
	("bots.dialog.memory.label", "Memory", "Mémoire"),
	("bots.dialog.memory.hint", "What this agent remembers across conversations. Edit it or clear it; it keeps learning either way.", "Ce dont cet agent se souvient d’une conversation à l’autre. Modifiez-la ou effacez-la ; il continue d’apprendre."),
	("bots.dialog.memory.empty", "This agent has no memories yet.", "Cet agent n’a encore aucun souvenir."),
	("bots.dialog.memory.save", "Save memory", "Enregistrer la mémoire"),
	("bots.dialog.memory.clear.action", "Clear", "Effacer"),
	("bots.dialog.memory.clear.title", "Clear this agent’s memory?", "Effacer la mémoire de cet agent ?"),
	("bots.dialog.memory.clear.description", "It starts learning again from your next conversation. This can’t be undone.", "Il recommence à apprendre dès votre prochaine conversation. C’est irréversible."),
	("bots.dialog.memory.clear.confirm", "Clear the memory", "Effacer la mémoire"),
	("bots.history.empty", "No changes yet.", "Aucune modification pour l’instant."),
	("bots.history.unavailable", "Couldn’t load the history. Reopen settings to retry.", "Impossible de charger l’historique. Rouvrez les réglages pour réessayer."),
	("bots.history.summary_one", "Lists 1 change since {{date}}. Undoing one writes a new change, so nothing’s ever removed.", "Liste 1 modification depuis le {{date}}. Annuler une modification en écrit une nouvelle : rien n’est jamais supprimé."),
	("bots.history.summary_other", "Lists {{count}} changes since {{date}}. Undoing one writes a new change, so nothing’s ever removed.", "Liste {{count}} modifications depuis le {{date}}. Annuler une modification en écrit une nouvelle : rien n’est jamais supprimé."),
	("bots.history.noMatch", "No change matches “{{text}}”.", "Aucune modification ne correspond à « {{text}} »."),
	("bots.history.retouches_one", "(1 go)", "(1 fois)"),
	("bots.history.retouches_other", "({{count}} goes)", "({{count}} fois)"),
	("bots.history.undone", "Undone above", "Annulée plus haut"),
	("bots.history.recordFailed.title.bot", "Couldn’t add an agent’s change to History", "Impossible d’ajouter la modification d’un agent à l’historique"),
	("bots.history.recordFailed.title.user", "Couldn’t add a change to your profile to History", "Impossible d’ajouter une modification de votre profil à l’historique"),
	("bots.history.recordFailed.title.space", "Couldn’t add a change to the space to History", "Impossible d’ajouter une modification de l’espace à l’historique"),
	("bots.history.recordFailed.description", "The change is still saved, but you can’t undo it from History ({{detail}}). Open settings to review it.", "La modification reste enregistrée, mais vous ne pouvez pas l’annuler depuis l’historique ({{detail}}). Ouvrez les réglages pour la vérifier."),
	("bots.history.day.today", "Today", "Aujourd’hui"),
	("bots.history.day.yesterday", "Yesterday", "Hier"),
	("bots.history.search.label", "Search the history", "Rechercher dans l’historique"),
	("bots.history.search.placeholder", "Search the history", "Rechercher dans l’historique"),
	("bots.history.search.clear", "Clear the search", "Effacer la recherche"),
	("bots.history.author.user", "You", "Vous"),
	("bots.history.diff.show", "Show changes", "Afficher les modifications"),
	("bots.history.diff.hide", "Hide changes", "Masquer les modifications"),
	("bots.history.diff.loading", "Loading changes…", "Chargement des modifications…"),
	("bots.history.diff.filename", "Changes", "Modifications"),
	("bots.history.undo.action", "Undo", "Annuler"),
	("bots.history.undo.label", "Undo “{{title}}”", "Annuler « {{title}} »"),
	("bots.history.undo.title", "Undo “{{title}}”?", "Annuler « {{title}} » ?"),
	("bots.history.undo.description", "Everything goes back to how it was before this change. The undo is a change of its own, so you can undo it too.", "Tout revient à l’état d’avant cette modification. L’annulation est une modification à part entière : vous pouvez l’annuler aussi."),
	("bots.history.undo.confirm", "Undo this change", "Annuler cette modification"),
	("bots.history.change.back", "History", "Historique"),
	("bots.history.change.date", "{{day}}, {{time}}", "{{day}}, {{time}}"),
	("bots.history.change.added_one", "1 line added", "1 ligne ajoutée"),
	("bots.history.change.added_other", "{{count}} lines added", "{{count}} lignes ajoutées"),
	("bots.history.change.removed_one", "1 line removed", "1 ligne supprimée"),
	("bots.history.change.removed_other", "{{count}} lines removed", "{{count}} lignes supprimées"),
	("bots.history.change.consequence.counted_one", "Puts everything back to how it read before this change, across 1 file, and writes that as a new change you can undo too.", "Remet tout dans l’état d’avant cette modification, sur 1 fichier, et écrit cela comme une nouvelle modification que vous pouvez annuler aussi."),
	("bots.history.change.consequence.counted_other", "Puts everything back to how it read before this change, across {{count}} files, and writes that as a new change you can undo too.", "Remet tout dans l’état d’avant cette modification, sur {{count}} fichiers, et écrit cela comme une nouvelle modification que vous pouvez annuler aussi."),
	("bots.history.change.consequence.uncounted", "Puts everything back to how it read before this change, and writes that as a new change you can undo too.", "Remet tout dans l’état d’avant cette modification, et écrit cela comme une nouvelle modification que vous pouvez annuler aussi."),
	("bots.history.change.unavailable", "Couldn’t read the files of this change. Go back and open it again to retry.", "Impossible de lire les fichiers de cette modification. Revenez en arrière et rouvrez-la pour réessayer."),
	("bots.skills.untitled", "Untitled skill", "Compétence sans titre"),
	("bots.skills.add", "Add skill", "Ajouter une compétence"),
	("bots.skills.create", "Add skill", "Ajouter la compétence"),
	("bots.skills.save", "Save skill", "Enregistrer la compétence"),
	("bots.skills.unsaved", "Unsaved changes", "Modifications non enregistrées"),
	("bots.skills.back", "All skills", "Toutes les compétences"),
	("bots.skills.section.instructions", "Instructions", "Instructions"),
	("bots.skills.section.triggering", "Triggering", "Déclenchement"),
	("bots.skills.section.execution", "Execution", "Exécution"),
	("bots.skills.section.tools", "Tools", "Outils"),
	("bots.skills.section.files", "Files", "Fichiers"),
	("bots.skills.section.advanced", "Advanced", "Avancé"),
	("bots.skills.empty.title", "No skills yet", "Aucune compétence"),
	("bots.skills.empty.description", "Write a skill this agent can reuse, and choose whether it loads on every turn.", "Écrivez une compétence que cet agent peut réutiliser, et choisissez si elle se charge à chaque tour."),
	("bots.skills.name.label", "Name", "Nom"),
	("bots.skills.name.placeholder", "release-notes", "notes-de-version"),
	("bots.skills.name.hint", "Lowercase letters, numbers and hyphens. The agent reads the description, not the name.", "Minuscules, chiffres et traits d’union. L’agent lit la description, pas le nom."),
	("bots.skills.name.blank", "A skill needs a name.", "Une compétence a besoin d’un nom."),
	("bots.skills.description.label", "Description", "Description"),
	("bots.skills.description.placeholder", "When this agent should use it", "Quand cet agent doit l’utiliser"),
	("bots.skills.whenToUse.label", "When to use", "Quand l’utiliser"),
	("bots.skills.whenToUse.placeholder", "The requests this skill answers", "Les demandes auxquelles cette compétence répond"),
	("bots.skills.budget.label", "{{used}} of {{max}} characters", "{{used}} caractères sur {{max}}"),
	("bots.skills.budget.hint", "The description and when to use share one character budget.", "La description et le quand l’utiliser partagent un même budget de caractères."),
	("bots.skills.budget.over", "{{over}} characters over. Shorten either field to save.", "{{over}} caractères de trop. Raccourcissez l’un des deux champs pour enregistrer."),
	("bots.skills.body.label", "Body", "Contenu"),
	("bots.skills.body.placeholder", "Write the skill in markdown", "Écrivez la compétence en markdown"),
	("bots.skills.argumentHint.label", "Argument hint", "Indication d’arguments"),
	("bots.skills.argumentHint.placeholder", "[version] [--draft]", "[version] [--brouillon]"),
	("bots.skills.argumentHint.hint", "What you’re asked for when you run this skill yourself.", "Ce qui vous est demandé quand vous lancez cette compétence vous-même."),
	("bots.skills.arguments.label", "Arguments", "Arguments"),
	("bots.skills.arguments.placeholder", "One argument per line", "Un argument par ligne"),
	("bots.skills.paths.label", "Paths", "Chemins"),
	("bots.skills.paths.placeholder", "docs/**/*.md", "docs/**/*.md"),
	("bots.skills.paths.hint", "One glob per line. The files that make this skill relevant.", "Un motif par ligne. Les fichiers qui rendent cette compétence pertinente."),
	("bots.skills.modelInvocation.label", "Keep the agent from reaching for it", "Empêcher l’agent d’y recourir"),
	("bots.skills.modelInvocation.description", "Off, the agent decides from the description. On, only you can run it.", "Désactivé, l’agent décide d’après la description. Activé, vous seul pouvez la lancer."),
	("bots.skills.userInvocable.label", "Let you invoke it", "Vous laisser l’invoquer"),
	("bots.skills.userInvocable.description", "It shows in the command menu. Run it by name with the arguments above.", "Elle apparaît dans le menu de commandes. Lancez-la par son nom avec les arguments ci-dessus."),
	("bots.skills.preloaded.label", "Preload this skill", "Précharger cette compétence"),
	("bots.skills.preloaded.tag", "Preloaded", "Préchargée"),
	("bots.skills.preloaded.description", "On, it’s in this agent’s prompt every turn. Off, the agent reads it only when needed.", "Activé, elle est dans l’invite de cet agent à chaque tour. Désactivé, l’agent la lit seulement au besoin."),
	("bots.skills.system.tag", "System", "Système"),
	("bots.skills.system.notice", "Kiroshi writes this skill and keeps it current. It’s read-only here.", "Kiroshi écrit cette compétence et la tient à jour. Elle est en lecture seule ici."),
	("bots.skills.model.label", "Model", "Modèle"),
	("bots.skills.model.placeholder", "The agent’s own", "Celui de l’agent"),
	("bots.skills.model.hint", "Leave empty to use the agent’s model.", "Laissez vide pour utiliser le modèle de l’agent."),
	("bots.skills.effort.label", "Effort", "Effort"),
	("bots.skills.effort.default", "The agent’s own", "Celui de l’agent"),
	("bots.skills.effort.option.low", "Low", "Faible"),
	("bots.skills.effort.option.medium", "Medium", "Moyen"),
	("bots.skills.effort.option.high", "High", "Élevé"),
	("bots.skills.context.label", "Context", "Contexte"),
	("bots.skills.context.default", "The conversation it runs from", "La conversation d’où elle est lancée"),
	("bots.skills.context.hint", "Fork runs the skill in a copy of the conversation. Agent and Run in the background only apply to a fork.", "Fork lance la compétence dans une copie de la conversation. Agent et Exécuter en arrière-plan ne valent que pour un fork."),
	("bots.skills.context.option.shared", "Shared", "Partagé"),
	("bots.skills.context.option.fork", "Fork", "Fork"),
	("bots.skills.shell.label", "Shell", "Shell"),
	("bots.skills.shell.placeholder", "/bin/zsh", "/bin/zsh"),
	("bots.skills.shell.hint", "The shell this skill’s commands run in. Leave empty to use your default.", "Le shell des commandes de cette compétence. Laissez vide pour utiliser celui par défaut."),
	("bots.skills.agent.label", "Agent", "Agent"),
	("bots.skills.agent.placeholder", "The agent itself", "L’agent lui-même"),
	("bots.skills.agent.hint", "Who runs the fork.", "Qui exécute le fork."),
	("bots.skills.background.label", "Run in the background", "Exécuter en arrière-plan"),
	("bots.skills.background.description", "The fork finishes on its own while the conversation continues.", "Le fork se termine de son côté pendant que la conversation continue."),
	("bots.skills.allowedTools.label", "Allowed tools", "Outils autorisés"),
	("bots.skills.allowedTools.placeholder", "Read\nGrep", "Read\nGrep"),
	("bots.skills.allowedTools.hint", "One tool name per line. Leave empty to allow every tool the agent has.", "Un nom d’outil par ligne. Laissez vide pour autoriser tous les outils de l’agent."),
	("bots.skills.disallowedTools.label", "Disallowed tools", "Outils interdits"),
	("bots.skills.disallowedTools.placeholder", "Bash", "Bash"),
	("bots.skills.hooks.label", "Hooks", "Hooks"),
	("bots.skills.hooks.placeholder", "{\n  \"PreToolUse\": []\n}", "{\n  \"PreToolUse\": []\n}"),
	("bots.skills.hooks.hint", "What runs around this skill’s turn, as the bundle defines it.", "Ce qui s’exécute autour du tour de cette compétence, tel que le bundle le définit."),
	("bots.skills.license.label", "License", "Licence"),
	("bots.skills.license.placeholder", "MIT", "MIT"),
	("bots.skills.compatibility.label", "Compatibility", "Compatibilité"),
	("bots.skills.compatibility.placeholder", ">=1.4", ">=1.4"),
	("bots.skills.compatibility.hint", "What this skill needs from its runtime.", "Ce que cette compétence exige de son environnement."),
	("bots.skills.metadata.label", "Metadata", "Métadonnées"),
	("bots.skills.metadata.placeholder", "{\n  \"author\": \"Ada Martin\"\n}", "{\n  \"author\": \"Ada Martin\"\n}"),
	("bots.skills.metadata.hint", "Extra bundle data Kiroshi doesn’t use. It’s kept as is.", "Données du bundle que Kiroshi n’utilise pas. Elles sont conservées telles quelles."),
	("bots.skills.leave.title", "Leave without saving?", "Quitter sans enregistrer ?"),
	("bots.skills.leave.description", "You’ll lose your unsaved changes. The saved skill stays as it is.", "Vous perdrez vos modifications non enregistrées. La compétence enregistrée reste telle quelle."),
	("bots.skills.leave.action", "Leave", "Quitter"),
	("bots.skills.delete.action", "Delete skill", "Supprimer la compétence"),
	("bots.skills.delete.description", "The agent can no longer use this skill. This can’t be undone.", "L’agent ne pourra plus utiliser cette compétence. C’est irréversible."),
	("bots.skills.delete.confirm.title", "Delete {{name}}?", "Supprimer {{name}} ?"),
	("bots.skills.files.back", "All files", "Tous les fichiers"),
	("bots.skills.files.save", "Save file", "Enregistrer le fichier"),
	("bots.skills.files.loading", "Loading file…", "Chargement du fichier…"),
	("bots.skills.files.retry", "Try again", "Réessayer"),
	("bots.skills.files.add.label", "New file", "Nouveau fichier"),
	("bots.skills.files.add.placeholder", "reference/api.md", "reference/api.md"),
	("bots.skills.files.add.hint", "A path inside the skill’s folder. The file opens empty.", "Un chemin dans le dossier de la compétence. Le fichier s’ouvre vide."),
	("bots.skills.files.add.blank", "A file needs a path.", "Un fichier a besoin d’un chemin."),
	("bots.skills.files.add.taken", "This skill already has a file at that path.", "Cette compétence a déjà un fichier à ce chemin."),
	("bots.skills.files.add.action", "Add file", "Ajouter le fichier"),
	("bots.skills.files.text.label", "Contents", "Contenu"),
	("bots.skills.files.text.placeholder", "What this file holds", "Ce que ce fichier contient"),
	("bots.skills.files.failure.read", "Couldn’t open this file. Retry.", "Impossible d’ouvrir ce fichier. Réessayez."),
	("bots.skills.files.failure.write", "Couldn’t save this file. Save again; your text is still here.", "Impossible d’enregistrer ce fichier. Enregistrez à nouveau ; votre texte est toujours là."),
	("bots.skills.files.failure.delete", "Couldn’t delete this file. Retry.", "Impossible de supprimer ce fichier. Réessayez."),
	("bots.skills.files.delete.action", "Delete file", "Supprimer le fichier"),
	("bots.skills.files.delete.description", "The file is deleted from the skill’s folder. This can’t be undone.", "Le fichier est supprimé du dossier de la compétence. C’est irréversible."),
	("bots.skills.files.delete.confirm.title", "Delete {{path}}?", "Supprimer {{path}} ?"),
	("bots.applications.untitled", "Untitled application", "Application sans titre"),
	("bots.applications.add", "Add an application", "Ajouter une application"),
	("bots.applications.create", "Add application", "Ajouter l’application"),
	("bots.applications.save", "Save changes", "Enregistrer les modifications"),
	("bots.applications.unsaved", "Unsaved changes", "Modifications non enregistrées"),
	("bots.applications.back", "All applications", "Toutes les applications"),
	("bots.applications.search", "Search applications", "Rechercher des applications"),
	("bots.applications.paste", "Paste a configuration", "Coller une configuration"),
	("bots.applications.verified", "Verified", "Vérifiée"),
	("bots.applications.uses_one", "{{count}} use", "{{count}} utilisation"),
	("bots.applications.uses_other", "{{count, number}} uses", "{{count, number}} utilisations"),
	("bots.applications.hostedOn", "Runs on <host>{{host}}</host>", "Tourne sur <host>{{host}}</host>"),
	("bots.applications.intro.agent", "What {{name}} connects to for tools it doesn’t have on its own.", "Ce à quoi {{name}} se connecte pour les outils qu’il n’a pas seul."),
	("bots.applications.intro.space", "What every agent in {{name}} connects to.", "Ce à quoi chaque agent de {{name}} se connecte."),
	("bots.applications.intro.profile", "What you connect to, in every space.", "Ce à quoi vous vous connectez, dans chaque espace."),
	("bots.applications.footnote.space", "Each agent here can add applications of its own, and you can add some for every space.", "Chaque agent d’ici peut ajouter ses propres applications, et vous pouvez en ajouter pour tous les espaces."),
	("bots.applications.footnote.profile", "These reach every agent you have, in every space.", "Elles parviennent à chacun de vos agents, dans chaque espace."),
	("bots.applications.open", "Open {{name}}", "Ouvrir {{name}}"),
	("bots.applications.section.connection", "Connection", "Connexion"),
	("bots.applications.section.secrets", "Secrets", "Secrets"),
	("bots.applications.section.advanced", "Advanced", "Avancé"),
	("bots.applications.connection.state.connected", "Connected", "Connecté"),
	("bots.applications.connection.state.needsAuthorization", "Needs authorization", "Autorisation requise"),
	("bots.applications.connection.state.connecting", "Connecting…", "Connexion…"),
	("bots.applications.connection.state.failed", "Couldn’t connect", "Connexion impossible"),
	("bots.applications.connection.connect", "Connect", "Connecter"),
	("bots.applications.connection.retry", "Retry", "Réessayer"),
	("bots.applications.connection.cancel", "Cancel", "Annuler"),
	("bots.applications.connection.disconnect", "Disconnect", "Déconnecter"),
	("bots.applications.connection.row.connect", "Connect {{name}}", "Connecter {{name}}"),
	("bots.applications.connection.row.retry", "Retry {{name}}", "Réessayer {{name}}"),
	("bots.applications.connection.waiting", "Waiting for your browser", "En attente de votre navigateur"),
	("bots.applications.connection.description.needsAuthorization", "{{name}} signs you in through your browser. Kiroshi keeps the token with this application’s secrets, never in the configuration below.", "{{name}} vous identifie via votre navigateur. Kiroshi garde le jeton avec les secrets de cette application, jamais dans la configuration ci-dessous."),
	("bots.applications.connection.description.connecting", "A tab is open at {{host}}. Authorize Kiroshi there and this screen catches up on its own.", "Un onglet est ouvert sur {{host}}. Autorisez Kiroshi là-bas et cet écran se met à jour tout seul."),
	("bots.applications.connection.description.unsaved", "Available once this application is saved.", "Disponible une fois cette application enregistrée."),
	("bots.applications.connection.reason.alreadyRunning", "A sign-in is already running. Finish that one, or cancel it, then try again.", "Une connexion est déjà en cours. Terminez-la ou annulez-la, puis réessayez."),
	("bots.applications.connection.reason.store", "Kiroshi couldn’t write the token to this application’s secrets, so nothing was kept.", "Kiroshi n’a pas pu écrire le jeton dans les secrets de cette application, rien n’a été gardé."),
	("bots.applications.connection.reason.transport", "Kiroshi couldn’t reach the agent, so the sign-in never started.", "Kiroshi n’a pas pu joindre l’agent, la connexion n’a donc jamais démarré."),
	("bots.applications.connection.reason.refusedUrl", "Kiroshi wouldn’t open the sign-in link this application gave. Check its address.", "Kiroshi a refusé d’ouvrir le lien de connexion donné par cette application. Vérifiez son adresse."),
	("bots.applications.connection.reason.browserRefused", "Your browser wouldn’t open. Try again, or open the sign-in link yourself.", "Votre navigateur n’a pas voulu s’ouvrir. Réessayez, ou ouvrez le lien de connexion vous-même."),
	("bots.applications.connection.reason.timedOut", "The sign-in timed out before it came back. Try again.", "La connexion a expiré avant de revenir. Réessayez."),
	("bots.applications.connection.reason.unknown", "The sign-in stopped: {{detail}}", "La connexion s’est arrêtée : {{detail}}"),
	("bots.applications.connection.confirm.title", "Disconnect {{name}}?", "Déconnecter {{name}} ?"),
	("bots.applications.connection.confirm.description", "Kiroshi drops the token and asks {{name}} to forget it. This agent loses its {{name}} tools until you connect again.", "Kiroshi abandonne le jeton et demande à {{name}} de l’oublier. Cet agent perd les outils de {{name}} jusqu’à une nouvelle connexion."),
	("bots.applications.connection.session.title", "{{name}} was left out", "{{name}} a été laissé de côté"),
	("bots.applications.connection.refused.title", "The sign-in stopped working", "La connexion ne fonctionne plus"),
	("bots.applications.connection.refused.description_one", "Kiroshi couldn’t refresh the token, so {{name}}’s only tool was left out of {{agent}}’s {{sessions}}. Signing in again is usually all it takes.", "Kiroshi n’a pas pu renouveler le jeton, le seul outil de {{name}} a donc été absent {{sessions}} de {{agent}}. Se reconnecter suffit en général."),
	("bots.applications.connection.refused.description_other", "Kiroshi couldn’t refresh the token, so {{name}}’s {{count}} tools were left out of {{agent}}’s {{sessions}}. Signing in again is usually all it takes.", "Kiroshi n’a pas pu renouveler le jeton, les {{count}} outils de {{name}} ont donc été absents {{sessions}} de {{agent}}. Se reconnecter suffit en général."),
	("bots.applications.connection.refused.sessions_one", "last session", "de la dernière session"),
	("bots.applications.connection.refused.sessions_other", "last {{count}} sessions", "des {{count}} dernières sessions"),
	("bots.applications.connection.refused.action", "Sign in again", "Se reconnecter"),
	("bots.applications.install.signIn.title", "{{name}} signs you in", "{{name}} vous connecte"),
	("bots.applications.install.signIn.description", "A browser tab opens as soon as you add it. Kiroshi keeps the token with this application’s secrets, and refreshes it on its own.", "Un onglet du navigateur s’ouvre dès que vous l’ajoutez. Kiroshi garde le jeton avec les secrets de cette application, et le renouvelle tout seul."),
	("bots.applications.install.signIn.action", "Add and sign in", "Ajouter et se connecter"),
	("bots.applications.install.signIn.fact", "Signs you in. {{name}} opens in your browser and asks to allow Kiroshi.", "Vous connecte. {{name}} s’ouvre dans votre navigateur et demande d’autoriser Kiroshi."),
	("bots.applications.install.key.title", "What {{name}} needs to run", "Ce dont {{name}} a besoin"),
	("bots.applications.install.key.reveal", "Show", "Afficher"),
	("bots.applications.install.key.conceal", "Hide", "Masquer"),
	("bots.applications.install.key.revealLabel", "Show {{field}}", "Afficher {{field}}"),
	("bots.applications.install.key.concealLabel", "Hide {{field}}", "Masquer {{field}}"),
	("bots.applications.install.key.description.agent", "Kept with this application’s secrets, never in the configuration. {{name}} sees the tools, never these values.", "Gardées avec les secrets de cette application, jamais dans la configuration. {{name}} voit les outils, jamais ces valeurs."),
	("bots.applications.install.key.description.space", "Kept with this application’s secrets, never in the configuration. Every agent in {{name}} sees the tools, never these values.", "Gardées avec les secrets de cette application, jamais dans la configuration. Chaque agent de {{name}} voit les outils, jamais ces valeurs."),
	("bots.applications.install.key.description.profile", "Kept with this application’s secrets, never in the configuration. Every agent you have sees the tools, never these values.", "Gardées avec les secrets de cette application, jamais dans la configuration. Chacun de vos agents voit les outils, jamais ces valeurs."),
	("bots.applications.install.none", "Nothing to set up. It runs on this machine, with no key and no sign-in.", "Rien à configurer. Elle tourne sur cette machine, sans clé ni connexion."),
	("bots.applications.install.hostedNone", "Nothing to set up. No key, no sign-in.", "Rien à configurer. Ni clé, ni connexion."),
	("bots.applications.install.unavailable.title", "Kiroshi can’t add {{name}}", "Kiroshi ne peut pas ajouter {{name}}"),
	("bots.applications.install.unavailable.description", "It can’t be added from here: {{reason}}.", "Impossible de l’ajouter d’ici : {{reason}}."),
	("bots.applications.install.hosting", "Runs on <host>{{host}}</host>, not on this machine.", "Tourne sur <host>{{host}}</host>, pas sur cette machine."),
	("bots.applications.install.tools.title", "What it brings", "Ce qu’elle apporte"),
	("bots.applications.install.tools.count.plain_one", "{{count}} tool", "{{count}} outil"),
	("bots.applications.install.tools.count.plain_other", "{{count}} tools", "{{count}} outils"),
	("bots.applications.install.footnote.agent", "Applications run on your machine, under your account. Adding one reopens {{name}}’s session so the tools are there straight away.", "Les applications tournent sur votre machine, sous votre compte. En ajouter une rouvre la session de {{name}} pour que les outils soient là tout de suite."),
	("bots.applications.install.footnote.space", "Applications run on your machine, under your account. Adding one here gives every agent in {{name}} its tools.", "Les applications tournent sur votre machine, sous votre compte. En ajouter une ici donne ses outils à chaque agent de {{name}}."),
	("bots.applications.install.footnote.profile", "Applications run on your machine, under your account. Adding one here gives every agent you have its tools, in every space.", "Les applications tournent sur votre machine, sous votre compte. En ajouter une ici donne ses outils à chacun de vos agents, dans chaque espace."),
	("bots.applications.install.hostedFootnote.agent", "This one runs on {{source}}’s server, not on your machine. Adding it reopens {{name}}’s session so the tools are there straight away.", "Celle-ci tourne sur le serveur de {{source}}, pas sur votre machine. L’ajouter rouvre la session de {{name}} pour que les outils soient là tout de suite."),
	("bots.applications.install.hostedFootnote.space", "This one runs on {{source}}’s server, not on your machine. Adding it here gives every agent in {{name}} its tools.", "Celle-ci tourne sur le serveur de {{source}}, pas sur votre machine. L’ajouter ici donne ses outils à chaque agent de {{name}}."),
	("bots.applications.install.hostedFootnote.profile", "This one runs on {{source}}’s server, not on your machine. Adding it here gives every agent you have its tools, in every space.", "Celle-ci tourne sur le serveur de {{source}}, pas sur votre machine. L’ajouter ici donne ses outils à chacun de vos agents, dans chaque espace."),
	("bots.applications.install.done", "Added", "Ajoutée"),
	("bots.applications.install.failed", "Couldn’t add it: {{reason}}", "Impossible de l’ajouter\u{a0}: {{reason}}"),
	("bots.applications.install.missing", "No value for {{fields}}.", "Aucune valeur pour {{fields}}."),
	("bots.applications.install.rollback.title", "{{name}} was left in the list", "{{name}} est restée dans la liste"),
	("bots.applications.install.rollback.description", "Its key wasn’t written, and removing it again was refused too: {{reason}}.", "Sa clé n’a pas été écrite, et son retrait a été refusé lui aussi\u{a0}: {{reason}}."),
	("bots.applications.notice", "This agent runs applications on your machine, under your account. Only add ones you trust.", "Cet agent lance ses applications sur votre machine, sous votre compte. Ajoutez seulement ceux en qui vous avez confiance."),
	("bots.applications.empty.title.agent", "No applications of its own", "Aucune application à lui"),
	("bots.applications.empty.title.space", "Nothing shared in {{name}} yet", "Rien de partagé dans {{name}} pour l’instant"),
	("bots.applications.empty.title.profile", "No applications of your own", "Aucune application à vous"),
	("bots.applications.empty.description.agent", "Add one here and this agent gets tools it doesn’t have on its own. It runs on your machine.", "Ajoutez-en une ici et cet agent reçoit des outils qu’il n’a pas seul. Elle tourne sur votre machine."),
	("bots.applications.empty.description.space", "Add one here and every agent in this space gets its tools.", "Ajoutez-en une ici et chaque agent de cet espace reçoit ses outils."),
	("bots.applications.empty.description.profile", "Add one here and every agent you have gets its tools, in every space. Good for what is yours rather than a project’s.", "Ajoutez-en une ici et chacun de vos agents reçoit ses outils, dans chaque espace. Idéal pour ce qui est à vous plutôt qu’à un projet."),
	("bots.applications.catalogue.loading", "Loading the applications catalogue…", "Chargement du catalogue d’applications…"),
	("bots.applications.catalogue.directory", "From the curated directory.", "Depuis l’annuaire sélectionné."),
	("bots.applications.catalogue.empty", "Nothing in this category yet.", "Rien dans cette catégorie pour l’instant."),
	("bots.applications.catalogue.failed", "Couldn’t reach the applications catalogue.", "Impossible de joindre le catalogue d’applications."),
	("bots.applications.catalogue.partlyFailed", "Couldn’t read part of the catalogue. Retry to see the rest.", "Impossible de lire une partie du catalogue. Réessayez pour voir le reste."),
	("bots.applications.catalogue.stale", "This listing was read more than a day ago.", "Cette liste a été lue il y a plus d’un jour."),
	("bots.applications.catalogue.retry", "Retry", "Réessayer"),
	("bots.applications.catalogue.category.everything", "Everything", "Tout"),
	("bots.applications.catalogue.category.on-this-machine", "On this machine", "Sur cette machine"),
	("bots.applications.catalogue.category.commerce-shopping", "Commerce & shopping", "Commerce & achats"),
	("bots.applications.catalogue.category.communication", "Communication", "Communication"),
	("bots.applications.catalogue.category.consumer-health", "Consumer health", "Santé grand public"),
	("bots.applications.catalogue.category.creative", "Creative", "Création"),
	("bots.applications.catalogue.category.data-analytics", "Data & analytics", "Données & analyse"),
	("bots.applications.catalogue.category.developer-tools", "Developer tools", "Outils de développement"),
	("bots.applications.catalogue.category.education", "Education", "Éducation"),
	("bots.applications.catalogue.category.financial-services", "Financial services", "Services financiers"),
	("bots.applications.catalogue.category.health-life-sciences", "Health & life sciences", "Santé & sciences du vivant"),
	("bots.applications.catalogue.category.legal", "Legal", "Juridique"),
	("bots.applications.catalogue.category.media-entertainment", "Media & entertainment", "Médias & divertissement"),
	("bots.applications.catalogue.category.nonprofit", "Nonprofit", "Associatif"),
	("bots.applications.catalogue.category.productivity", "Productivity", "Productivité"),
	("bots.applications.catalogue.category.sales-marketing", "Sales & marketing", "Ventes & marketing"),
	("bots.applications.catalogue.category.travel", "Travel", "Voyage"),
	("bots.applications.catalogue.category.other", "Other", "Autre"),
	("bots.applications.catalogue.unavailable", "Couldn’t read the applications Kiroshi knows.", "Impossible de lire les applications que Kiroshi connaît."),
	("bots.applications.catalogue.unrefreshed.title", "Couldn’t refresh the applications directory", "Impossible d’actualiser l’annuaire des applications"),
	("bots.applications.catalogue.unrefreshed.description", "You’re seeing the last listing read. Open the catalogue again to retry.", "Vous voyez la dernière liste lue. Rouvrez le catalogue pour réessayer."),
	("bots.applications.catalogue.nothing", "Nothing matched {{query}}. Try another name.", "Aucun résultat pour {{query}}. Essayez un autre nom."),
	("bots.applications.catalogue.setup.signIn", "Signs you in", "Vous connecte"),
	("bots.applications.catalogue.setup.apiKey", "Needs an API key", "Demande une clé d’API"),
	("bots.applications.catalogue.setup.none", "Nothing to set up", "Rien à configurer"),
	("bots.applications.catalogue.setup.unavailable", "Can’t be added here", "Impossible de l’ajouter ici"),
	("bots.applications.unavailable", "Couldn’t load applications. Reopen settings to retry.", "Impossible de charger les applications. Rouvrez les réglages pour réessayer."),
	("bots.applications.reopen.refused.title", "Couldn’t reopen {{agent}}’s session", "Impossible de rouvrir la session de {{agent}}"),
	("bots.applications.reopen.refused.description", "{{name}} reaches it the next time that session opens.", "{{name}} la rejoindra à la prochaine ouverture de cette session."),
	("bots.applications.name.label", "Name", "Nom"),
	("bots.applications.name.placeholder", "atlas", "atlas"),
	("bots.applications.name.hint", "Lowercase letters, numbers and hyphens. The agent knows the application by this name.", "Minuscules, chiffres et traits d’union. L’agent connaît l’application sous ce nom."),
	("bots.applications.name.blank", "An application needs a name.", "Une application a besoin d’un nom."),
	("bots.applications.config.label", "Configuration", "Configuration"),
	("bots.applications.config.placeholder", "{\n  \"command\": \"npx\",\n  \"args\": [\"-y\", \"@scope/server\"]\n}", "{\n  \"command\": \"npx\",\n  \"args\": [\"-y\", \"@scope/server\"]\n}"),
	("bots.applications.config.hint", "Paste the JSON from the application’s instructions. A local application names a command, a remote one a URL.", "Collez le JSON des instructions de l’application. Une application locale nomme une commande, une application distante une URL."),
	("bots.applications.config.invalid", "This isn’t a JSON object. Check the braces, commas and quotes.", "Ce n’est pas un objet JSON. Vérifiez les accolades, les virgules et les guillemets."),
	("bots.applications.transport.label", "Transport", "Transport"),
	("bots.applications.transport.hint", "A local application runs a command. A remote one connects to a URL.", "Une application locale lance une commande. Une application distante se connecte à une URL."),
	("bots.applications.transport.option.local", "Started on this machine", "Démarré sur cette machine"),
	("bots.applications.transport.option.remote", "Reached over the network", "Joint par le réseau"),
	("bots.applications.command.label", "Command", "Commande"),
	("bots.applications.command.placeholder", "npx", "npx"),
	("bots.applications.command.hint", "The program this agent starts. It runs with your account’s access.", "Le programme que cet agent démarre. Il tourne avec les accès de votre compte."),
	("bots.applications.args.label", "Arguments", "Arguments"),
	("bots.applications.args.placeholder", "-y\n@scope/server", "-y\n@scope/server"),
	("bots.applications.args.hint", "One argument per line, in order.", "Un argument par ligne, dans l’ordre."),
	("bots.applications.url.label", "URL", "URL"),
	("bots.applications.url.placeholder", "https://example.com/mcp", "https://exemple.com/mcp"),
	("bots.applications.url.hint", "The address this agent connects to. Nothing runs on your machine.", "L’adresse à laquelle cet agent se connecte. Rien ne tourne sur votre machine."),
	("bots.applications.endpoint.label", "Endpoint", "Point d’accès"),
	("bots.applications.endpoint.hint", "How Kiroshi reaches the URL. Streamable HTTP counts as HTTP.", "La façon dont Kiroshi joint l’URL. Streamable HTTP compte comme HTTP."),
	("bots.applications.endpoint.option.http", "HTTP", "HTTP"),
	("bots.applications.endpoint.option.sse", "Server-sent events", "Événements envoyés par le serveur"),
	("bots.applications.endpoint.option.ws", "WebSocket", "WebSocket"),
	("bots.applications.headers.label", "Headers", "En-têtes"),
	("bots.applications.headers.placeholder", "Authorization: Bearer token", "Authorization: Bearer jeton"),
	("bots.applications.headers.hint", "One header per line, as name and value. Put the application’s key here.", "Un en-tête par ligne, nom et valeur. Mettez ici la clé de l’application."),
	("bots.applications.secrets.label", "Secrets", "Secrets"),
	("bots.applications.secrets.placeholder", "ATLAS_TOKEN=sk-…", "ATLAS_TOKEN=sk-…"),
	("bots.applications.secrets.hint", "One name and value per line. The application gets these secrets and no others.", "Un nom et une valeur par ligne. L’application reçoit ces secrets et aucun autre."),
	("bots.applications.leave.title", "Leave without saving?", "Partir sans enregistrer ?"),
	("bots.applications.leave.description", "You’ll lose your unsaved changes. The saved application stays as it is.", "Vous perdrez vos modifications non enregistrées. L’application enregistrée reste telle quelle."),
	("bots.applications.leave.action", "Leave", "Partir"),
	("bots.applications.launch.label", "What this starts", "Ce que cela démarre"),
	("bots.applications.launch.secrets", "Secrets", "Secrets"),
	("bots.applications.launch.unknown", "Add a command or a URL to this configuration.", "Ajoutez une commande ou une URL à cette configuration."),
	("bots.applications.launch.reveal", "Show the value of {{name}}", "Afficher la valeur de {{name}}"),
	("bots.applications.launch.conceal", "Hide the value of {{name}}", "Masquer la valeur de {{name}}"),
	("bots.applications.delete.action", "Remove application", "Retirer l’application"),
	("bots.applications.delete.description", "This agent stops starting it. This can’t be undone.", "Cet agent cesse de le démarrer. C’est irréversible."),
	("bots.applications.delete.confirm.title", "Remove {{name}}?", "Retirer {{name}} ?"),
	("bots.secrets.add", "Add secret", "Ajouter un secret"),
	("bots.secrets.notice", "Kiroshi passes each value to what runs here and never shows it again.", "Kiroshi transmet chaque valeur à ce qui tourne ici et ne l’affiche plus jamais."),
	("bots.secrets.unreadable.title", "Couldn’t load secrets", "Impossible de charger les secrets"),
	("bots.secrets.unreadable.description", "Reopen settings to retry.", "Rouvrez les réglages pour réessayer."),
	("bots.secrets.empty.title", "No secrets yet", "Aucun secret"),
	("bots.secrets.empty.description", "Add a secret to pass a value to what runs here. You won’t see the value again.", "Ajoutez un secret pour transmettre une valeur à ce qui tourne ici. Vous ne la reverrez plus."),
	("bots.secrets.scope.user", "You", "Toi"),
	("bots.secrets.scope.space", "Space", "Espace"),
	("bots.secrets.scope.bot", "Agent", "Agent"),
	("bots.secrets.scope.server", "Application", "Application"),
	("bots.secrets.row.scopes", "Defined in {{defined}} · Served from {{served}}", "Défini dans {{defined}} · Servi depuis {{served}}"),
	("bots.secrets.row.overridden", "Overridden by {{scope}}", "Remplacé par {{scope}}"),
	("bots.secrets.row.overriding", "Overrides {{scope}}", "Remplace {{scope}}"),
	("bots.secrets.row.needsValue", "Needs a value", "Valeur manquante"),
	("bots.secrets.row.unsetHere", "Unset here", "Vide ici"),
	("bots.secrets.row.noValue", "Defined in {{defined}} · No value", "Défini dans {{defined}} · Aucune valeur"),
	("bots.secrets.row.replace", "Replace the value of {{name}}", "Remplacer la valeur de {{name}}"),
	("bots.secrets.row.remove", "Remove {{name}}", "Retirer {{name}}"),
	("bots.secrets.set.add.title", "Add a secret", "Ajouter un secret"),
	("bots.secrets.set.add.description", "The value goes to what runs here. You won’t see it again.", "La valeur est transmise à ce qui tourne ici. Vous ne la reverrez plus."),
	("bots.secrets.set.replace.title", "Replace a value", "Remplacer une valeur"),
	("bots.secrets.set.replace.description", "Type a new value for {{name}}. The current one stays hidden.", "Saisissez une nouvelle valeur pour {{name}}. L’actuelle reste masquée."),
	("bots.secrets.set.name.label", "Name", "Nom"),
	("bots.secrets.set.name.placeholder", "ATLAS_TOKEN", "ATLAS_TOKEN"),
	("bots.secrets.set.name.hint", "Capital letters, digits and underscores. Programs read the secret by this name.", "Majuscules, chiffres et tirets bas. Les programmes lisent le secret sous ce nom."),
	("bots.secrets.set.name.invalid", "Use capital letters, digits and underscores, starting with a letter or an underscore.", "Utilisez des majuscules, des chiffres et des tirets bas, en commençant par une lettre ou un tiret bas."),
	("bots.secrets.set.value.label", "Value", "Valeur"),
	("bots.secrets.set.value.hint", "Saved once and never shown again.", "Enregistrée une fois, jamais réaffichée."),
	("bots.secrets.set.submit", "Save secret", "Enregistrer le secret"),
	("bots.secrets.set.failed", "Couldn’t save this secret. Retry.", "Impossible d’enregistrer ce secret. Réessayez."),
	("bots.secrets.remove.title", "Remove {{name}}?", "Retirer {{name}} ?"),
	("bots.secrets.remove.description", "Nothing here receives it anymore. This can’t be undone.", "Plus rien ici ne le reçoit. C’est irréversible."),
	("bots.secrets.remove.action", "Remove secret", "Retirer le secret"),
	("bots.secrets.remove.failed", "Couldn’t remove this secret. Retry.", "Impossible de retirer ce secret. Réessayez."),
	("bots.runtime.model.label", "Model", "Modèle"),
	("bots.runtime.model.placeholder", "Choose a model", "Choisissez un modèle"),
	("bots.runtime.model.unreadable", "Couldn’t read the models this machine offers.", "Impossible de lire les modèles proposés par cette machine."),
	("bots.runtime.effort.label", "Effort", "Effort"),
	("bots.runtime.effort.option.default", "Default", "Par défaut"),
	("bots.runtime.effort.option.low", "Low", "Faible"),
	("bots.runtime.effort.option.medium", "Medium", "Moyen"),
	("bots.runtime.effort.option.high", "High", "Élevé"),
	("bots.runtime.effort.option.xhigh", "Extra high", "Très élevé"),
	("bots.runtime.effort.option.max", "Max", "Maximal"),
	("bots.runtime.outputStyle.label", "Answer style", "Style de réponse"),
	("bots.runtime.outputStyle.option.Concise.label", "Concise", "Concis"),
	("bots.runtime.outputStyle.option.Concise.hint", "Short answers that lead with the result.", "Des réponses courtes qui commencent par le résultat."),
	("bots.runtime.outputStyle.option.default.label", "Standard", "Standard"),
	("bots.runtime.outputStyle.option.default.hint", "The agent’s standard answers.", "Les réponses standard de l’agent."),
	("bots.approvals.mode.label", "Default answer to a request", "Réponse par défaut à une demande"),
	("bots.approvals.mode.option.auto.label", "Decide alone", "Décider seul"),
	("bots.approvals.mode.option.auto.hint", "The agent decides on its own, within the rules below.", "L’agent décide seul, dans les limites des règles ci-dessous."),
	("bots.approvals.mode.option.default.label", "Ask every time", "Demander à chaque fois"),
	("bots.approvals.mode.option.default.hint", "You approve every tool the rules below don’t cover.", "Vous validez chaque outil que les règles ci-dessous ne couvrent pas."),
	("bots.approvals.mode.option.acceptEdits.label", "Accept edits", "Accepter les modifications"),
	("bots.approvals.mode.option.acceptEdits.hint", "File edits go through. You approve everything else.", "Les modifications de fichiers passent. Vous validez tout le reste."),
	("bots.approvals.mode.option.plan.label", "Plan first", "Planifier d’abord"),
	("bots.approvals.mode.option.plan.hint", "The agent reads and plans, and changes nothing until you approve.", "L’agent lit et planifie, et ne change rien sans votre accord."),
	("bots.approvals.mode.option.dontAsk.label", "Never ask", "Ne jamais demander"),
	("bots.approvals.mode.option.dontAsk.hint", "You’re never asked. Only the deny rules below stop the agent.", "Rien ne vous est demandé. Seules les règles de refus ci-dessous arrêtent l’agent."),
	("bots.approvals.rule.add", "Add", "Ajouter"),
	("bots.approvals.rule.placeholder", "Bash(git status:*)", "Bash(git status:*)"),
	("bots.approvals.rule.invalid", "Write a rule as Tool or Tool(specifier).", "Écrivez une règle sous la forme Outil ou Outil(spécificateur)."),
	("bots.approvals.rule.remove", "Remove the rule {{rule}}", "Retirer la règle {{rule}}"),
	("bots.approvals.rule.allow.label", "Allowed", "Autorisé"),
	("bots.approvals.rule.allow.hint", "Runs without asking you.", "S’exécute sans vous demander."),
	("bots.approvals.rule.allow.empty", "No allow rules yet.", "Aucune règle d’autorisation."),
	("bots.approvals.rule.ask.label", "Asked", "Soumis"),
	("bots.approvals.rule.ask.hint", "Asks you every time, whatever the mode.", "Vous est demandé à chaque fois, quel que soit le mode."),
	("bots.approvals.rule.ask.empty", "No ask rules yet.", "Aucune règle de demande."),
	("bots.approvals.rule.deny.label", "Denied", "Refusé"),
	("bots.approvals.rule.deny.hint", "Always refused, whatever the mode.", "Toujours refusé, quel que soit le mode."),
	("bots.approvals.rule.deny.empty", "No deny rules yet.", "Aucune règle de refus."),
	("bots.identity.avatar", "Avatar", "Avatar"),
	("bots.identity.uploadedImage", "Uploaded image", "Image importée"),
	("bots.identity.colour.label", "Colour", "Couleur"),
	("bots.identity.colour.none", "No colour", "Aucune couleur"),
	("bots.identity.colour.own", "Your hue", "Votre teinte"),
	("bots.identity.colour.ownValue", "Your hue · {{hue}}°", "Votre teinte · {{hue}}°"),
	("bots.identity.colour.degree", "°", "°"),
	("bots.identity.colour.option.red", "Red", "Rouge"),
	("bots.identity.colour.option.yellow", "Yellow", "Jaune"),
	("bots.identity.colour.option.green", "Green", "Vert"),
	("bots.identity.colour.option.cyan", "Cyan", "Cyan"),
	("bots.identity.colour.option.blue", "Blue", "Bleu"),
	("bots.identity.colour.option.purple", "Purple", "Violet"),
	("bots.identity.colour.option.pink", "Pink", "Rose"),
	("bots.identity.colour.option.orange", "Orange", "Orange"),
	("bots.identity.picture.label", "Picture", "Image"),
	("bots.identity.picture.file", "Avatar image file", "Fichier image de l’avatar"),
	("bots.identity.picture.add", "Add picture", "Ajouter une image"),
	("bots.identity.picture.change", "Change picture", "Changer l’image"),
	("bots.identity.picture.remove", "Remove picture", "Retirer l’image"),
	("bots.danger.delete", "Delete agent", "Supprimer l’agent"),
	("bots.danger.description", "The agent is deleted everywhere, not just removed from its spaces. This can’t be undone.", "L’agent est supprimé partout, pas seulement retiré de ses espaces. C’est irréversible."),
	("bots.danger.confirm.title", "Delete {{name}}?", "Supprimer {{name}} ?"),
	("bots.danger.failed", "Couldn’t delete this agent. Retry.", "Impossible de supprimer cet agent. Réessayez."),
	("chat.emptyState.ready.title", "Start with the agent", "Commencer avec l’agent"),
	("chat.emptyState.ready.description", "Kiroshi talks to the agent directly. Nothing leaves your device.", "Kiroshi dialogue directement avec l’agent. Rien ne quitte votre appareil."),
	("chat.emptyState.ready.descriptionNamed", "Kiroshi talks to {{name}} directly. Nothing leaves your device.", "Kiroshi dialogue directement avec {{name}}. Rien ne quitte votre appareil."),
	("chat.emptyState.unavailable.title", "Couldn’t reach the agent", "Impossible de joindre l’agent"),
	("chat.emptyState.unavailable.titleNamed", "Couldn’t reach {{name}}", "Impossible de joindre {{name}}"),
	("chat.emptyState.unavailable.description", "Kiroshi’s built-in agent didn’t answer. Try again.", "L’agent intégré de Kiroshi n’a pas répondu. Réessayez."),
	("chat.emptyState.unavailable.descriptionNamed", "{{name}} didn’t answer. Try again.", "{{name}} n’a pas répondu. Réessayez."),
	("chat.emptyState.notConnected.title", "You’re not signed in", "Vous n’êtes pas connecté"),
	("chat.emptyState.notConnected.description", "Connect your Claude account so your agents can answer.", "Connectez votre compte Claude pour que vos agents puissent répondre."),
	("chat.emptyState.settings", "Open agent settings", "Ouvrir les réglages de l’agent"),
	("chat.emptyState.hint", "Message an agent to start.", "Écrivez à un agent pour commencer."),
	("chat.emptyState.setup", "Try again", "Réessayer"),
	("chat.emptyState.signIn", "Sign in", "Se connecter"),
	("chat.conversationEmptyState.description_one", "{{count}} agent is ready.", "{{count}} agent est prêt."),
	("chat.conversationEmptyState.description_other", "{{count}} agents are ready.", "{{count}} agents sont prêts."),
	("chat.conversationEmptyState.hint", "Message an agent to start.", "Écrivez à un agent pour commencer."),
	("chat.conversationEmptyState.nobody.title", "Nobody is in this conversation yet", "Personne n’est encore dans cette conversation"),
	("chat.conversationEmptyState.nobody.description", "Type @ and pick a name. Whoever you mention joins, and they can bring in anyone else they need.", "Tapez @ et choisissez un nom. L’agent que vous mentionnez rejoint la conversation, et peut à son tour inviter ceux dont il a besoin."),
	("chat.conversationEmptyState.nobody.suggested", "The ones you talk to most", "Ceux à qui vous parlez le plus"),
	("chat.conversationArrival.invitedByPerson", "{{name}} joined this conversation, invited by you", "{{name}} a rejoint cette conversation, sur votre invitation"),
	("chat.conversationArrival.invitedByAgent", "{{name}} joined this conversation, invited by {{inviter}}", "{{name}} a rejoint cette conversation, à l’invitation de {{inviter}}"),
	("chat.conversationArrival.createdBy", "{{creator}} created {{name}}", "{{creator}} a créé {{name}}"),
	("chat.connection.checking", "Checking {{name}}…", "Vérification de {{name}}…"),
	("chat.connection.ready", "{{name}} is ready", "{{name}} est prêt"),
	("chat.connection.unavailable", "{{name}} is unavailable", "{{name}} est indisponible"),
	("chat.connection.crashed", "{{name}} stopped", "{{name}} s’est arrêté"),
	("chat.transcript.label", "Conversation", "Conversation"),
	("chat.transcript.loadNewer", "Load newer messages", "Charger les messages plus récents"),
	("chat.transcript.jumpToLatest", "Jump to latest", "Aller au dernier message"),
	("chat.transcript.newMessages", "New messages", "Nouveaux messages"),
	("chat.transcript.startOfHistory", "Beginning of the conversation", "Début de la conversation"),
	("chat.transcript.day.today", "Today", "Aujourd’hui"),
	("chat.transcript.day.yesterday", "Yesterday", "Hier"),
	("chat.transcript.landing.unavailable.title", "Couldn’t open that message", "Impossible d’ouvrir ce message"),
	("chat.transcript.landing.unavailable.description", "Open the search result again.", "Ouvrez à nouveau le résultat de recherche."),
	("chat.transcript.message.user", "user message", "message de l’utilisateur"),
	("chat.transcript.message.assistant", "assistant message", "message de l’assistant"),
	("chat.transcript.message.person", "message from {{name}}", "message de {{name}}"),
	("chat.transcript.message.mission", "mission opened", "mission ouverte"),
	("chat.transcript.message.actions", "Message actions", "Actions du message"),
	("chat.transcript.showMore", "Show more", "Afficher plus"),
	("chat.transcript.showLess", "Show less", "Afficher moins"),
	("chat.transcript.author.lead", "Lead", "Chef"),
	("chat.transcript.author.deleted", "Deleted agent", "Agent supprimé"),
	("chat.transcript.cause.label", "Routine report", "Rapport de routine"),
	("chat.transcript.cause.mission", "Mission summons", "Convocation de mission"),
	("chat.transcript.cause.unavailable.title", "Couldn’t load routine reports", "Impossible de charger les rapports de routine"),
	("chat.transcript.cause.unavailable.description", "Reopen the conversation to retry.", "Rouvrez la conversation pour réessayer."),
	("chat.transcript.cause.unavailable.soloDescription", "Reopen the conversation to retry.", "Rouvrez la conversation pour réessayer."),
	("chat.transcript.mention.unknown", "Unknown agent", "Agent inconnu"),
	("chat.transcript.mention.counted_one", "{{count}} mention", "{{count}} mention"),
	("chat.transcript.mention.counted_other", "{{count}} mentions", "{{count}} mentions"),
	("chat.transcript.mention.unresolved.title_one", "Couldn’t summon an agent", "Impossible de convoquer un agent"),
	("chat.transcript.mention.unresolved.title_other", "Couldn’t summon these agents", "Impossible de convoquer ces agents"),
	("chat.transcript.mention.unresolved.description_one", "{{names}} was named but holds no seat in this conversation.", "{{names}} a été nommé mais n’a pas de siège dans cette conversation."),
	("chat.transcript.mention.unresolved.description_other", "{{names}} were named but hold no seat in this conversation.", "{{names}} ont été nommés mais n’ont pas de siège dans cette conversation."),
	("chat.transcript.mention.notStarted.title_one", "{{names}} didn’t start", "{{names}} n’a pas démarré"),
	("chat.transcript.mention.notStarted.title_other", "{{names}} didn’t start", "{{names}} n’ont pas démarré"),
	("chat.transcript.mention.notStarted.description_one", "Seat it in this conversation, or pick another agent.", "Faites-le venir dans cette conversation, ou choisissez un autre agent."),
	("chat.transcript.mention.notStarted.description_other", "Seat them in this conversation, or pick other agents.", "Faites-les venir dans cette conversation, ou choisissez d’autres agents."),
	("chat.transcript.mention.summonLimit.description", "Agents already handed {{name}} the turn {{limit}} times in this exchange, so the exchange stops here. Mention {{name}} yourself to carry on.", "Des agents ont déjà passé la main à {{name}} {{limit}} fois dans cet échange, alors l’échange s’arrête ici. Mentionnez {{name}} vous-même pour continuer."),
	("chat.turn.copy", "Copy", "Copier"),
	("chat.turn.you", "You", "Vous"),
	("chat.turn.reply", "Reply", "Répondre"),
	("chat.turn.selection", "Selected text", "Texte sélectionné"),
	("chat.turn.pin", "Pin", "Épingler"),
	("chat.turn.unpin", "Unpin", "Retirer l’épingle"),
	("chat.turn.saveAsDocument", "Save as document", "Enregistrer comme document"),
	("chat.turn.copied", "Copied", "Copié"),
	("chat.turn.retry", "Retry", "Réessayer"),
	("chat.turn.cancel", "Cancel this message", "Annuler ce message"),
	("chat.turn.footer.cancelled", "Stopped", "Arrêté"),
	("chat.turn.footer.failed", "This response failed", "Cette réponse a échoué"),
	("chat.turn.footer.queued", "Waiting to be sent", "En attente d’envoi"),
	("chat.turn.notSent", "Not sent.", "Non envoyé."),
	("chat.turn.notSentBecause", "Not sent. {{reason}}", "Non envoyé. {{reason}}"),
	("chat.richBlock.building", "Building the view…", "Construction de la vue…"),
	("chat.richBlock.pending.interactive", "Interactive view", "Vue interactive"),
	("chat.richBlock.pending.gallery", "Gallery", "Galerie"),
	("chat.richBlock.pending.illustrated-list", "List", "Liste"),
	("chat.richBlock.pending.checklist", "Checklist", "Liste de tâches"),
	("chat.richBlock.pending.collapsible", "Section", "Section"),
	("chat.richBlock.pending.web-page", "Web page", "Page web"),
	("chat.richBlock.pending.video", "Video", "Vidéo"),
	("chat.richBlock.pending.map", "Map", "Carte"),
	("chat.queue.title_one", "Queued · {{count}} · goes once {{name}}’s answer is done", "En file · {{count}} · part une fois la réponse de {{name}} terminée"),
	("chat.queue.title_other", "Queued · {{count}} · sent in order, one after each answer", "En file · {{count}} · partent dans l’ordre, une après chaque réponse"),
	("chat.queue.you", "you", "vous"),
	("chat.queue.next", "Next, after {{name}}", "Ensuite, après {{name}}"),
	("chat.queue.sendNow", "Send now", "Envoyer maintenant"),
	("chat.queue.remove", "Remove from the queue", "Retirer de la file"),
	("chat.reply.label", "Replying to {{author}}", "Réponse à {{author}}"),
	("chat.reply.jump", "{{author}}: {{excerpt}}", "{{author}} : {{excerpt}}"),
	("chat.reply.dismiss", "Cancel reply", "Annuler la réponse"),
	("chat.reply.dismissFrom", "Remove the reply to {{author}}", "Retirer la réponse à {{author}}"),
	("chat.reply.excerpt", "“{{excerpt}}”", "« {{excerpt}} »"),
	("chat.pinned.title", "Pinned messages", "Messages épinglés"),
	("chat.pinned.counted_one", "Pinned messages, {{count}} pinned", "Messages épinglés, {{count}} épinglé"),
	("chat.pinned.counted_other", "Pinned messages, {{count}} pinned", "Messages épinglés, {{count}} épinglés"),
	("chat.pinned.jump", "Jump", "Aller"),
	("chat.pinned.jumpTo", "Jump to the message from {{author}}", "Aller au message de {{author}}"),
	("chat.pinned.unpin", "Unpin the message from {{author}}", "Retirer l’épingle du message de {{author}}"),
	("chat.pinned.empty", "No pinned messages in this conversation yet.", "Aucun message épinglé dans cette conversation."),
	("chat.pinned.unavailable.title", "Couldn’t sync pinned messages", "Impossible de synchroniser les messages épinglés"),
	("chat.pinned.unavailable.description", "Try again in a moment.", "Réessayez dans un instant."),
	("chat.working.name", "No name", "Sans nom"),
	("chat.working.verb.thinking", "thinking", "réfléchit"),
	("chat.working.verb.searching", "searching", "cherche"),
	("chat.working.verb.working", "working", "travaille"),
	("chat.working.verb.writing", "writing", "écrit"),
	("chat.working.verb.waiting", "waiting for you", "vous attend"),
	("chat.working.state", "{{name}} is {{verb}}…", "{{name}} {{verb}}…"),
	("chat.working.labelled", "{{name}} · {{label}}", "{{name}} · {{label}}"),
	("chat.working.mcp", "{{server}} · {{tool}}", "{{server}} · {{tool}}"),
	("chat.working.backgroundTasks_one", "waiting on {{count}} background task", "attend {{count}} tâche en arrière-plan"),
	("chat.working.backgroundTasks_other", "waiting on {{count}} background tasks", "attend {{count}} tâches en arrière-plan"),
	("chat.working.waitingTitled", "{{name}} is waiting for you… · {{title}}", "{{name}} vous attend… · {{title}}"),
	("chat.working.upNext", "{{name}} is up next…", "{{name}} passe ensuite…"),
	("chat.working.stop", "Stop {{name}}", "Arrêter {{name}}"),
	("chat.working.line.state", "is {{verb}}…", "{{verb}}…"),
	("chat.working.line.upNext", "is up next…", "passe ensuite…"),
	("chat.working.line.waitingTitled", "is waiting for you… · {{title}}", "vous attend… · {{title}}"),
	("chat.working.line.separator", "·", "·"),
	("chat.working.line.titled", "{{name}} {{text}}", "{{name}} {{text}}"),
	("chat.workLine.and", "and", "et"),
	("chat.workLine.agents_one", "{{count}} agent", "{{count}} agent"),
	("chat.workLine.agents_other", "{{count}} agents", "{{count}} agents"),
	("chat.workLine.state_one", "is working…", "travaille…"),
	("chat.workLine.state_other", "are working…", "travaillent…"),
	("chat.workLine.others_one", "{{count}} other working", "{{count}} autre au travail"),
	("chat.workLine.others_other", "{{count}} others working", "{{count}} autres au travail"),
	("chat.workLine.breakdown.writing_one", "{{count}} writing", "{{count}} écrit"),
	("chat.workLine.breakdown.writing_other", "{{count}} writing", "{{count}} écrivent"),
	("chat.workLine.breakdown.tool_one", "{{count}} using a tool", "{{count}} utilise un outil"),
	("chat.workLine.breakdown.tool_other", "{{count}} using a tool", "{{count}} utilisent un outil"),
	("chat.workLine.breakdown.thinking_one", "{{count}} thinking", "{{count}} réfléchit"),
	("chat.workLine.breakdown.thinking_other", "{{count}} thinking", "{{count}} réfléchissent"),
	("chat.workLine.breakdown.upNext_one", "{{count}} up next", "{{count}} passe ensuite"),
	("chat.workLine.breakdown.upNext_other", "{{count}} up next", "{{count}} passent ensuite"),
	("chat.workLine.retry", "Retry {{name}}", "Réessayer pour {{name}}"),
	("chat.workLine.toggle", "Each agent’s work", "Le travail de chaque agent"),
	("chat.notice.retry", "Retry", "Réessayer"),
	("chat.notice.dismiss", "Dismiss notice", "Ignorer l’avis"),
	("chat.spaceAccessBanner.offline.title", "{{space}} is offline", "{{space}} est hors ligne"),
	("chat.spaceAccessBanner.offline.body", "You can read what’s here. You can send again once Kiroshi is open on {{host}}’s computer.", "Vous pouvez lire ce qui est ici. Vous pourrez de nouveau envoyer quand Kiroshi sera ouvert sur l’ordinateur de {{host}}."),
	("chat.spaceAccessBanner.offline.reasons.relayUnreachable", "You can read what’s here. Couldn’t reach Kiroshi to connect to {{host}}’s computer, check your connection to send again.", "Vous pouvez lire ce qui est ici. Impossible de joindre Kiroshi pour atteindre l’ordinateur de {{host}}, vérifiez votre connexion pour envoyer de nouveau."),
	("chat.spaceAccessBanner.offline.reasons.rekeySendFailed", "You can read what’s here. {{host}} hasn’t answered the request for the new key, ask them to open Kiroshi on their computer.", "Vous pouvez lire ce qui est ici. {{host}} n’a pas répondu à la demande de nouvelle clé, demandez-lui d’ouvrir Kiroshi sur son ordinateur."),
	("chat.spaceAccessBanner.offline.reasons.hostSilent", "You can read what’s here. {{host}} hasn’t answered yet, ask them to open Kiroshi on their computer.", "Vous pouvez lire ce qui est ici. {{host}} n’a pas encore répondu, demandez-lui d’ouvrir Kiroshi sur son ordinateur."),
	("chat.spaceAccessBanner.offline.reasons.socketClosed", "You can read what’s here. {{host}} hasn’t answered since the connection closed, ask them to open Kiroshi on their computer.", "Vous pouvez lire ce qui est ici. {{host}} n’a pas répondu depuis la fermeture de la connexion, demandez-lui d’ouvrir Kiroshi sur son ordinateur."),
	("chat.spaceAccessBanner.offline.reasons.rekeyNotVerified", "You can read what’s here. Couldn’t verify the key {{host}} sent, ask them for a new link.", "Vous pouvez lire ce qui est ici. Impossible de vérifier la clé envoyée par {{host}}, demandez-lui un nouveau lien."),
	("chat.spaceAccessBanner.offline.reasons.notMember", "You can read what’s here. Kiroshi says this account isn’t in {{space}} anymore, ask {{host}} for a new link.", "Vous pouvez lire ce qui est ici. Kiroshi indique que ce compte n’est plus dans {{space}}, demandez un nouveau lien à {{host}}."),
	("chat.spaceAccessBanner.offline.reasons.unknownInstance", "You can read what’s here. Kiroshi doesn’t host {{space}} anymore, ask {{host}} to turn hosting on again.", "Vous pouvez lire ce qui est ici. Kiroshi n’héberge plus {{space}}, demandez à {{host}} de réactiver l’hébergement."),
	("chat.spaceAccessBanner.offline.reasons.deviceKeysUnreadable", "You can read what’s here. Couldn’t read this computer’s device keys to connect to {{host}}, quit Kiroshi and open it again.", "Vous pouvez lire ce qui est ici. Impossible de lire les clés de cet ordinateur pour joindre {{host}}, quittez Kiroshi et rouvrez-le."),
	("chat.spaceAccessBanner.offline.reasons.deviceAwaitingApproval", "You can read what’s here. This computer isn’t approved to connect to {{host}} yet, approve it from another computer signed in to your account.", "Vous pouvez lire ce qui est ici. Cet ordinateur n’est pas encore approuvé pour joindre {{host}}, approuvez-le depuis un autre ordinateur connecté à votre compte."),
	("chat.spaceAccessBanner.offline.reasons.socketUrlFailed", "You can read what’s here. Couldn’t get {{space}}’s address on {{host}}’s computer from Kiroshi, quit Kiroshi and open it again.", "Vous pouvez lire ce qui est ici. Impossible d’obtenir auprès de Kiroshi l’adresse de {{space}} sur l’ordinateur de {{host}}, quittez Kiroshi et rouvrez-le."),
	("chat.spaceAccessBanner.offline.reasons.rosterMissing", "You can read what’s here. {{host}} hasn’t sent the member list yet, ask them to open Kiroshi on their computer.", "Vous pouvez lire ce qui est ici. {{host}} n’a pas encore envoyé la liste des membres, demandez-lui d’ouvrir Kiroshi sur son ordinateur."),
	("chat.spaceAccessBanner.offline.reasons.keychainReadFailed", "You can read what’s here. Couldn’t read the key {{host}} sent for {{space}} from this computer’s secure storage, quit Kiroshi and open it again.", "Vous pouvez lire ce qui est ici. Impossible de lire la clé de {{space}} envoyée par {{host}} dans le stockage sécurisé de cet ordinateur, quittez Kiroshi et rouvrez-le."),
	("chat.attachments.label", "Attachments", "Pièces jointes"),
	("chat.attachments.open", "Open {{name}}", "Ouvrir {{name}}"),
	("chat.attachments.remove", "Remove {{name}}", "Retirer {{name}}"),
	("chat.attachments.attach", "Attach files", "Joindre des fichiers"),
	("chat.composer.label", "Message", "Message"),
	("chat.composer.placeholder", "Message", "Message"),
	("chat.composer.send", "Send", "Envoyer"),
	("chat.composer.offline", "{{space}} is offline. You can write again once {{host}}’s computer is back.", "{{space}} est hors ligne. Vous pourrez écrire à nouveau dès que l’ordinateur de {{host}} sera de retour."),
	("chat.composer.commands", "Commands", "Commandes"),
	("chat.composer.mentions", "Agents", "Agents"),
	("chat.composer.lead", "Lead", "Meneur"),
	("chat.composer.mentioned_one", "{{count}} mention in the draft", "{{count}} mention dans le brouillon"),
	("chat.composer.mentioned_other", "{{count}} mentions in the draft", "{{count}} mentions dans le brouillon"),
	("chat.composer.outside", "Not in this conversation", "Pas dans cette conversation"),
	("chat.composer.invite", "Add to this conversation", "Ajouter à cette conversation"),
	("chat.composer.further_one", "Keep typing to reach the other {{count}} in {{space}}", "Continuez à taper pour atteindre l’autre dans {{space}}"),
	("chat.composer.further_other", "Keep typing to reach the other {{count}} in {{space}}", "Continuez à taper pour atteindre les {{count}} autres dans {{space}}"),
	("chat.toolApproval.title", "Allow this tool to run?", "Autoriser cet outil à s’exécuter ?"),
	("chat.toolApproval.status.pending", "Approval required", "Autorisation requise"),
	("chat.toolApproval.status.allowed", "Allowed once", "Autorisé une fois"),
	("chat.toolApproval.status.denied", "Denied", "Refusé"),
	("chat.toolApproval.sensitive", "Hidden", "Masqué"),
	("chat.toolApproval.input", "Tool input", "Entrée de l’outil"),
	("chat.toolApproval.allowOnce", "Allow once", "Autoriser une fois"),
	("chat.toolApproval.deny", "Deny", "Refuser"),
	("chat.toolQuestion.freeText", "Other answer", "Autre réponse"),
	("chat.toolQuestion.freeTextPlaceholder", "Write your own answer…", "Écrivez votre propre réponse…"),
	("chat.toolQuestion.blank", "Answer this question to continue.", "Répondez à cette question pour continuer."),
	("chat.toolQuestion.preview", "Preview", "Aperçu"),
	("chat.toolQuestion.submit", "Send answers", "Envoyer les réponses"),
	("chat.toolQuestion.send", "Send", "Envoyer"),
	("chat.toolQuestion.next", "Go to the next question", "Passer à la question suivante"),
	("chat.toolQuestion.nextLabel", "Next", "Suivante"),
	("chat.toolQuestion.continue", "Continue", "Continuer"),
	("chat.toolQuestion.skip", "Skip", "Passer"),
	("chat.toolQuestion.minimise", "Minimize", "Réduire"),
	("chat.toolQuestion.pickAny", "Choose any that apply.", "Choisissez toutes celles qui conviennent."),
	("chat.toolQuestion.waiting.title", "{{name}} is waiting on your answer", "{{name}} attend votre réponse"),
	("chat.toolQuestion.waiting.unnamedTitle", "Waiting on your answer", "En attente de votre réponse"),
	("chat.toolQuestion.waiting.mark", "?", "?"),
	("chat.toolQuestion.waiting.answer", "Answer", "Répondre"),
	("chat.toolQuestion.copy", "Copy", "Copier"),
	("chat.toolQuestion.copied", "Copied", "Copié"),
	("chat.toolQuestion.copyAnnounced", "Link copied to clipboard", "Lien copié dans le presse-papiers"),
	("chat.toolQuestion.copyFailed", "Couldn’t copy. Select the link and copy it yourself.", "Copie impossible. Sélectionnez le lien et copiez-le vous-même."),
	("chat.answeredQuestion.byViewer", "You answered", "Vous avez répondu"),
	("chat.answeredQuestion.byMember", "{{name}} answered", "{{name}} a répondu"),
	("chat.interactiveView.madeBy", "View made by {{name}}", "Vue créée par {{name}}"),
	("chat.interactiveView.modes", "View mode", "Mode d’affichage"),
	("chat.interactiveView.inline", "Inline", "Dans la conversation"),
	("chat.interactiveView.pinned", "Pin", "Épingler"),
	("chat.interactiveView.fullscreen", "Full screen", "Plein écran"),
	("chat.selectionQuote.label", "Selection · {{name}}", "Sélection · {{name}}"),
	("chat.selectionQuote.group", "Selection quoted from {{name}}", "Sélection citée de {{name}}"),
	("chat.selectionQuote.remove", "Remove the selection", "Retirer la sélection"),
	("chat.applicationInstall.openSettings", "Open Settings", "Ouvrir les réglages"),
	("chat.applicationInstall.receipt.agent", "{{destination}} has {{name}} in every conversation.", "{{destination}} a {{name}} dans toutes ses conversations."),
	("chat.applicationInstall.receipt.space", "Every agent in {{destination}} has {{name}}.", "Chaque agent de {{destination}} a {{name}}."),
	("chat.applicationInstall.receipt.user", "You have {{name}} in every conversation.", "Vous avez {{name}} dans toutes vos conversations."),
	("chat.applicationInstall.secret_one", "Its key goes in {{secret}}.", "Sa clé va dans {{secret}}."),
	("chat.applicationInstall.secret_other", "Its keys go in {{secret}}.", "Ses clés vont dans {{secret}}."),
	("chat.applicationInstall.unreadable", "Couldn’t read the applications added to this conversation.", "Impossible de lire les applications ajoutées à cette conversation."),
	("chat.code.snippet", "Code snippet", "Extrait de code"),
	("chat.code.namedSnippet", "Code snippet, {{name}}", "Extrait de code, {{name}}"),
	("chat.code.copy", "Copy code", "Copier le code"),
	("chat.code.copied", "Copied", "Copié"),
	("chat.code.copyTooltip", "Copy", "Copier"),
	("chat.code.copyAnnounced", "Code copied to clipboard", "Code copié dans le presse-papiers"),
	("chat.code.copyFailed", "Couldn’t copy the code. Try again.", "Impossible de copier le code. Réessayez."),
	("chat.code.writing", "Writing", "Écriture"),
	("chat.code.ready", "Ready", "Prêt"),
	("chat.table.label", "Table", "Tableau"),
	("chat.table.copy", "Copy table", "Copier le tableau"),
	("chat.table.copyAnnounced", "Table copied to clipboard", "Tableau copié dans le presse-papiers"),
	("chat.diagram.label", "Diagram", "Diagramme"),
	("chat.task.done", "Done", "Fait"),
	("chat.task.todo", "To do", "À faire"),
	("chat.fileReference.writing", "Writing…", "Écriture…"),
	("chat.webSources.list", "Sources", "Sources"),
	("chat.webSources.counted_one", "{{count}} source", "{{count}} source"),
	("chat.webSources.counted_other", "{{count}} sources", "{{count}} sources"),
	("chat.webSources.open", "Open {{name}}", "Ouvrir {{name}}"),
	("chat.webSources.openTitled", "Open {{title}}, {{domain}}", "Ouvrir {{title}}, {{domain}}"),
	("chat.answerBlock.checklist.copy", "Copy the list", "Copier la liste"),
	("chat.answerBlock.sourcedImage.save", "Save the image", "Enregistrer l’image"),
	("chat.answerBlock.sourcedImage.saving", "Saving the image…", "Enregistrement de l’image…"),
	("chat.answerBlock.sourcedImage.unavailable", "Image unavailable", "Image indisponible"),
	("chat.answerBlock.sourcedImage.openOriginal", "Open original", "Ouvrir l’original"),
	("chat.answerBlock.webPage.open", "Open as page", "Ouvrir comme page"),
	("chat.answerBlock.webPage.openFailed", "Couldn’t open the page in the browser. Press Open as page again.", "Impossible d’ouvrir la page dans le navigateur. Appuyez de nouveau sur Ouvrir comme page."),
	("chat.answerBlock.video.play", "Play {{title}}", "Lire {{title}}"),
	("chat.answerBlock.video.pause", "Pause {{title}}", "Mettre en pause {{title}}"),
	("chat.answerBlock.video.seek", "Go to {{time}}", "Aller à {{time}}"),
	("chat.answerBlock.video.failed", "Couldn’t play the video. Press play to try again.", "Impossible de lire la vidéo. Appuyez sur lecture pour réessayer."),
	("chat.answerBlock.map.open", "Open in Maps", "Ouvrir la carte"),
	("chat.answerBlock.interactive.result", "Result", "Résultat"),
	("chat.answerBlock.interactive.notDefined", "Not defined for these values", "Non défini pour ces valeurs"),
	("chat.answerBlock.interactive.use", "Use these values", "Utiliser ces valeurs"),
	("chat.answerBlock.interactive.summary", "{{values}}. {{label}}: {{result}}", "{{values}}. {{label}} : {{result}}"),
	("chat.answerBlock.image.untitled", "Image", "Image"),
	("chat.answerBlock.image.copyFailed", "Couldn’t copy the image address. Press Copy again.", "Impossible de copier l’adresse de l’image. Appuyez de nouveau sur Copier."),
	("chat.answerBlock.image.openFailed", "Couldn’t open the image in the browser. Press Download again.", "Impossible d’ouvrir l’image dans le navigateur. Appuyez de nouveau sur Télécharger."),
	("chat.answerBlock.callout.note", "Note", "Note"),
	("chat.answerBlock.callout.tip", "Tip", "Astuce"),
	("chat.answerBlock.callout.warning", "Warning", "Attention"),
	("chat.answerBlock.gallery.tile", "{{caption}}, photo {{position}}", "{{caption}}, photo {{position}}"),
	("chat.answerBlock.gallery.more_one", "{{count}} more photo", "{{count}} photo de plus"),
	("chat.answerBlock.gallery.more_other", "{{count}} more photos", "{{count}} photos de plus"),
	("chat.screen.label", "Agent conversation", "Conversation avec l’agent"),
	("chat.screen.identity", "{{name}} · agent settings", "{{name}} · réglages de l’agent"),
	("chat.screen.conversationIdentity", "{{name}} · conversation settings", "{{name}} · réglages de la conversation"),
	("chat.screen.placeholder", "Message {{name}}", "Message à {{name}}"),
	("chat.screen.approval.description", "The agent needs your approval to run this tool.", "L’agent attend votre autorisation pour lancer cet outil."),
	("chat.screen.approval.descriptionNamed", "{{name}} needs your approval to run this tool.", "{{name}} attend votre autorisation pour lancer cet outil."),
	("chat.screen.approval.path", "Path", "Chemin"),
	("chat.screen.question.recall", "{{author}} is waiting on your answer", "{{author}} attend votre réponse"),
	("chat.screen.attachmentsRefused", "Couldn’t attach files", "Impossible de joindre les fichiers"),
	("chat.screen.restart", "Restart session", "Redémarrer la session"),
	("chat.screen.notice.crashed", "The agent stopped", "L’agent s’est arrêté"),
	("chat.screen.notice.crashedNamed", "{{name}} stopped", "{{name}} s’est arrêté"),
	("chat.screen.notice.resumeFailed", "Couldn’t resume the conversation", "Impossible de reprendre la conversation"),
	("chat.screen.notice.settingsRejected", "Couldn’t apply the agent’s settings", "Impossible d’appliquer les réglages de l’agent"),
	("chat.screen.notice.settingsRejectedNamed", "Couldn’t apply {{name}}’s settings", "Impossible d’appliquer les réglages de {{name}}"),
	("chat.screen.notice.serverEnvRejected", "Couldn’t start an application", "Impossible de démarrer une application"),
	("chat.screen.notice.notAuthenticated", "You’re not signed in", "Vous n’êtes pas connecté"),
	("chat.screen.notice.unavailable", "Couldn’t reach the agent", "Impossible de joindre l’agent"),
	("chat.screen.notice.unavailableNamed", "Couldn’t reach {{name}}", "Impossible de joindre {{name}}"),
	("chat.screen.notice.failed", "Couldn’t send that request", "Impossible d’envoyer cette demande"),
	("chat.screen.notice.stopFailed", "Couldn’t stop the agent", "Impossible d’arrêter l’agent"),
	("chat.screen.notice.stopFailedNamed", "Couldn’t stop {{name}}", "Impossible d’arrêter {{name}}"),
	("chat.screen.notice.dockBadgeFailed", "Couldn’t update the count on the Kiroshi icon", "Impossible de mettre à jour le nombre sur l’icône de Kiroshi"),
	("chat.screen.notice.questionRunFailed.title", "{{name}} stopped before you answered", "L’exécution de {{name}} a échoué avant votre réponse"),
	("chat.screen.notice.questionRunFailed.description", "The run failed, so the question is gone. Send a message to start again.", "La question est fermée. Envoyez un message pour reprendre."),
	("chat.screen.notice.unauthorized.title", "The host refused this call.", "L’hôte a refusé cet appel."),
	("chat.screen.notice.unauthorized.description", "Open the link from the desktop app again.", "Rouvrez le lien depuis l’application de bureau."),
	("chat.screen.notice.hostOnly", "Only the host of this space can do that. Ask them to do it from their Kiroshi.", "Seul l’hôte de cet espace peut faire cela. Demandez-lui de le faire depuis son Kiroshi."),
	("chat.screen.notice.hostOffline.title", "Couldn’t reach the host of this space", "Impossible de joindre l’hôte de cet espace"),
	("chat.screen.notice.hostOffline.description", "Its computer is offline. Try again once it’s back online.", "Son ordinateur est hors ligne. Réessayez une fois qu’il est de nouveau en ligne."),
	("chat.screen.notice.describeRefused.title", "Couldn’t save the name and colour", "Impossible d’enregistrer le nom et la couleur"),
	("chat.screen.notice.describeRefused.description", "{{reason}} The space kept its previous name and colour.", "{{reason}} L’espace a gardé son nom et sa couleur précédents."),
	("chat.screen.notice.joinRefused.unavailable.title", "Couldn’t open the spaces you joined", "Impossible d’ouvrir les espaces rejoints"),
	("chat.screen.notice.joinRefused.unavailable.description", "Kiroshi can’t read its saved data on this computer. Restart Kiroshi, then try again.", "Kiroshi ne peut pas lire son stockage sur cet ordinateur. Redémarrez Kiroshi, puis réessayez."),
	("chat.screen.notice.joinRefused.storage.title", "Couldn’t read this space’s connection", "Impossible de lire la connexion à cet espace"),
	("chat.screen.notice.joinRefused.storage.description", "Kiroshi couldn’t load what it saved about this space. Try again in a moment.", "Kiroshi n’a pas pu charger ce qu’il a enregistré sur cet espace. Réessayez dans un instant."),
	("chat.screen.notice.joinRefused.unknownJoinedSpace.title", "This space is no longer in your list", "Cet espace n’est plus dans votre liste"),
	("chat.screen.notice.joinRefused.unknownJoinedSpace.description", "You may have left it. Ask its host for a new invitation.", "Vous l’avez peut-être quitté. Demandez une nouvelle invitation à son hôte."),
	("chat.screen.notice.joinRefused.undeliverable.title", "Couldn’t open this space", "Impossible d’ouvrir cet espace"),
	("chat.screen.notice.joinRefused.undeliverable.description", "Kiroshi couldn’t pass the request on. Restart Kiroshi, then try again.", "Kiroshi n’a pas pu transmettre la demande. Redémarrez Kiroshi, puis réessayez."),
	("chat.screen.notice.joinRefused.proxyUnavailable.title", "Couldn’t connect to this space", "Impossible de se connecter à cet espace"),
	("chat.screen.notice.joinRefused.proxyUnavailable.description", "The connection to its host couldn’t be opened. Check your network, then try again.", "La connexion à son hôte n’a pas pu s’ouvrir. Vérifiez votre réseau, puis réessayez."),
	("chat.screen.notice.joinRefused.ownerNotRemovable.title", "You own this space", "Cet espace vous appartient"),
	("chat.screen.notice.joinRefused.ownerNotRemovable.description", "An owner can’t leave their own space.", "Le propriétaire d’un espace ne peut pas le quitter."),
	("chat.screen.notice.joinRefused.needsSignIn.title", "Couldn’t leave this space", "Impossible de quitter cet espace"),
	("chat.screen.notice.joinRefused.needsSignIn.description", "You’re signed out. Sign in, then try again.", "Vous êtes déconnecté. Connectez-vous, puis réessayez."),
	("chat.screen.notice.joinRefused.sessionRevoked.title", "Couldn’t leave this space", "Impossible de quitter cet espace"),
	("chat.screen.notice.joinRefused.sessionRevoked.description", "Your session ended. Sign in again, then try again.", "Votre session a pris fin. Reconnectez-vous, puis réessayez."),
	("chat.screen.notice.joinRefused.sessionStore.title", "Couldn’t leave this space", "Impossible de quitter cet espace"),
	("chat.screen.notice.joinRefused.sessionStore.description", "Kiroshi couldn’t read your sign-in on this computer. Restart Kiroshi, then try again.", "Kiroshi n’a pas pu lire votre connexion sur cet ordinateur. Redémarrez Kiroshi, puis réessayez."),
	("chat.screen.notice.joinRefused.relayUnreachable.title", "Couldn’t leave this space", "Impossible de quitter cet espace"),
	("chat.screen.notice.joinRefused.relayUnreachable.description", "Kiroshi couldn’t reach its cloud. Check your network, then try again.", "Kiroshi n’a pas pu joindre son cloud. Vérifiez votre réseau, puis réessayez."),
	("chat.screen.notice.joinRefused.relayRefused.title", "Couldn’t leave this space", "Impossible de quitter cet espace"),
	("chat.screen.notice.joinRefused.relayRefused.description", "Kiroshi’s cloud didn’t confirm you left. Try again in a moment.", "Le cloud de Kiroshi n’a pas confirmé votre départ. Réessayez dans un instant."),
	("chat.screen.notice.joinRefused.invitationExpired.title", "This invitation expired", "Cette invitation a expiré"),
	("chat.screen.notice.joinRefused.invitationExpired.description", "Ask the host to invite you again.", "Demandez à l’hôte de vous inviter à nouveau."),
	("chat.screen.notice.joinRefused.invitationWithdrawn.title", "This invitation was withdrawn", "Cette invitation a été retirée"),
	("chat.screen.notice.joinRefused.invitationWithdrawn.description", "The host took it back. Ask the host to invite you again.", "L’hôte l’a annulée. Demandez-lui de vous inviter à nouveau."),
	("chat.screen.notice.joinRefused.invitationUsed.title", "This invitation was already used", "Cette invitation a déjà servi"),
	("chat.screen.notice.joinRefused.invitationUsed.description", "An invitation is accepted once. Ask the host to invite you again.", "Une invitation ne s’accepte qu’une fois. Demandez à l’hôte de vous inviter à nouveau."),
	("chat.screen.notice.joinRefused.invitationOtherEmail.title", "This invitation is for another email", "Cette invitation vise une autre adresse"),
	("chat.screen.notice.joinRefused.invitationOtherEmail.description", "Sign in with the email the host invited, then accept it again.", "Connectez-vous avec l’adresse invitée par l’hôte, puis acceptez-la à nouveau."),
	("chat.screen.notice.joinRefused.couldNotAccept.title", "Couldn’t accept this invitation", "Impossible d’accepter cette invitation"),
	("chat.screen.notice.joinRefused.couldNotAccept.description", "Kiroshi’s cloud didn’t take it. Check your connection, then try again.", "Le cloud de Kiroshi ne l’a pas prise en compte. Vérifiez votre connexion, puis réessayez."),
	("chat.screen.notice.joinRefused.noInvitation.title", "You’re not invited to this space", "Vous n’êtes pas invité dans cet espace"),
	("chat.screen.notice.joinRefused.noInvitation.description", "Your account holds no invitation for it. Ask the host to invite you, then open the link again.", "Votre compte n’a aucune invitation pour lui. Demandez à l’hôte de vous inviter, puis rouvrez le lien."),
	("chat.screen.notice.joinRefused.notInRoster.title", "This computer isn’t in the space", "Cet ordinateur ne fait pas partie de l’espace"),
	("chat.screen.notice.joinRefused.notInRoster.description", "Its host didn’t list this computer. Ask the host for a new link.", "Son hôte n’a pas listé cet ordinateur. Demandez un nouveau lien à l’hôte."),
	("chat.screen.notice.joinRefused.badSignature.title", "Couldn’t trust this space’s answer", "Impossible de se fier à la réponse de cet espace"),
	("chat.screen.notice.joinRefused.badSignature.description", "Its keys didn’t match what the host signed. Ask the host for a new link.", "Ses clés ne correspondent pas à ce que l’hôte a signé. Demandez un nouveau lien à l’hôte."),
	("chat.screen.notice.joinRefused.removedByRotation.title", "This computer was removed from the space", "Cet ordinateur a été retiré de l’espace"),
	("chat.screen.notice.joinRefused.removedByRotation.description", "Its host no longer lets it in. Ask the host for a new link to join again.", "Son hôte ne l’accepte plus. Demandez un nouveau lien à l’hôte pour le rejoindre."),
	("chat.screen.notice.joinRefused.waitingForHost.title", "Waiting for {{host}}", "En attente de {{host}}"),
	("chat.screen.notice.joinRefused.waitingForHost.description", "This space opens once {{host}} is online and lets this computer in.", "Cet espace s’ouvrira dès que {{host}} sera en ligne et acceptera cet ordinateur."),
	("chat.screen.notice.joinRefused.waitingForHost.reasons.relayUnreachable", "Couldn’t reach Kiroshi to open this space on {{host}}’s computer. Check your connection.", "Impossible de joindre Kiroshi pour ouvrir cet espace sur l’ordinateur de {{host}}. Vérifiez votre connexion."),
	("chat.screen.notice.joinRefused.waitingForHost.reasons.rekeySendFailed", "Couldn’t get this space’s key, {{host}} hasn’t answered. Ask them to open Kiroshi on their computer.", "Impossible d’obtenir la clé de cet espace, {{host}} n’a pas répondu. Demandez-lui d’ouvrir Kiroshi sur son ordinateur."),
	("chat.screen.notice.joinRefused.waitingForHost.reasons.hostSilent", "This space isn’t open yet, {{host}} hasn’t let this computer in. Ask them to open Kiroshi on their computer.", "Cet espace n’est pas encore ouvert, {{host}} n’a pas encore accepté cet ordinateur. Demandez-lui d’ouvrir Kiroshi sur son ordinateur."),
	("chat.screen.notice.joinRefused.waitingForHost.reasons.socketClosed", "Couldn’t open this space, {{host}} hasn’t answered. Ask them to open Kiroshi on their computer.", "Impossible d’ouvrir cet espace, {{host}} n’a pas répondu. Demandez-lui d’ouvrir Kiroshi sur son ordinateur."),
	("chat.screen.notice.joinRefused.waitingForHost.reasons.rekeyNotVerified", "Couldn’t verify the key {{host}} sent for this space. Ask them for a new link.", "Impossible de vérifier la clé envoyée par {{host}} pour cet espace. Demandez-lui un nouveau lien."),
	("chat.screen.notice.joinRefused.waitingForHost.reasons.notMember", "Kiroshi says this account isn’t a member of this space. Ask {{host}} for a new link.", "Kiroshi indique que ce compte n’est pas membre de cet espace. Demandez un nouveau lien à {{host}}."),
	("chat.screen.notice.joinRefused.waitingForHost.reasons.unknownInstance", "Kiroshi doesn’t host this space anymore. Ask {{host}} to turn hosting on again.", "Kiroshi n’héberge plus cet espace. Demandez à {{host}} de réactiver l’hébergement."),
	("chat.screen.notice.joinRefused.waitingForHost.reasons.deviceKeysUnreadable", "Couldn’t read this computer’s device keys to connect to {{host}}. Quit Kiroshi and open it again.", "Impossible de lire les clés de cet ordinateur pour joindre {{host}}. Quittez Kiroshi et rouvrez-le."),
	("chat.screen.notice.joinRefused.waitingForHost.reasons.deviceAwaitingApproval", "This computer isn’t approved to connect to {{host}} yet. Approve it from another computer signed in to your account.", "Cet ordinateur n’est pas encore approuvé pour joindre {{host}}. Approuvez-le depuis un autre ordinateur connecté à votre compte."),
	("chat.screen.notice.joinRefused.waitingForHost.reasons.socketUrlFailed", "Couldn’t get this space’s address on {{host}}’s computer from Kiroshi. Quit Kiroshi and open it again.", "Impossible d’obtenir auprès de Kiroshi l’adresse de cet espace sur l’ordinateur de {{host}}. Quittez Kiroshi et rouvrez-le."),
	("chat.screen.notice.joinRefused.waitingForHost.reasons.rosterMissing", "This space’s member list hasn’t arrived from {{host}} yet. Ask them to open Kiroshi on their computer.", "La liste des membres de cet espace n’a pas encore été envoyée par {{host}}. Demandez-lui d’ouvrir Kiroshi sur son ordinateur."),
	("chat.screen.notice.joinRefused.waitingForHost.reasons.keychainReadFailed", "Couldn’t read the key {{host}} sent for this space from this computer’s secure storage. Quit Kiroshi, open it again, and allow access if this computer asks.", "Impossible de lire la clé de cet espace envoyée par {{host}} dans le stockage sécurisé de cet ordinateur. Quittez Kiroshi, rouvrez-le et autorisez l’accès si cet ordinateur le demande."),
	("chat.screen.notice.joinRefused.keyStore.title", "Couldn’t read this computer’s keys", "Impossible de lire les clés de cet ordinateur"),
	("chat.screen.notice.joinRefused.keyStore.description", "Kiroshi couldn’t open the keys it keeps for your spaces. Restart Kiroshi, then try again.", "Kiroshi n’a pas pu ouvrir les clés qu’il garde pour vos espaces. Redémarrez Kiroshi, puis réessayez."),
	("chat.screen.notice.joinRefused.unexpected.title", "Something went wrong with {{space}}", "Un problème est survenu avec {{space}}"),
	("chat.screen.notice.joinRefused.unexpected.description", "Kiroshi couldn’t finish the request. Try again in a moment.", "Kiroshi n’a pas pu terminer la demande. Réessayez dans un instant."),
	("chat.screen.notice.readFailed", "Couldn’t load earlier messages", "Impossible de charger les messages précédents"),
	("chat.screen.transport.binaryNotFound", "Couldn’t find the agent. Reinstall Kiroshi.", "Impossible de trouver l’agent. Réinstallez Kiroshi."),
	("chat.screen.transport.binaryNotFoundNamed", "Couldn’t find {{name}}. Reinstall Kiroshi.", "Impossible de trouver {{name}}. Réinstallez Kiroshi."),
	("chat.screen.transport.notAuthenticated", "You’re signed out of your Claude subscription. Sign in to Claude, then restart the conversation.", "Vous êtes déconnecté de votre abonnement Claude. Connectez-vous à Claude, puis relancez la conversation."),
	("chat.screen.transport.notConnected", "Your Claude account isn’t connected. Sign in to keep talking.", "Votre compte Claude n’est pas connecté. Connectez-vous pour continuer."),
	("chat.screen.transport.authCheckFailed", "Couldn’t check your sign-in ({{detail}}). Restart the session.", "Impossible de vérifier votre connexion ({{detail}}). Redémarrez la session."),
	("chat.screen.transport.spawnFailed", "Couldn’t start the agent ({{detail}}). Restart the session.", "Impossible de démarrer l’agent ({{detail}}). Redémarrez la session."),
	("chat.screen.transport.spawnFailedNamed", "Couldn’t start {{name}} ({{detail}}). Restart the session.", "Impossible de démarrer {{name}} ({{detail}}). Redémarrez la session."),
	("chat.screen.transport.startupTimeout", "The agent didn’t answer within {{timeoutMs}} ms. Restart the session.", "L’agent n’a pas répondu en {{timeoutMs}} ms. Redémarrez la session."),
	("chat.screen.transport.startupTimeoutNamed", "{{name}} didn’t answer within {{timeoutMs}} ms. Restart the session.", "{{name}} n’a pas répondu en {{timeoutMs}} ms. Redémarrez la session."),
	("chat.screen.transport.crashed", "The agent exited (code {{code}}). Restart the session.", "L’agent s’est arrêté (code {{code}}). Redémarrez la session."),
	("chat.screen.transport.crashedNamed", "{{name}} exited (code {{code}}). Restart the session.", "{{name}} s’est arrêté (code {{code}}). Redémarrez la session."),
	("chat.screen.transport.crashedDetail", "The agent exited (code {{code}}): {{detail}}. Restart the session.", "L’agent s’est arrêté (code {{code}}) : {{detail}}. Redémarrez la session."),
	("chat.screen.transport.crashedDetailNamed", "{{name}} exited (code {{code}}): {{detail}}. Restart the session.", "{{name}} s’est arrêté (code {{code}}) : {{detail}}. Redémarrez la session."),
	("chat.screen.transport.crashedUnknownCode", "The agent exited (code unknown). Restart the session.", "L’agent s’est arrêté (code inconnu). Redémarrez la session."),
	("chat.screen.transport.crashedUnknownCodeNamed", "{{name}} exited (code unknown). Restart the session.", "{{name}} s’est arrêté (code inconnu). Redémarrez la session."),
	("chat.screen.transport.crashedUnknownCodeDetail", "The agent exited (code unknown): {{detail}}. Restart the session.", "L’agent s’est arrêté (code inconnu) : {{detail}}. Redémarrez la session."),
	("chat.screen.transport.crashedUnknownCodeDetailNamed", "{{name}} exited (code unknown): {{detail}}. Restart the session.", "{{name}} s’est arrêté (code inconnu) : {{detail}}. Redémarrez la session."),
	("chat.screen.transport.resumeFailed", "The agent started a new session. Keep going, your messages are still here.", "L’agent a démarré une nouvelle session. Continuez, vos messages sont toujours là."),
	("chat.screen.transport.resumeFailedNamed", "{{name}} started a new session. Keep going, your messages are still here.", "{{name}} a démarré une nouvelle session. Continuez, vos messages sont toujours là."),
	("chat.screen.transport.invalidFrame", "Skipped an unreadable frame ({{detail}}). Keep going.", "Trame illisible ignorée ({{detail}}). Continuez."),
	("chat.screen.transport.settingsRejected", "Couldn’t apply settings.json ({{detail}}). Fix it, then restart the session.", "Impossible d’appliquer settings.json ({{detail}}). Corrigez-le, puis redémarrez la session."),
	("chat.screen.transport.serverEnvRejected", "{{detail}}. The other applications still run, so fix this one and restart the session.", "{{detail}}. Les autres applications tournent toujours, corrigez celui-ci puis redémarrez la session."),
	("chat.screen.transport.notStarted", "No session is running. Start a session to continue.", "Aucune session en cours. Démarrez une session pour continuer."),
	("chat.screen.transport.turnAlreadyRunning", "A turn is already running. Wait for it or stop it.", "Un tour est déjà en cours. Attendez-le ou arrêtez-le."),
	("chat.screen.transport.transitionInProgress", "The session is already changing. Wait a moment.", "La session change déjà. Patientez un instant."),
	("chat.screen.transport.noActiveTurn", "There’s no turn to stop.", "Aucun tour à arrêter."),
	("chat.screen.transport.staleRuntimeSession", "That session was replaced. Keep going in the current one.", "Cette session a été remplacée. Continuez dans la session actuelle."),
	("chat.screen.transport.unknownPermission", "Couldn’t match this approval request ({{id}}). Dismiss it.", "Demande d’autorisation introuvable ({{id}}). Ignorez-la."),
	("chat.screen.transport.writeFailed", "Couldn’t send the message ({{detail}}). Retry.", "Impossible d’envoyer le message ({{detail}}). Réessayez."),
	("chat.screen.transport.runLapsedSilent", "The agent stopped answering, so its reply ended. Send your message again.", "L’agent ne répondait plus, sa réponse s’est arrêtée. Renvoyez votre message."),
	("chat.screen.transport.runLapsedSilentNamed", "{{name}} stopped answering, so its reply ended. Send your message again.", "{{name}} ne répondait plus, sa réponse s’est arrêtée. Renvoyez votre message."),
	("chat.screen.transport.runLapsedInterrupt", "The agent didn’t answer the stop, so its reply ended. Send your message again.", "L’agent n’a pas répondu à l’arrêt, sa réponse s’est arrêtée. Renvoyez votre message."),
	("chat.screen.transport.runLapsedInterruptNamed", "{{name}} didn’t answer the stop, so its reply ended. Send your message again.", "{{name}} n’a pas répondu à l’arrêt, sa réponse s’est arrêtée. Renvoyez votre message."),
	("chat.screen.transport.runLapsedTasksPending", "The agent waited {{minutes}} minutes on its background work, so its reply ended. Send your message again.", "L’agent a attendu {{minutes}} minutes son travail en arrière-plan, sa réponse s’est arrêtée. Renvoyez votre message."),
	("chat.screen.transport.runLapsedTasksPendingNamed", "{{name}} waited {{minutes}} minutes on its background work, so its reply ended. Send your message again.", "{{name}} a attendu {{minutes}} minutes son travail en arrière-plan, sa réponse s’est arrêtée. Renvoyez votre message."),
	("chat.screen.transport.readFailed", "Couldn’t load earlier messages ({{detail}}). Retry.", "Impossible de charger les messages précédents ({{detail}}). Réessayez."),
	("chat.screen.transport.unknownFailure", "Something went wrong ({{detail}}). Retry.", "Une erreur est survenue ({{detail}}). Réessayez."),
	("chat.screen.attachment.megabytes", "{{size}} MB", "{{size}} Mo"),
	("chat.screen.attachment.storage", "Couldn’t save the files ({{failure}}). Attach them again.", "Impossible d’enregistrer les fichiers ({{failure}}). Joignez-les à nouveau."),
	("chat.screen.attachment.unknownConversation", "This conversation no longer exists. Reopen the agent and attach them again.", "Cette conversation n’existe plus. Rouvrez l’agent et joignez-les à nouveau."),
	("chat.screen.attachment.tooMany", "A message takes up to {{limit}} files, and {{staged}} are staged. Remove some.", "Un message accepte {{limit}} fichiers au maximum, et {{staged}} sont en attente. Retirez-en."),
	("chat.screen.attachment.tooLarge", "{{name}} is over the {{limit}} file limit. Attach a smaller one.", "{{name}} dépasse la limite de {{limit}} par fichier. Joignez un fichier plus léger."),
	("chat.screen.attachment.tooLargeTogether", "These files total {{bytes}}, over the {{limit}} message limit. Remove some.", "Ces fichiers totalisent {{bytes}}, au-delà de la limite de {{limit}} par message. Retirez-en."),
	("chat.screen.attachment.unreadable", "Couldn’t read {{name}}. Attach it again.", "Impossible de lire {{name}}. Joignez-le à nouveau."),
	("chat.screen.attachment.unwritable", "Couldn’t save the files ({{detail}}). Attach them again.", "Impossible d’enregistrer les fichiers ({{detail}}). Joignez-les à nouveau."),
	("chat.namelessConversation.separator", ", ", ", "),
	("chat.conversationSeating.failed", "Couldn’t change who is in this conversation. Retry.", "Impossible de changer qui est dans cette conversation. Réessayez."),
	("chat.conversationSeating.refused", "Couldn’t bring {{name}} into this conversation. Retry.", "Impossible de faire venir {{name}} dans cette conversation. Réessayez."),
	("chat.conversationSeating.unavailable", "Couldn’t load the agents to suggest. Retry.", "Impossible de charger les agents à suggérer. Réessayez."),
	("chat.conversationSettings.breadcrumb", "Settings", "Paramètres"),
	("chat.conversationSettings.untitled", "Untitled conversation", "Conversation sans nom"),
	("chat.conversationSettings.tab.general", "General", "Général"),
	("chat.conversationSettings.tab.participants", "Participants", "Participants"),
	("chat.conversationSettings.tab.instructions", "Instructions", "Instructions"),
	("chat.conversationSettings.tab.danger", "Danger zone", "Zone de danger"),
	("chat.conversationSettings.name.label", "Name", "Nom"),
	("chat.conversationSettings.name.placeholder", "What this conversation is about", "Le sujet de cette conversation"),
	("chat.conversationSettings.icon.label", "Icon", "Icône"),
	("chat.conversationSettings.icon.option.MessageSquare", "Message", "Message"),
	("chat.conversationSettings.icon.option.Bug", "Bug", "Bogue"),
	("chat.conversationSettings.icon.option.Rocket", "Rocket", "Fusée"),
	("chat.conversationSettings.icon.option.ShieldKey", "Shield", "Bouclier"),
	("chat.conversationSettings.icon.option.Pen", "Pen", "Stylo"),
	("chat.conversationSettings.icon.option.FileText", "File", "Fichier"),
	("chat.conversationSettings.icon.option.Download", "Download", "Téléchargement"),
	("chat.conversationSettings.icon.option.Laptop", "Laptop", "Ordinateur"),
	("chat.conversationSettings.icon.option.Smartphone", "Phone", "Téléphone"),
	("chat.conversationSettings.icon.option.BookOpen", "Book", "Livre"),
	("chat.conversationSettings.icon.option.CreditCard", "Card", "Carte"),
	("chat.conversationSettings.icon.option.Megaphone", "Megaphone", "Mégaphone"),
	("chat.conversationSettings.icon.option.PanelLeft", "Panel", "Panneau"),
	("chat.conversationSettings.icon.option.Code", "Code", "Code"),
	("chat.conversationSettings.icon.option.Terminal", "Terminal", "Terminal"),
	("chat.conversationSettings.icon.option.Server", "Server", "Serveur"),
	("chat.conversationSettings.icon.option.Globe", "Globe", "Globe"),
	("chat.conversationSettings.icon.option.Palette", "Palette", "Palette"),
	("chat.conversationSettings.icon.option.Lightbulb", "Lightbulb", "Ampoule"),
	("chat.conversationSettings.icon.option.ChartLine", "Chart", "Graphique"),
	("chat.conversationSettings.icon.option.Calendar", "Calendar", "Calendrier"),
	("chat.conversationSettings.icon.option.Users", "People", "Personnes"),
	("chat.conversationSettings.icon.option.Flag", "Flag", "Drapeau"),
	("chat.conversationSettings.icon.option.Sparkles", "Sparkles", "Étincelles"),
	("chat.conversationSettings.instructions.label", "Instructions", "Instructions"),
	("chat.conversationSettings.instructions.placeholder", "What every agent in this conversation should keep in mind", "Ce que chaque agent de cette conversation doit garder en tête"),
	("chat.conversationSettings.participants.label", "In this conversation", "Dans cette conversation"),
	("chat.conversationSettings.participants.lead", "Lead", "Meneur"),
	("chat.conversationSettings.participants.promote", "Give the lead to {{name}}", "Confier la conduite à {{name}}"),
	("chat.conversationSettings.participants.dismiss", "Dismiss {{name}}", "Retirer {{name}}"),
	("chat.conversationSettings.participants.last", "A conversation needs at least one agent.", "Une conversation a besoin d’au moins un agent."),
	("chat.conversationSettings.danger.delete", "Delete conversation", "Supprimer la conversation"),
	("chat.conversationSettings.danger.description", "Its messages are deleted; its agents stay in the space. This can’t be undone.", "Ses messages sont supprimés ; ses agents restent dans l’espace. C’est irréversible."),
	("chat.conversationSettings.danger.confirm.title", "Delete {{name}}?", "Supprimer {{name}} ?"),
	("chat.conversationSettings.danger.failed", "Couldn’t delete this conversation. Retry.", "Impossible de supprimer cette conversation. Réessayez."),
	("chat.activity.panel.close", "Close activity", "Fermer l’activité"),
	("chat.activity.panel.label", "Activity", "Activité"),
	("chat.activity.panel.toggle", "Toggle activity", "Afficher ou masquer l’activité"),
	("chat.activity.panel.title", "Activity", "Activité"),
	("chat.activity.missions.group.waiting", "Waiting on you", "En attente de vous"),
	("chat.activity.missions.group.inProgress", "In progress", "En cours"),
	("chat.activity.missions.group.earlierToday", "Earlier today", "Plus tôt aujourd’hui"),
	("chat.activity.routines.title", "Routines", "Routines"),
	("chat.activity.routines.back", "Back to the activity", "Retour à l’activité"),
	("chat.activity.runs.reported", "reported", "rapporté"),
	("chat.activity.empty.title", "Nothing is running here", "Rien ne tourne ici"),
	("chat.activity.empty.description", "Missions and routine reports in this conversation show up here.", "Les missions et les rapports de routine de cette conversation s’affichent ici."),
	("chat.activity.failure.missions.title", "Couldn’t load missions", "Impossible de charger les missions"),
	("chat.activity.failure.missions.description", "The missions are still there; only the list didn’t load.", "Les missions sont toujours là ; seule la liste n’a pas pu se charger."),
	("chat.activity.failure.routines.title", "Couldn’t load routines", "Impossible de charger les routines"),
	("chat.activity.failure.routines.description", "The routines keep running; only the list didn’t load.", "Les routines continuent de tourner ; seule la liste n’a pas pu se charger."),
	("chat.activity.failure.activity.title", "Couldn’t load the activity", "Impossible de charger l’activité"),
	("chat.activity.failure.activity.description", "Missions and routines are still there; only the list didn’t load.", "Les missions et les routines sont toujours là ; seule la liste n’a pas pu se charger."),
	("chat.activity.failure.write.title", "Couldn’t update the routine", "Impossible de modifier la routine"),
	("chat.activity.failure.write.description", "Your change wasn’t saved. Retry.", "Votre modification n’est pas enregistrée. Réessayez."),
	("chat.routines.form.new", "Create a routine", "Créer une routine"),
	("chat.routines.form.edit", "Edit routine", "Modifier la routine"),
	("chat.routines.form.back", "Back to the routines", "Retour aux routines"),
	("chat.routines.form.save", "Save routine", "Enregistrer la routine"),
	("chat.routines.form.title.label", "Title", "Titre"),
	("chat.routines.form.title.placeholder", "Morning digest", "Résumé du matin"),
	("chat.routines.form.instruction.label", "Instruction", "Instruction"),
	("chat.routines.form.instruction.placeholder", "Read what came in overnight and write a short digest.", "Lis ce qui est arrivé cette nuit et écris un court résumé."),
	("chat.routines.form.source.label", "Trigger", "Déclencheur"),
	("chat.routines.form.source.placeholder", "Pick what triggers this routine", "Choisissez ce qui déclenche cette routine"),
	("chat.routines.form.source.tied", "You can’t change the trigger of a saved routine.", "Vous ne pouvez pas changer le déclencheur d’une routine enregistrée."),
	("chat.routines.form.expression.label", "Cron expression", "Expression cron"),
	("chat.routines.form.expression.placeholder", "0 8 * * *", "0 8 * * *"),
	("chat.routines.form.path.label", "Watched path", "Fichier surveillé"),
	("chat.routines.form.path.placeholder", "/notes/CHANGELOG.md", "/notes/CHANGELOG.md"),
	("chat.routines.form.webhook.url", "Address", "Adresse"),
	("chat.routines.form.webhook.key", "Key", "Clé"),
	("chat.routines.form.webhook.header", "Header name", "Nom de l’en-tête"),
	("chat.routines.form.webhook.copy", "Copy the {{field}} of this routine", "Copier {{field}} de cette routine"),
	("chat.routines.form.webhook.copied", "{{field}} copied", "{{field}} copié"),
	("chat.routines.form.webhook.reading", "Loading the address and key…", "Chargement de l’adresse et de la clé…"),
	("chat.routines.form.webhook.pending", "Save the routine to get its address, key and header name.", "Enregistrez la routine pour obtenir son adresse, sa clé et son nom d’en-tête."),
	("chat.routines.form.webhook.failure", "Couldn’t load the address and key. Reopen the routine to retry.", "Impossible de charger l’adresse et la clé. Rouvrez la routine pour réessayer."),
	("chat.routines.form.filter.label", "Filter", "Filtre"),
	("chat.routines.form.filter.everyEvent", "Every event runs this routine.", "Chaque événement déclenche cette routine."),
	("chat.routines.form.filter.add", "Add a row", "Ajouter une ligne"),
	("chat.routines.form.filter.row", "Row {{rank}}", "Ligne {{rank}}"),
	("chat.routines.form.filter.remove", "Remove the row on {{field}}", "Supprimer la ligne sur {{field}}"),
	("chat.routines.form.filter.matchMode.label", "Run when", "Déclencher quand"),
	("chat.routines.form.filter.matchMode.all", "Every row holds", "Chaque ligne est vraie"),
	("chat.routines.form.filter.matchMode.any", "Any row holds", "Une ligne est vraie"),
	("chat.routines.form.filter.field.label", "Field", "Champ"),
	("chat.routines.form.filter.field.otherPath", "Another path", "Un autre chemin"),
	("chat.routines.form.filter.path.label", "Path", "Chemin"),
	("chat.routines.form.filter.path.placeholder", "sender.address", "sender.address"),
	("chat.routines.form.filter.operator.label", "Operator", "Opérateur"),
	("chat.routines.form.filter.value.label", "Value", "Valeur"),
	("chat.routines.form.filter.value.true", "True", "Vrai"),
	("chat.routines.form.filter.value.false", "False", "Faux"),
	("chat.routines.form.filter.operators.exists", "is present", "est présent"),
	("chat.routines.form.filter.operators.not_exists", "is absent", "est absent"),
	("chat.routines.form.filter.operators.equals", "equals", "est égal à"),
	("chat.routines.form.filter.operators.not_equals", "doesn’t equal", "est différent de"),
	("chat.routines.form.filter.operators.contains", "contains", "contient"),
	("chat.routines.form.filter.operators.not_contains", "doesn’t contain", "ne contient pas"),
	("chat.routines.form.filter.operators.starts_with", "starts with", "commence par"),
	("chat.routines.form.filter.operators.ends_with", "ends with", "finit par"),
	("chat.routines.form.filter.operators.gt", "is greater than", "est supérieur à"),
	("chat.routines.form.filter.operators.lt", "is less than", "est inférieur à"),
	("chat.routines.form.filter.fieldTypes.string", "text", "texte"),
	("chat.routines.form.filter.fieldTypes.number", "number", "nombre"),
	("chat.routines.form.filter.fieldTypes.boolean", "boolean", "booléen"),
	("chat.routines.form.filter.fieldTypes.datetime", "date", "date"),
	("chat.routines.form.error.blankTitle", "A routine needs a title.", "Une routine a besoin d’un titre."),
	("chat.routines.form.error.blankInstruction", "A routine needs an instruction.", "Une routine a besoin d’une instruction."),
	("chat.routines.form.error.blankValue", "This row needs a value.", "Cette ligne a besoin d’une valeur."),
	("chat.routines.form.error.untypedComparison", "Pick a field the trigger declares.", "Choisissez un champ déclaré par le déclencheur."),
	("chat.routines.form.error.unreadableExpression", "Couldn’t read this as a schedule. Check the cron expression.", "Impossible de lire cet horaire. Vérifiez l’expression cron."),
	("chat.routines.form.error.unsupportedOperator", "{{operator}} doesn’t fit a {{fieldType}} field. Pick another operator.", "{{operator}} ne convient pas à un champ {{fieldType}}. Choisissez un autre opérateur."),
	("chat.routines.detail.title", "Routine", "Routine"),
	("chat.routines.detail.back", "Back to the routine", "Retour à la routine"),
	("chat.routines.detail.runNow.action", "Run now", "Exécuter maintenant"),
	("chat.routines.detail.runNow.refusal.disabled", "This routine is off. Turn it on to run it.", "Cette routine est désactivée. Activez-la pour l’exécuter."),
	("chat.routines.detail.runNow.refusal.filter", "Nothing ran: the filter let nothing through.", "Rien n’a tourné : le filtre n’a rien laissé passer."),
	("chat.routines.detail.runNow.refusal.dedupeValueMissing", "Nothing ran: this trigger can’t tell events apart.", "Rien n’a tourné : ce déclencheur ne distingue pas les événements."),
	("chat.routines.detail.runNow.refusal.alreadySeen", "Nothing ran: this event already ran.", "Rien n’a tourné : cet événement a déjà été exécuté."),
	("chat.routines.detail.history.label", "Run history", "Historique des exécutions"),
	("chat.routines.detail.history.reading", "Loading runs…", "Chargement des exécutions…"),
	("chat.routines.detail.history.counted_one", "{{count}} run", "{{count}} exécution"),
	("chat.routines.detail.history.counted_other", "{{count}} runs", "{{count}} exécutions"),
	("chat.routines.detail.history.page_one", "Last {{count}} run read", "{{count}} dernière exécution lue"),
	("chat.routines.detail.history.page_other", "Last {{count}} runs read", "{{count}} dernières exécutions lues"),
	("chat.routines.detail.history.reported_one", "{{count}} report", "{{count}} rapport"),
	("chat.routines.detail.history.reported_other", "{{count}} reports", "{{count}} rapports"),
	("chat.routines.detail.history.latest", "Most recent {{when}}", "La plus récente {{when}}"),
	("chat.routines.detail.history.outcome.reported", "Reported", "Rapportée"),
	("chat.routines.detail.history.outcome.nothing", "Nothing to report", "Rien à rapporter"),
	("chat.routines.detail.history.outcome.skipped", "Skipped", "Ignorée"),
	("chat.routines.detail.history.outcome.failed", "Failed", "Échouée"),
	("chat.routines.detail.history.outcome.running", "Running", "En cours"),
	("chat.routines.detail.history.empty.title", "No run recorded", "Aucune exécution enregistrée"),
	("chat.routines.detail.history.empty.description", "Runs show up here as they happen.", "Les exécutions s’affichent ici au fur et à mesure."),
	("chat.routines.detail.history.failure.title", "Couldn’t load runs", "Impossible de charger les exécutions"),
	("chat.routines.detail.history.failure.description", "The routine keeps running; only its run history didn’t load.", "La routine continue de tourner ; seul son historique n’a pas pu se charger."),
	("chat.routines.row.delete", "Delete {{title}}", "Supprimer {{title}}"),
	("chat.routines.row.stopped", "Stopped itself", "S’est arrêtée"),
	("chat.routines.confirm.title", "Delete {{title}}?", "Supprimer {{title}} ?"),
	("chat.routines.confirm.description", "Its run history is deleted; its past reports stay in the conversation. This can’t be undone.", "Son historique d’exécutions est supprimé ; ses rapports passés restent dans la conversation. C’est irréversible."),
	("chat.routines.confirm.label", "Delete routine", "Supprimer la routine"),
	("chat.routines.confirm.failure", "Couldn’t delete the routine. Retry.", "Impossible de supprimer la routine. Réessayez."),
	("chat.routines.empty.title", "No routine yet", "Aucune routine"),
	("chat.routines.empty.description", "Set a routine to run an agent on a schedule or when a file changes.", "Créez une routine pour faire travailler un agent selon un horaire ou quand un fichier change."),
	("chat.routines.leave.title", "Leave without saving?", "Quitter sans enregistrer ?"),
	("chat.routines.leave.description", "You’ll lose your unsaved changes. The saved routine stays as it is.", "Vous perdrez vos modifications non enregistrées. La routine enregistrée reste telle quelle."),
	("chat.routines.leave.action", "Leave", "Quitter"),
	("chat.missions.panel.empty.title", "No missions yet", "Aucune mission pour l’instant"),
	("chat.missions.panel.empty.description", "Missions your agents open in this space show up here.", "Les missions ouvertes par vos agents dans cet espace apparaissent ici."),
	("chat.missions.state.waiting_human", "Blocked on you", "Bloquée sur vous"),
	("chat.missions.state.ready_to_merge", "Ready to merge", "Prête à fusionner"),
	("chat.missions.state.failed", "Blocked", "Bloquée"),
	("chat.missions.state.done", "Completed", "Terminée"),
	("chat.missions.state.closed", "Closed", "Fermée"),
	("chat.missions.live", "Working now", "En cours maintenant"),
	("chat.missions.event.source.bot", "The agent", "L’agent"),
	("chat.missions.event.source.reader", "You", "Vous"),
	("chat.missions.event.source.agent", "The coding session", "La session de code"),
	("chat.missions.event.source.github", "GitHub", "GitHub"),
	("chat.missions.event.line.opened", "Mission opened by {{source}}", "Mission ouverte par {{source}}"),
	("chat.missions.event.line.note", "Note recorded by {{source}}", "Note enregistrée par {{source}}"),
	("chat.missions.event.line.agent_asked", "Question sent to the coding session by {{source}}", "Question envoyée à la session de code par {{source}}"),
	("chat.missions.event.line.answered", "Answer sent to the coding session", "Réponse envoyée à la session de code"),
	("chat.missions.event.line.escalated", "Escalated to a human by {{source}}", "Remontée à un humain par {{source}}"),
	("chat.missions.event.line.ready", "Marked ready to merge by {{source}}", "Marquée prête à fusionner par {{source}}"),
	("chat.missions.event.line.checks_failed", "Red checks reported by {{source}}", "Vérifications en échec signalées par {{source}}"),
	("chat.missions.event.line.failed", "Failure reported by {{source}}", "Échec signalé par {{source}}"),
	("chat.missions.event.line.closed", "Mission closed by {{source}}", "Mission fermée par {{source}}"),
	("chat.missions.event.line.dismissed", "Closed by you", "Fermée par vous"),
	("chat.missions.event.line.reopened", "Mission reopened by {{source}}", "Mission rouverte par {{source}}"),
	("chat.missions.event.kind.opened", "Opened", "Ouverture"),
	("chat.missions.event.kind.note", "Note", "Note"),
	("chat.missions.event.kind.agent_asked", "Question", "Question"),
	("chat.missions.event.kind.answered", "Answer", "Réponse"),
	("chat.missions.event.kind.escalated", "Escalated", "Remontée"),
	("chat.missions.event.kind.ready", "Ready to merge", "Prête à fusionner"),
	("chat.missions.event.kind.checks_failed", "Checks failed", "Vérifications en échec"),
	("chat.missions.event.kind.failed", "Failed", "En échec"),
	("chat.missions.event.kind.closed", "Closed", "Fermée"),
	("chat.missions.event.kind.dismissed", "Closed", "Fermée"),
	("chat.missions.event.kind.reopened", "Reopened", "Rouverte"),
	("chat.missions.event.link", "Open {{host}}", "Ouvrir {{host}}"),
	("chat.missions.activity.commitsAhead_one", "{{count}} commit ahead", "{{count}} commit d'avance"),
	("chat.missions.activity.commitsAhead_other", "{{count}} commits ahead", "{{count}} commits d'avance"),
	("chat.missions.pullRequest.label", "#{{number}}", "#{{number}}"),
	("chat.missions.pullRequest.open", "Open pull request #{{number}}", "Ouvrir la pull request n° {{number}}"),
	("chat.missions.menu.label", "Mission actions", "Actions de la mission"),
	("chat.missions.menu.open", "Open mission", "Ouvrir la mission"),
	("chat.missions.menu.openPullRequest", "Open PR", "Ouvrir la PR"),
	("chat.missions.menu.copy", "Copy", "Copier"),
	("chat.missions.menu.copyKind.issue_id", "Issue ID", "Identifiant du ticket"),
	("chat.missions.menu.copyKind.branch", "Branch", "Branche"),
	("chat.missions.menu.copyKind.pull_request_url", "PR URL", "URL de la PR"),
	("chat.missions.menu.copyKind.workspace_path", "Workspace path", "Chemin de l’espace de travail"),
	("chat.missions.menu.messageAgent", "Message the coding session", "Écrire à la session de code"),
	("chat.missions.menu.stopAgent", "Stop the coding session", "Arrêter la session de code"),
	("chat.missions.menu.answer", "Answer the question", "Répondre à la question"),
	("chat.missions.menu.close", "Close", "Fermer"),
	("chat.missions.menu.reopen", "Reopen", "Rouvrir"),
	("chat.missions.menu.copied", "{{kind}} copied", "{{kind}} copié"),
	("chat.missions.menu.failed.openPullRequest", "Couldn’t open the pull request", "Impossible d’ouvrir la pull request"),
	("chat.missions.menu.failed.copy", "Couldn’t copy to the clipboard", "Impossible de copier dans le presse-papiers"),
	("chat.missions.menu.failed.stopAgent", "Couldn’t stop the coding session", "Impossible d’arrêter la session de code"),
	("chat.missions.menu.failed.close", "Couldn’t close the mission", "Impossible de fermer la mission"),
	("chat.missions.menu.failed.reopen", "Couldn’t reopen the mission", "Impossible de rouvrir la mission"),
	("chat.missions.card.open", "Open the mission: {{objective}}", "Ouvrir la mission : {{objective}}"),
	("chat.missions.header.tools", "Tools", "Outils"),
	("chat.missions.header.back", "Back to the conversation", "Retour à la conversation"),
	("chat.missions.header.openedAt", "opened {{time}}", "ouverte {{time}}"),
	("chat.missions.feed.label", "Mission conversation", "Conversation de la mission"),
	("chat.missions.summons.working", "Opened by the mission", "Ouvert par la mission"),
	("chat.missions.summons.waiting_bot", "Opened by the coding session’s question", "Ouvert par la question de la session de code"),
	("chat.missions.composer.placeholder", "Answer this mission…", "Répondre à cette mission…"),
	("chat.missions.failure.read.title", "Couldn’t load this mission", "Impossible de charger cette mission"),
	("chat.missions.failure.read.description", "The mission is still there; only this view didn’t load.", "La mission est toujours là ; seule cette vue n’a pas pu se charger."),
	("chat.missions.failure.send.title", "Couldn’t send your answer", "Impossible d’envoyer votre réponse"),
	("chat.missions.failure.send.description", "Send it again.", "Renvoyez-la."),
	("chat.missions.failure.run.title", "Couldn’t run the agent on its mission", "Impossible de lancer l’agent sur sa mission"),
	("chat.missions.failure.run.description", "Open its conversation to check on it.", "Ouvrez sa conversation pour vérifier."),
	("chat.onboarding.account.header", "Your Claude account", "Votre compte Claude"),
	("chat.onboarding.account.question", "Use the account already on your computer?", "Utiliser le compte déjà présent sur votre ordinateur ?"),
	("chat.onboarding.account.use.label", "Use this account", "Utiliser ce compte"),
	("chat.onboarding.account.use.description", "Signed in with your Claude subscription, under your own login.", "Connecté avec votre abonnement Claude, sous votre propre session."),
	("chat.onboarding.account.another.label", "Use another account", "Utiliser un autre compte"),
	("chat.onboarding.account.another.description", "Sign in again with a different one.", "Reconnectez-vous avec un autre compte."),
	("chat.onboarding.access.header", "Your Claude account", "Votre compte Claude"),
	("chat.onboarding.access.question", "How do you want to connect?", "Comment voulez-vous vous connecter ?"),
	("chat.onboarding.access.signIn.label", "Sign in with Claude", "Se connecter avec Claude"),
	("chat.onboarding.access.signIn.description", "Opens your browser once. Works with your Pro or Max subscription.", "Ouvre votre navigateur une fois. Fonctionne avec votre abonnement Pro ou Max."),
	("chat.onboarding.access.apiKey.label", "Paste an API key", "Coller une clé API"),
	("chat.onboarding.access.apiKey.description", "Pay per use, with nothing to sign in to.", "Paiement à l’usage, sans connexion."),
	("chat.onboarding.code.header", "Sign in", "Connexion"),
	("chat.onboarding.code.question", "Paste the code Claude gave you", "Collez le code que Claude vous a donné"),
	("chat.onboarding.code.link", "Open this link and sign in", "Ouvrez ce lien et connectez-vous"),
	("chat.onboarding.code.entry", "Then paste the code it gives you", "Puis collez le code qu’il vous donne"),
	("chat.onboarding.code.exit", "Paste a key instead", "Coller une clé à la place"),
	("chat.onboarding.apiKey.header", "API key", "Clé API"),
	("chat.onboarding.apiKey.question", "Paste your Anthropic API key", "Collez votre clé API Anthropic"),
	("chat.onboarding.apiKey.entry", "Key", "Clé"),
	("chat.onboarding.apiKey.placeholder", "sk-ant-…", "sk-ant-…"),
	("chat.onboarding.apiKey.exit", "Sign in instead", "Se connecter à la place"),
	("chat.onboarding.signInFailed.header", "Sign in", "Connexion"),
	("chat.onboarding.signInFailed.question", "Try again, or use a key instead?", "Réessayer, ou utiliser une clé à la place ?"),
	("chat.onboarding.signInFailed.title", "Couldn’t sign you in", "Impossible de vous connecter"),
	("chat.onboarding.signInFailed.retry.label", "Try again", "Réessayer"),
	("chat.onboarding.signInFailed.retry.description", "Opens your browser once more.", "Ouvre votre navigateur une nouvelle fois."),
	("chat.onboarding.connection.keyFailed.title", "Couldn’t use that key", "Impossible d’utiliser cette clé"),
	("chat.onboarding.connection.keyFailed.sentence", "That key was refused, so nothing was saved.", "Cette clé a été refusée, donc rien n’a été enregistré."),
	("chat.onboarding.connection.keyFailed.anotherKey", "Try another key", "Essayer une autre clé"),
	("chat.onboarding.connection.keyFailed.anotherKeyDescription", "Paste a different Anthropic API key.", "Collez une autre clé API Anthropic."),
	("chat.onboarding.connection.keyFailed.signIn", "Sign in instead", "Se connecter à la place"),
	("chat.onboarding.arrival.failure", "{{name}} couldn’t say hello", "{{name}} n’a pas pu dire bonjour"),
	("chat.onboarding.arrival.firstCompanionMissing", "Couldn’t meet your first agent. Restart Kiroshi, then try again.", "Impossible de rencontrer votre premier agent. Redémarrez Kiroshi, puis réessayez."),
	("chat.onboarding.arrival.unknownCompanion", "the agent isn’t on this computer", "l’agent n’est pas sur cet ordinateur"),
	("chat.onboarding.intro.skip", "Skip intro", "Passer l’intro"),
	("chat.onboarding.intro.back", "Back", "Retour"),
	("chat.onboarding.intro.next", "Next", "Suivant"),
	("chat.onboarding.intro.getStarted", "Get started", "Commencer"),
	("chat.onboarding.intro.progress", "Intro progress", "Progression de l’intro"),
	("chat.onboarding.intro.position", "Step {{step}} of {{total}}", "Étape {{step}} sur {{total}}"),
	("chat.onboarding.intro.companions.title", "Agents do the work with you", "Des agents travaillent avec vous"),
	("chat.onboarding.intro.companions.body", "Each agent has a name, a job and a memory of its own. Hand it something and it keeps at it, on your computer.", "Chaque agent a un nom, un métier et sa propre mémoire. Confiez-lui quelque chose et il s’y tient, sur votre ordinateur."),
	("chat.onboarding.intro.companions.atlas.name", "Atlas", "Atlas"),
	("chat.onboarding.intro.companions.atlas.job", "Reviews code", "Relit le code"),
	("chat.onboarding.intro.companions.juniper.name", "Juniper", "Juniper"),
	("chat.onboarding.intro.companions.juniper.job", "Keeps the docs", "Tient la documentation"),
	("chat.onboarding.intro.companions.wren.name", "Wren", "Wren"),
	("chat.onboarding.intro.companions.wren.job", "Writes release notes", "Rédige les notes de version"),
	("chat.onboarding.intro.conversations.title", "Conversations, then missions", "Des conversations, puis des missions"),
	("chat.onboarding.intro.conversations.body", "Talk with one agent or several at once. Long work becomes a mission you can follow while you do something else.", "Parlez avec un agent ou plusieurs à la fois. Un long travail devient une mission que vous suivez pendant que vous faites autre chose."),
	("chat.onboarding.intro.conversations.thread", "Launch week", "Semaine de lancement"),
	("chat.onboarding.intro.conversations.ask", "Can you two get the docs ready for Friday?", "Vous pouvez préparer la doc pour vendredi, tous les deux ?"),
	("chat.onboarding.intro.conversations.reply", "On it. I’ll run the release notes as a mission.", "C’est parti. Je lance les notes de version en mission."),
	("chat.onboarding.intro.conversations.mission", "Release notes for 2.4", "Notes de version de la 2.4"),
	("chat.onboarding.intro.conversations.missionDetail", "Mission · Wren · 3 of 5 sections drafted", "Mission · Wren · 3 sections sur 5 rédigées"),
	("chat.onboarding.intro.conversations.status", "Working", "En cours"),
	("chat.onboarding.intro.spaces.title", "Spaces keep work apart", "Les Spaces séparent le travail"),
	("chat.onboarding.intro.spaces.body", "Each Space has its own agents, conversations and colour. Keep one to yourself, or share it with the people you work with.", "Chaque Space a ses agents, ses conversations et sa couleur. Gardez-en un pour vous, ou partagez-le avec les personnes qui travaillent avec vous."),
	("chat.onboarding.intro.spaces.work.name", "Work", "Travail"),
	("chat.onboarding.intro.spaces.work.detail", "Shared with 3 people", "Partagé avec 3 personnes"),
	("chat.onboarding.intro.spaces.personal.name", "Personal", "Perso"),
	("chat.onboarding.intro.spaces.personal.detail", "Only you", "Vous uniquement"),
	("chat.onboarding.intro.tools.title", "Your tools, where you allow them", "Vos outils, là où vous les autorisez"),
	("chat.onboarding.intro.tools.body", "Give an agent a Folder to work in, the Applications it may use and the Secrets it needs. Nothing beyond what you hand it.", "Donnez à un agent un Dossier où travailler, les Applications qu’il peut utiliser et les Secrets dont il a besoin. Rien au-delà de ce que vous lui confiez."),
	("chat.onboarding.intro.tools.folders", "Folders", "Dossiers"),
	("chat.onboarding.intro.tools.foldersDetail", "~/Code/orbit-web", "~/Code/orbit-web"),
	("chat.onboarding.intro.tools.applications", "Applications", "Applications"),
	("chat.onboarding.intro.tools.applicationsDetail", "GitHub, Linear, Notion", "GitHub, Linear, Notion"),
	("chat.onboarding.intro.tools.secrets", "Secrets", "Secrets"),
	("chat.onboarding.intro.tools.secretsDetail", "LINEAR_API_KEY", "LINEAR_API_KEY"),
	("chat.onboarding.connect.foundIn", "{{plan}} · found in Claude Code", "{{plan}} · trouvé dans Claude Code"),
	("chat.onboarding.connect.provider.title", "Connect the model provider", "Connecter le fournisseur de modèle"),
	("chat.onboarding.connect.provider.body", "Your agents need a model to think with. Use your Claude subscription, or a key.", "Vos agents ont besoin d’un modèle pour réfléchir. Utilisez votre abonnement Claude, ou une clé."),
	("chat.onboarding.connect.browser.body", "Your browser opened claude.ai. Sign in there with your Pro or Max subscription, then paste the code it shows you.", "Votre navigateur a ouvert claude.ai. Connectez-vous avec votre abonnement Pro ou Max, puis collez le code qu’il vous affiche."),
	("chat.onboarding.connect.browser.waiting", "Waiting for you to sign in, in your browser…", "En attente de votre connexion, dans votre navigateur…"),
	("chat.onboarding.connect.browser.checking", "Checking the code with Claude…", "Vérification du code avec Claude…"),
	("chat.onboarding.connect.browser.placeholder", "Code from Claude", "Code de Claude"),
	("chat.onboarding.connect.browser.reopen", "Open the sign-in page again", "Rouvrir la page de connexion"),
	("chat.onboarding.connect.continue", "Continue", "Continuer"),
	("chat.onboarding.connect.connecting", "Connecting…", "Connexion…"),
	("chat.onboarding.connect.failed.cancelled", "The sign-in was cancelled. Try again, or paste a key instead.", "La connexion a été annulée. Réessayez, ou collez une clé à la place."),
	("chat.onboarding.connect.failed.timedOut", "The sign-in timed out. Try again, or paste a key instead.", "La connexion a expiré. Réessayez, ou collez une clé à la place."),
	("chat.onboarding.connect.failed.linkRefused", "The sign-in link was refused. Try again, or paste a key instead.", "Le lien de connexion a été refusé. Réessayez, ou collez une clé à la place."),
	("chat.onboarding.connect.agentMissing.title", "Couldn’t find the agent", "Impossible de trouver l’agent"),
	("chat.onboarding.connect.agentMissing.body", "Kiroshi can’t start without it. Reinstall Kiroshi, then open it again.", "Kiroshi ne peut pas démarrer sans lui. Réinstallez Kiroshi, puis rouvrez-le."),
	("chat.onboarding.connect.agentMissing.download", "Download Kiroshi again", "Télécharger Kiroshi à nouveau"),
	("chat.onboarding.connect.key.body", "Pay per use, with nothing to sign in to. Create a key in the Anthropic Console.", "Paiement à l’usage, sans connexion. Créez une clé dans la console Anthropic."),
	("common.boot.status", "Starting Kiroshi", "Démarrage de Kiroshi"),
	("common.spaces.unavailable.title", "Couldn’t load your spaces", "Impossible de charger vos espaces"),
	("common.spaces.unavailable.description", "Your agents are still there.", "Vos agents sont toujours là."),
	("common.spaces.leave.title", "Leave {{name}}?", "Quitter {{name}} ?"),
	("common.spaces.leave.description", "Nothing is deleted on the host. You can join again with a new invitation.", "Rien n’est supprimé sur l’hôte. Vous pourrez le rejoindre à nouveau avec une nouvelle invitation."),
	("common.spaces.leave.action", "Leave space", "Quitter l’espace"),
	("common.spaces.unnamed.host", "the host", "l’hôte"),
	("common.spaces.unnamed.space", "this space", "cet espace"),
	("common.skipLink", "Skip to the conversation", "Passer à la conversation"),
	("common.agent.unnamed", "Agent", "Agent"),
	("common.dialog.close", "Close", "Fermer"),
	("common.confirm.cancel", "Cancel", "Annuler"),
	("common.sidebar.label", "Sidebar", "Barre latérale"),
	("common.sidebar.toggle", "Toggle sidebar", "Afficher ou masquer la barre latérale"),
	("common.sidebar.close", "Close sidebar", "Fermer la barre latérale"),
	("common.sidebar.resize", "Resize sidebar", "Redimensionner la barre latérale"),
	("common.windowControls.minimize", "Minimize", "Réduire"),
	("common.windowControls.maximize", "Maximize", "Agrandir"),
	("common.windowControls.restore", "Restore", "Restaurer"),
	("common.windowControls.close", "Close", "Fermer"),
	("common.windowControls.failure.minimize", "Couldn’t minimize Kiroshi.", "Impossible de réduire Kiroshi."),
	("common.windowControls.failure.maximize", "Couldn’t maximize or restore Kiroshi.", "Impossible d’agrandir ou de restaurer Kiroshi."),
	("common.windowControls.failure.close", "Couldn’t close Kiroshi.", "Impossible de fermer Kiroshi."),
	("common.windowControls.failure.state", "Couldn’t tell whether Kiroshi is maximized.", "Impossible de savoir si Kiroshi est agrandi."),
	("common.windowControls.failure.snap", "Snap layouts are unavailable on the maximize button.", "Les dispositions d’ancrage sont indisponibles sur le bouton Agrandir."),
	("common.windowControls.failure.pointer", "The maximize button can’t show hover or press feedback.", "Le bouton Agrandir ne peut pas afficher le survol ni l’appui."),
	("common.titleBar.tabs", "Tabs", "Onglets"),
	("common.titleBar.back", "Back", "Précédent"),
	("common.titleBar.forward", "Forward", "Suivant"),
	("common.titleBar.newTab", "New tab", "Nouvel onglet"),
	("common.titleBar.closeTab", "Close tab", "Fermer l’onglet"),
	("common.titleBar.closeTabNamed", "Close {{title}}", "Fermer {{title}}"),
	("common.titleBar.pinTab", "Pin tab", "Épingler l’onglet"),
	("common.titleBar.unpinTab", "Unpin tab", "Désépingler l’onglet"),
	("common.titleBar.closeOtherTabs", "Close other tabs", "Fermer les autres onglets"),
	("common.titleBar.duplicateTab", "Duplicate tab", "Dupliquer l’onglet"),
	("common.titleBar.reopenClosedTab", "Reopen last closed tab", "Rouvrir le dernier onglet fermé"),
	("common.titleBar.moveTabToNewWindow", "Move to new window", "Déplacer dans une nouvelle fenêtre"),
	("common.titleBar.moveTabFailed.title", "Couldn’t open a new window", "Impossible d’ouvrir une nouvelle fenêtre"),
	("common.titleBar.moveTabFailed.description", "The tab stayed here. Choose Move to new window from the tab’s menu to try again.", "L’onglet est resté ici. Choisissez Déplacer dans une nouvelle fenêtre dans le menu de l’onglet pour réessayer."),
	("common.titleBar.moveTabFailed.descriptionWithReason", "The tab stayed here ({{reason}}). Choose Move to new window from the tab’s menu to try again.", "L’onglet est resté ici ({{reason}}). Choisissez Déplacer dans une nouvelle fenêtre dans le menu de l’onglet pour réessayer."),
	("common.titleBar.redockTabFailed.title", "Couldn’t move the tab", "Impossible de déplacer l’onglet"),
	("common.titleBar.redockTabFailed.description", "The tab stayed here. Drag it to the other window again.", "L’onglet est resté ici. Faites-le de nouveau glisser vers l’autre fenêtre."),
	("common.titleBar.revealTabFailed.title", "Couldn’t bring the other window forward", "Impossible d’afficher l’autre fenêtre"),
	("common.titleBar.revealTabFailed.description", "The conversation is open in another window. Switch to that window to see it.", "La conversation est ouverte dans une autre fenêtre. Passez à cette fenêtre pour la voir."),
	("common.titleBar.reopenWindowFailed.title", "Couldn’t reopen a window", "Impossible de rouvrir une fenêtre"),
	("common.titleBar.reopenWindowFailed.description", "Its tabs were closed. Open them again from the sidebar.", "Ses onglets ont été fermés. Rouvrez-les depuis la barre latérale."),
	("common.titleBar.reopenWindowFailed.descriptionWithReason", "Its tabs were closed ({{reason}}). Open them again from the sidebar.", "Ses onglets ont été fermés ({{reason}}). Rouvrez-les depuis la barre latérale."),
	("common.titleBar.pinTabShortcut", "Ctrl⇧P", "Ctrl⇧P"),
	("common.titleBar.newTabShortcut", "⌘T", "⌘T"),
	("common.titleBar.reopenClosedTabShortcut", "⌘⇧T", "⌘⇧T"),
	("common.titleBar.closeTabShortcut", "⌘W", "⌘W"),
	("common.titleBar.closeOtherTabsShortcut", "⌘⌥W", "⌘⌥W"),
	("common.titleBar.more", "{{count}} more", "{{count}} de plus"),
	("common.titleBar.tabNeedsYou", "{{title}}, needs you", "{{title}}, vous attend"),
	("common.titleBar.tabMoved", "{{title}} moved to position {{position}} of {{count}}", "{{title}} déplacé en position {{position}} sur {{count}}"),
	("common.notice.label", "Notices", "Avis"),
	("common.notice.close", "Close notice", "Fermer l’avis"),
	("common.notice.copy", "Copy", "Copier"),
	("common.notice.copied", "Copied", "Copié"),
	("common.notice.copyFailed", "Couldn’t copy the report. Press Copy again.", "Impossible de copier le rapport. Appuyez à nouveau sur Copier."),
	("common.devices.approval.title", "{{device}} wants to use your account", "{{device}} veut utiliser votre compte"),
	("common.devices.approval.body", "If it’s yours, approve it and it’ll read your spaces. If it isn’t, choose Not me and it’ll be signed out.", "Si c’est le vôtre, approuvez-le et il lira vos espaces. Sinon, choisissez Pas moi et il sera déconnecté."),
	("common.devices.approval.notMe", "Not me", "Pas moi"),
	("common.devices.approval.approve", "Approve", "Approuver"),
	("common.devices.approval.approving", "Approving…", "Approbation…"),
	("common.devices.approval.retry", "Try again", "Réessayer"),
	("common.devices.approval.failed", "Couldn’t approve {{device}}. Check your connection and try again.", "Impossible d’approuver {{device}}. Vérifiez votre connexion et réessayez."),
	("common.devices.approval.approved.title", "{{device}} is approved", "{{device}} est approuvé"),
	("common.devices.approval.approved.description", "It reads your spaces now. Remove it any time in Your devices.", "Il lit vos espaces maintenant. Retirez-le quand vous voulez dans Vos appareils."),
	("common.devices.approval.rejected.title", "{{device}} was signed out", "{{device}} a été déconnecté"),
	("common.devices.approval.rejected.description", "It never read your spaces.", "Il n’a jamais lu vos espaces."),
	("common.devices.newDevice.thisDevice", "This device", "Cet appareil"),
	("common.devices.newDevice.noOtherDevice", "I don't have another device", "Je n’ai pas d’autre appareil"),
	("common.devices.newDevice.signOut", "Sign out", "Se déconnecter"),
	("common.devices.newDevice.waiting.title", "Approve this device from one you already use", "Approuvez cet appareil depuis un appareil que vous utilisez déjà"),
	("common.devices.newDevice.waiting.body", "Open Kiroshi on a device that uses {{email}} and approve this one.", "Ouvrez Kiroshi sur un appareil qui utilise {{email}} et approuvez celui-ci."),
	("common.devices.newDevice.waiting.status", "Waiting for approval…", "En attente d’approbation…"),
	("common.devices.newDevice.code.title", "Check your email", "Consultez vos e-mails"),
	("common.devices.newDevice.code.body", "We sent a 6-digit code to {{email}}. Enter it to approve this computer. It works once, for 5 minutes.", "Nous avons envoyé un code à 6 chiffres à {{email}}. Saisissez-le pour approuver cet ordinateur. Il ne sert qu’une fois, pendant 5 minutes."),
	("common.devices.newDevice.code.label", "6-digit code", "Code à 6 chiffres"),
	("common.devices.newDevice.code.approve", "Approve this computer", "Approuver cet ordinateur"),
	("common.devices.newDevice.code.resend", "Send a new code", "Envoyer un nouveau code"),
	("common.devices.newDevice.expired.title", "The request expired", "La demande a expiré"),
	("common.devices.newDevice.expired.body", "Nobody approved this device in time. Ask again, then approve it on a device you already use.", "Personne n’a approuvé cet appareil à temps. Redemandez, puis approuvez-le sur un appareil que vous utilisez déjà."),
	("common.devices.newDevice.expired.askAgain", "Ask again", "Redemander"),
	("common.devices.newDevice.rejected.title", "This device wasn't approved", "Cet appareil n’a pas été approuvé"),
	("common.devices.newDevice.rejected.body", "Someone using {{email}} said it isn't theirs, so it was signed out.", "Une personne utilisant {{email}} a indiqué qu’il n’était pas à elle, il a donc été déconnecté."),
	("common.devices.newDevice.rejected.backToSignIn", "Back to sign in", "Retour à la connexion"),
	("common.claudeImport.listLabel", "Your Claude Code setup", "Votre configuration Claude Code"),
	("common.claudeImport.select.title", "Bring in your Claude Code setup", "Récupérez votre configuration Claude Code"),
	("common.claudeImport.select.body", "Found in ~/.claude on your computer. Everything is selected; uncheck what you’d rather leave behind.", "Trouvé dans ~/.claude sur votre ordinateur. Tout est sélectionné ; décochez ce que vous préférez laisser."),
	("common.claudeImport.select.bodyMany", "Found {{count}} agents and more in ~/.claude. Everything is selected; uncheck what you’d rather leave behind.", "{{count}} agents et plus trouvés dans ~/.claude. Tout est sélectionné ; décochez ce que vous préférez laisser."),
	("common.claudeImport.select.nothingSelected", "Nothing is selected. Check what you want to bring in, or skip for now.", "Rien n’est sélectionné. Cochez ce que vous voulez récupérer, ou passez cette étape."),
	("common.claudeImport.select.namesTaken.one", "One name is already taken in Kiroshi. It comes in with a number; nothing gets replaced.", "Un nom est déjà pris dans Kiroshi. Il arrive avec un numéro ; rien n’est remplacé."),
	("common.claudeImport.select.namesTaken.two", "Two names are already taken in Kiroshi. Those come in with a number; nothing gets replaced.", "Deux noms sont déjà pris dans Kiroshi. Ils arrivent avec un numéro ; rien n’est remplacé."),
	("common.claudeImport.select.namesTaken.other", "{{count}} names are already taken in Kiroshi. Those come in with a number; nothing gets replaced.", "{{count}} noms sont déjà pris dans Kiroshi. Ils arrivent avec un numéro ; rien n’est remplacé."),
	("common.claudeImport.select.import", "Import", "Importer"),
	("common.claudeImport.select.importItems_one", "Import {{count}} item", "Importer {{count}} élément"),
	("common.claudeImport.select.importItems_other", "Import {{count}} items", "Importer {{count}} éléments"),
	("common.claudeImport.select.importCompanions_one", "Import {{count}} agent", "Importer {{count}} agent"),
	("common.claudeImport.select.importCompanions_other", "Import {{count}} agents", "Importer {{count}} agents"),
	("common.claudeImport.select.skip", "Skip for now", "Passer pour l’instant"),
	("common.claudeImport.select.notNow", "Not now", "Pas maintenant"),
	("common.claudeImport.fromSettings.title", "Import from Claude Code", "Importer depuis Claude Code"),
	("common.claudeImport.fromSettings.body", "Found in ~/.claude. What’s already in Kiroshi stays as it is; only what’s new is selected.", "Trouvé dans ~/.claude. Ce qui est déjà dans Kiroshi reste tel quel ; seul ce qui est nouveau est sélectionné."),
	("common.claudeImport.fromSettings.cancel", "Cancel", "Annuler"),
	("common.claudeImport.importing.title", "Bringing in your setup", "Récupération de votre configuration"),
	("common.claudeImport.importing.body", "{{done}} of {{count}} done. This takes a few seconds.", "{{done}} sur {{count}} terminés. Cela prend quelques secondes."),
	("common.claudeImport.importing.action", "Importing…", "Import en cours…"),
	("common.claudeImport.done.title", "Your setup is in", "Votre configuration est là"),
	("common.claudeImport.done.companions_one", "{{companions}} is ready.", "{{companions}} est prêt."),
	("common.claudeImport.done.companions_other", "{{companions}} are ready.", "{{companions}} sont prêts."),
	("common.claudeImport.done.companionsWith_one", "{{companions}} is ready, with {{extras}}.", "{{companions}} est prêt, avec {{extras}}."),
	("common.claudeImport.done.companionsWith_other", "{{companions}} are ready, with {{extras}}.", "{{companions}} sont prêts, avec {{extras}}."),
	("common.claudeImport.done.instructions", "your CLAUDE.md", "votre CLAUDE.md"),
	("common.claudeImport.done.instructionsAndSkills_one", "Your CLAUDE.md and {{count}} skill are ready.", "Votre CLAUDE.md et {{count}} compétence sont prêts."),
	("common.claudeImport.done.instructionsAndSkills_other", "Your CLAUDE.md and {{count}} skills are ready.", "Votre CLAUDE.md et {{count}} compétences sont prêts."),
	("common.claudeImport.done.onlyInstructions", "Your CLAUDE.md is ready.", "Votre CLAUDE.md est prêt."),
	("common.claudeImport.done.onlySkills_one", "{{count}} skill is ready.", "{{count}} compétence est prête."),
	("common.claudeImport.done.onlySkills_other", "{{count}} skills are ready.", "{{count}} compétences sont prêtes."),
	("common.claudeImport.done.continue", "Continue", "Continuer"),
	("common.claudeImport.partlyFailed.title", "Most of your setup is in", "L’essentiel de votre configuration est là"),
	("common.claudeImport.partlyFailed.body", "The {{name}} skill didn’t come in. Try it again, or add it later from Settings.", "La compétence {{name}} n’a pas été récupérée. Réessayez, ou ajoutez-la plus tard depuis les Réglages."),
	("common.claudeImport.partlyFailed.bodyNamed", "{{name}} didn’t come in. Try it again, or add it later from Settings.", "{{name}} n’a pas été récupéré. Réessayez, ou ajoutez-le plus tard depuis les Réglages."),
	("common.claudeImport.partlyFailed.retry", "Try {{name}} again", "Réessayer {{name}}"),
	("common.claudeImport.unreadable.title", "Couldn’t read ~/.claude", "Impossible de lire ~/.claude"),
	("common.claudeImport.unreadable.body", "Kiroshi wasn’t allowed to open that folder, so nothing came in. Let your account read it, then try again.", "Kiroshi n’a pas eu le droit d’ouvrir ce dossier, donc rien n’a été récupéré. Autorisez votre compte à le lire, puis réessayez."),
	("common.claudeImport.unreadable.retry", "Try again", "Réessayer"),
	("common.claudeImport.row.inKiroshi", "Already in Kiroshi.", "Déjà dans Kiroshi."),
	("common.claudeImport.row.skills_one", "{{count}} skill", "{{count}} compétence"),
	("common.claudeImport.row.skills_other", "{{count}} skills", "{{count}} compétences"),
	("common.claudeImport.row.newSkills_one", "{{count}} new skill", "{{count}} nouvelle compétence"),
	("common.claudeImport.row.newSkills_other", "{{count}} new skills", "{{count}} nouvelles compétences"),
	("common.claudeImport.row.nameTaken", "{{name}} already lives in Kiroshi, so this one comes in as {{renamed}}. Rename it after.", "{{name}} existe déjà dans Kiroshi, donc celui-ci arrive sous le nom {{renamed}}. Renommez-le ensuite."),
	("common.claudeImport.row.companionNameTaken", "You already have an agent named {{name}}, so this one comes in as {{renamed}}.", "Vous avez déjà un agent nommé {{name}}, donc celui-ci arrive sous le nom {{renamed}}."),
	("common.claudeImport.row.unparsable", "Couldn’t bring it in: its {{file}} doesn’t parse.", "Impossible de le récupérer : son {{file}} est illisible."),
	("common.claudeImport.row.type.companion", "Agent", "Agent"),
	("common.claudeImport.row.type.instructions", "Instructions", "Instructions"),
	("common.claudeImport.row.type.skill", "Skills", "Compétences"),
	("common.claudeImport.row.status.done", "Done", "Terminé"),
	("common.claudeImport.row.status.pending", "In progress", "En cours"),
	("common.claudeImport.row.status.failed", "Failed", "Échec"),
	("common.notification.question", "Asked you a question", "Vous a posé une question"),
	("common.notification.approval", "Wants your approval", "Demande votre autorisation"),
	("common.notification.finishedTurn", "Finished its turn", "A terminé son tour"),
	("common.notification.spoke", "{{name}} said something", "{{name}} a dit quelque chose"),
	("common.notification.mission.question", "Asked you a question on {{ticket}}", "Vous a posé une question sur {{ticket}}"),
	("common.notification.mission.waiting_human", "Needs you on {{ticket}}", "A besoin de vous sur {{ticket}}"),
	("common.notification.mission.ready_to_merge", "{{ticket}} is ready to merge", "{{ticket}} est prête à fusionner"),
	("common.notification.failure.clicks", "Notifications won’t open their conversation. Restart Kiroshi to fix it.", "Les notifications n’ouvriront plus leur conversation. Redémarrez Kiroshi pour corriger."),
	("common.notification.failure.focus", "Notifications may show while you’re in Kiroshi. Restart Kiroshi to fix it.", "Des notifications peuvent s’afficher pendant que vous êtes dans Kiroshi. Redémarrez Kiroshi pour corriger."),
	("common.notification.failure.reveal", "Couldn’t bring Kiroshi to the front. Switch to it yourself.", "Impossible de mettre Kiroshi au premier plan. Basculez-y vous-même."),
	("common.notification.failure.send", "Couldn’t show a notification. Check Kiroshi’s notification permission.", "Impossible d’afficher une notification. Vérifiez l’autorisation de notification de Kiroshi."),
	("common.update.badge.available", "Download update", "Télécharger la mise à jour"),
	("common.update.badge.downloading", "Downloading update", "Téléchargement de la mise à jour"),
	("common.update.badge.ready", "Restart to update", "Redémarrer pour mettre à jour"),
	("common.update.badge.readyVersion", "Restart to update to {{version}}", "Redémarrer pour passer à la version {{version}}"),
	("common.update.badge.botsBusy_one", "{{count}} agent is still running. Stop it to restart.", "{{count}} agent tourne encore. Arrêtez-le pour redémarrer."),
	("common.update.badge.botsBusy_other", "{{count}} agents are still running. Stop them to restart.", "{{count}} agents tournent encore. Arrêtez-les pour redémarrer."),
	("common.update.badge.error", "Update failed, download again", "Mise à jour échouée, télécharger à nouveau"),
	("common.update.badge.retry", "Download the update again", "Télécharger à nouveau la mise à jour"),
	("common.library.title", "Library", "Bibliothèque"),
	("common.library.subtitle", "Every image and document in this Space.", "Chaque image et chaque document de cet espace."),
	("common.library.search", "Search the Library", "Rechercher dans la Bibliothèque"),
	("common.library.import", "Import", "Importer"),
	("common.library.newDocument", "New document", "Nouveau document"),
	("common.library.newBoard", "New board", "Nouveau tableau"),
	("common.library.boardFileReplaced", "An edit to {{name}} made outside Kiroshi was replaced by the live board.", "Une modification de {{name}} faite hors de Kiroshi a été remplacée par le tableau en direct."),
	("common.library.blankBoard", "Blank board", "Tableau vierge"),
	("common.library.saved.title", "Saved to Library", "Enregistré dans la Bibliothèque"),
	("common.library.saved.image", "Image saved to Library", "Image enregistrée dans la Bibliothèque"),
	("common.library.saved.open", "Open", "Ouvrir"),
	("common.library.filters.label", "Show", "Afficher"),
	("common.library.filters.all", "All", "Tout"),
	("common.library.filters.images", "Images", "Images"),
	("common.library.filters.documents", "Documents", "Documents"),
	("common.library.filters.boards", "Boards", "Tableaux"),
	("common.library.noResult.images", "No images in this Library yet.", "Aucune image dans cette Bibliothèque pour l’instant."),
	("common.library.noResult.documents", "No documents in this Library yet.", "Aucun document dans cette Bibliothèque pour l’instant."),
	("common.library.noResult.boards", "No boards in this Library yet.", "Aucun tableau dans cette Bibliothèque pour l’instant."),
	("common.library.noResult.search", "Nothing matches “{{query}}”.", "Rien ne correspond à « {{query}} »."),
	("common.library.start", "Start a document", "Commencer un document"),
	("common.library.templates.blank.name", "Blank document", "Document vierge"),
	("common.library.templates.blank.description", "An empty page, with nothing to fill in.", "Une page vide, sans rien à remplir."),
	("common.library.templates.blank.placeholder", "Start writing. Use # for a heading and - for a list.", "Commencez à écrire. Tapez # pour un titre et - pour une liste."),
	("common.library.templates.brief.name", "Brief", "Brief"),
	("common.library.templates.brief.preview", "# Brief\n\nWhat we’re making, who it’s for and why it matters now.\n\n## Goal\n\nThe outcome this work commits to.\n\n## Done when\n\nWhat has to be true to call it finished.", "# Brief\n\nCe que l’on fabrique, pour qui et pourquoi maintenant.\n\n## Objectif\n\nLe résultat sur lequel ce travail s’engage.\n\n## Terminé quand\n\nCe qui doit être vrai pour le dire fini."),
	("common.library.templates.brief.description", "Goal and done when, for a piece of work.", "L’objectif et quand c’est terminé, pour un travail."),
	("common.library.templates.brief.intro", "What you’re making, who it’s for and why now.", "Ce que l’on fabrique, pour qui et pourquoi maintenant."),
	("common.library.templates.brief.goal.heading", "Goal", "Objectif"),
	("common.library.templates.brief.goal.placeholder", "The outcome this work commits to, in a sentence or two.", "Le résultat sur lequel ce travail s’engage, en une ou deux phrases."),
	("common.library.templates.brief.doneWhen.heading", "Done when", "Terminé quand"),
	("common.library.templates.brief.doneWhen.placeholder", "What has to be true to call it finished.", "Ce qui doit être vrai pour le dire fini."),
	("common.library.templates.meetingNotes.name", "Meeting notes", "Notes de réunion"),
	("common.library.templates.meetingNotes.preview", "# Meeting notes\n\n## Decisions\n\n- One line per decision\n- The reason behind it\n\n## Next steps\n\nWho does what, and by when.", "# Notes de réunion\n\n## Décisions\n\n- Une ligne par décision\n- La raison qui la porte\n\n## Prochaines étapes\n\nQui fait quoi, et pour quand."),
	("common.library.templates.meetingNotes.description", "Decisions and next steps, dated today.", "Les décisions et les prochaines étapes, datées du jour."),
	("common.library.templates.meetingNotes.title", "Meeting notes, {{date, datetime(day: numeric)}} {{date, datetime(month: long)}}", "Notes de réunion, {{date, datetime(day: numeric)}} {{date, datetime(month: long)}}"),
	("common.library.templates.meetingNotes.intro", "Who was there, and what the meeting was for.", "Qui était là, et à quoi servait la réunion."),
	("common.library.templates.meetingNotes.decisions.heading", "Decisions", "Décisions"),
	("common.library.templates.meetingNotes.decisions.placeholder", "One line per decision, with the reason behind it.", "Une ligne par décision, avec la raison qui la porte."),
	("common.library.templates.meetingNotes.nextSteps.heading", "Next steps", "Prochaines étapes"),
	("common.library.templates.meetingNotes.nextSteps.placeholder", "Who does what, and by when.", "Qui fait quoi, et pour quand."),
	("common.library.templates.checklist.name", "Checklist", "Liste de contrôle"),
	("common.library.templates.checklist.preview", "# Checklist\n\n- Draft the outline\n- Gather the references\n- Ship the final version", "# Liste de contrôle\n\n- Rédiger le plan\n- Réunir les références\n- Livrer la version finale"),
	("common.library.templates.checklist.description", "Things to tick off, one per line.", "Des choses à cocher, une par ligne."),
	("common.library.templates.checklist.item", "One thing to do per line.", "Une chose à faire par ligne."),
	("common.library.picker.subtitle", "Start blank, or from a template you can change afterwards.", "Partez d’une page vierge, ou d’un modèle que vous pourrez changer ensuite."),
	("common.library.picker.templates", "Templates", "Modèles"),
	("common.library.picker.cancel", "Cancel", "Annuler"),
	("common.library.picker.create", "Create document", "Créer le document"),
	("common.library.editor.untitled", "Untitled", "Sans titre"),
	("common.library.editor.created", "Created just now", "Créé à l’instant"),
	("common.library.editor.createdFrom", "Created just now from {{template}}", "Créé à l’instant à partir de {{template}}"),
	("common.library.editor.title", "Title", "Titre"),
	("common.library.editor.body", "Document text", "Texte du document"),
	("common.library.editor.toolbar.label", "Format", "Mise en forme"),
	("common.library.editor.toolbar.bold", "Bold", "Gras"),
	("common.library.editor.toolbar.italic", "Italic", "Italique"),
	("common.library.editor.toolbar.strikethrough", "Strikethrough", "Barré"),
	("common.library.editor.toolbar.code", "Code", "Code"),
	("common.library.editor.toolbar.link", "Link", "Lien"),
	("common.library.editor.toolbar.heading", "Heading", "Titre de section"),
	("common.library.editor.toolbar.list", "List", "Liste"),
	("common.library.editor.toolbar.boldShortcut", "⌘B", "⌘B"),
	("common.library.editor.toolbar.italicShortcut", "⌘I", "⌘I"),
	("common.library.editor.toolbar.strikethroughShortcut", "⌘⇧S", "⌘⇧S"),
	("common.library.editor.toolbar.codeShortcut", "⌘E", "⌘E"),
	("common.library.editor.toolbar.linkShortcut", "⌘K", "⌘K"),
	("common.library.editor.toolbar.linkField", "Link address", "Adresse du lien"),
	("common.library.editor.toolbar.confirmLink", "Add link", "Ajouter le lien"),
	("common.library.editor.blocks.types.paragraph", "Text", "Texte"),
	("common.library.editor.blocks.types.heading", "Heading", "Titre de section"),
	("common.library.editor.blocks.types.list", "List", "Liste"),
	("common.library.editor.blocks.types.checklist", "Checklist", "Liste de tâches"),
	("common.library.editor.blocks.types.quote", "Quote", "Citation"),
	("common.library.editor.blocks.types.gallery", "Gallery", "Galerie"),
	("common.library.editor.blocks.types.callout", "Callout", "Encadré"),
	("common.library.editor.blocks.types.table", "Table", "Tableau"),
	("common.library.editor.blocks.types.code", "Code", "Code"),
	("common.library.editor.blocks.types.web-page", "Web page card", "Carte de page web"),
	("common.library.editor.blocks.types.collapsible", "Collapsible sections", "Sections repliables"),
	("common.library.editor.blocks.types.other", "Block", "Bloc"),
	("common.library.editor.blocks.markdown.heading", "#", "#"),
	("common.library.editor.blocks.markdown.list", "-", "-"),
	("common.library.editor.blocks.markdown.checklist", "[]", "[]"),
	("common.library.editor.blocks.markdown.quote", ">", ">"),
	("common.library.editor.blocks.markdown.code", "```", "```"),
	("common.library.editor.blocks.slash.label", "Blocks", "Blocs"),
	("common.library.editor.blocks.slash.text", "Text", "Texte"),
	("common.library.editor.blocks.slash.rich", "Rich blocks", "Blocs enrichis"),
	("common.library.editor.blocks.slash.moveKeys", "↑↓", "↑↓"),
	("common.library.editor.blocks.slash.move", "Move", "Parcourir"),
	("common.library.editor.blocks.slash.insertKey", "↵", "↵"),
	("common.library.editor.blocks.slash.insert", "Insert", "Insérer"),
	("common.library.editor.blocks.slash.closeKey", "esc", "échap"),
	("common.library.editor.blocks.slash.close", "Close", "Fermer"),
	("common.library.editor.blocks.handle.insert", "Add a line below", "Ajouter une ligne en dessous"),
	("common.library.editor.blocks.handle.menu", "Block menu, drag to move", "Menu du bloc, glisser pour déplacer"),
	("common.library.editor.blocks.menu.turnInto", "Turn into", "Transformer en"),
	("common.library.editor.blocks.menu.duplicate", "Duplicate", "Dupliquer"),
	("common.library.editor.blocks.menu.moveUp", "Move up", "Monter"),
	("common.library.editor.blocks.menu.moveDown", "Move down", "Descendre"),
	("common.library.editor.blocks.menu.delete", "Delete", "Supprimer"),
	("common.library.editor.blocks.menu.shortcuts.mac.duplicate", "⌘D", "⌘D"),
	("common.library.editor.blocks.menu.shortcuts.mac.moveUp", "⌥⇧↑", "⌥⇧↑"),
	("common.library.editor.blocks.menu.shortcuts.mac.moveDown", "⌥⇧↓", "⌥⇧↓"),
	("common.library.editor.blocks.menu.shortcuts.mac.delete", "⌫", "⌫"),
	("common.library.editor.blocks.menu.shortcuts.other.duplicate", "Ctrl+D", "Ctrl+D"),
	("common.library.editor.blocks.menu.shortcuts.other.moveUp", "Alt+Shift+↑", "Alt+Maj+↑"),
	("common.library.editor.blocks.menu.shortcuts.other.moveDown", "Alt+Shift+↓", "Alt+Maj+↓"),
	("common.library.editor.blocks.menu.shortcuts.other.delete", "Backspace", "Retour arrière"),
	("common.library.editor.blocks.skeleton.column", "Column", "Colonne"),
	("common.library.editor.blocks.gallery.add", "Add images", "Ajouter des images"),
	("common.library.editor.blocks.gallery.hint", "Drag to reorder. The first image leads.", "Faites glisser pour réordonner. La première image ouvre la galerie."),
	("common.library.editor.blocks.gallery.addFailed", "Couldn’t add the images. Try again.", "Impossible d’ajouter les images. Réessayez."),
	("common.library.editor.blocks.gallery.tile", "Image {{position}} of {{count}}, arrow keys move it", "Image {{position}} sur {{count}}, les flèches la déplacent"),
	("common.library.editor.blocks.gallery.remove", "Remove image {{position}}", "Retirer l’image {{position}}"),
	("common.library.editor.blocks.gallery.caption", "Caption of image {{position}}", "Légende de l’image {{position}}"),
	("common.library.editor.blocks.gallery.captionPlaceholder", "Add a caption", "Ajouter une légende"),
	("common.library.editor.blocks.checklist.item", "Item {{position}}", "Élément {{position}}"),
	("common.library.editor.blocks.checklist.move", "Move item {{position}}, arrow keys move it", "Déplacer l’élément {{position}}, les flèches le déplacent"),
	("common.library.editor.blocks.callout.text", "Callout text", "Texte de l’encadré"),
	("common.library.editor.blocks.callout.tone", "Callout tone", "Ton de l’encadré"),
	("common.library.editor.blocks.table.cell", "Row {{row}}, column {{column}}", "Ligne {{row}}, colonne {{column}}"),
	("common.library.editor.blocks.table.empty", "Empty", "Vide"),
	("common.library.editor.blocks.table.addRow", "Add row", "Ajouter une ligne"),
	("common.library.editor.blocks.table.addColumn", "Add column", "Ajouter une colonne"),
	("common.library.editor.blocks.code.body", "Code", "Code"),
	("common.library.editor.blocks.code.language", "Language, {{name}}", "Langage, {{name}}"),
	("common.library.editor.blocks.code.search", "Search languages", "Rechercher un langage"),
	("common.library.editor.blocks.code.noMatch", "No language matches", "Aucun langage ne correspond"),
	("common.library.editor.blocks.code.languages.text", "Plain text", "Texte brut"),
	("common.library.editor.blocks.code.languages.bash", "Shell", "Shell"),
	("common.library.editor.blocks.code.languages.json", "JSON", "JSON"),
	("common.library.editor.blocks.code.languages.typescript", "TypeScript", "TypeScript"),
	("common.library.editor.blocks.code.languages.python", "Python", "Python"),
	("common.library.editor.blocks.code.languages.css", "CSS", "CSS"),
	("common.library.editor.blocks.code.languages.diff", "Diff", "Diff"),
	("common.library.editor.blocks.code.languages.html", "HTML", "HTML"),
	("common.library.editor.blocks.code.languages.markdown", "Markdown", "Markdown"),
	("common.library.editor.blocks.code.languages.rust", "Rust", "Rust"),
	("common.library.editor.blocks.code.languages.tsx", "TSX", "TSX"),
	("common.library.editor.blocks.code.languages.yaml", "YAML", "YAML"),
	("common.library.editor.blocks.webPage.link", "Link", "Lien"),
	("common.library.editor.blocks.webPage.updateKey", "↵", "↵"),
	("common.library.editor.blocks.webPage.update", "Update", "Mettre à jour"),
	("common.library.editor.blocks.webPage.failed", "Couldn’t load a preview of this link. Check the address, then press Return to try again.", "Impossible de charger l’aperçu de ce lien. Vérifiez l’adresse, puis appuyez sur Entrée pour réessayer."),
	("common.library.bringIn.title", "Bring in files", "Importer des fichiers"),
	("common.library.bringIn.drop", "Drop images or documents here", "Déposez des images ou des documents ici"),
	("common.library.bringIn.formats", "PNG, JPG, Markdown and plain text.", "PNG, JPG, Markdown et texte brut."),
	("common.library.bringIn.action", "Import files…", "Importer des fichiers…"),
	("common.library.drop.title_one", "Drop to add {{count}} file to the Library", "Déposez pour ajouter {{count}} fichier à la Bibliothèque"),
	("common.library.drop.title_other", "Drop to add {{count}} files to the Library", "Déposez pour ajouter {{count}} fichiers à la Bibliothèque"),
	("common.library.drop.more_one", "and {{count}} more", "et {{count}} autre"),
	("common.library.drop.more_other", "and {{count}} more", "et {{count}} autres"),
	("common.library.importing.label", "Importing {{name}}", "Importation de {{name}}"),
	("common.library.importing.detail", "Importing… {{percent}}%", "Importation… {{percent}} %"),
	("common.library.added.title_one", "{{count}} file added", "{{count}} fichier ajouté"),
	("common.library.added.title_other", "{{count}} files added", "{{count}} fichiers ajoutés"),
	("common.library.added.stillImporting_one", "{{name}} is still importing.", "{{name}} est encore en cours d’importation."),
	("common.library.added.stillImporting_other", "{{count}} files are still importing.", "{{count}} fichiers sont encore en cours d’importation."),
	("common.library.itemMenu.label", "Actions for {{name}}", "Actions pour {{name}}"),
	("common.library.itemMenu.open", "Open", "Ouvrir"),
	("common.library.itemMenu.openInNewTab", "Open in new tab", "Ouvrir dans un nouvel onglet"),
	("common.library.itemMenu.rename", "Rename", "Renommer"),
	("common.library.itemMenu.copy", "Copy", "Copier"),
	("common.library.itemMenu.download", "Download", "Télécharger"),
	("common.library.itemMenu.showInFolder", "Show in folder", "Afficher dans le dossier"),
	("common.library.itemMenu.delete", "Delete", "Supprimer"),
	("common.library.itemMenu.deleteConfirm.title", "Delete {{name}}?", "Supprimer {{name}} ?"),
	("common.library.itemMenu.deleteConfirm.description", "This can’t be undone.", "C’est irréversible."),
	("common.library.itemMenu.deleteConfirm.failure", "Couldn’t delete {{name}}. Retry.", "Impossible de supprimer {{name}}. Réessayez."),
	("common.library.imageMenu.saveToLibrary", "Save to Library", "Enregistrer dans la Bibliothèque"),
	("common.library.imageMenu.copyImage", "Copy image", "Copier l’image"),
	("common.library.imageMenu.openInViewer", "Open in viewer", "Ouvrir dans la visionneuse"),
	("common.library.lightbox.download", "Download", "Télécharger"),
	("common.library.lightbox.copy", "Copy", "Copier"),
	("common.library.lightbox.copied", "Copied", "Copié"),
	("common.library.lightbox.more", "More", "Plus"),
	("common.library.lightbox.back", "Back", "Retour"),
	("common.library.lightbox.close", "Close", "Fermer"),
	("common.library.lightbox.previous", "Previous image", "Image précédente"),
	("common.library.lightbox.next", "Next image", "Image suivante"),
	("common.library.lightbox.zoomOut", "Zoom out", "Dézoomer"),
	("common.library.lightbox.zoomIn", "Zoom in", "Zoomer"),
	("common.library.lightbox.fit", "Fit", "Ajuster"),
	("common.library.lightbox.fitToStage", "Fit to the window", "Ajuster à la fenêtre"),
	("common.library.lightbox.zoom", "{{percent}}%", "{{percent}} %"),
	("common.library.lightbox.zoomThenFit", "{{percent}}%, fit to the window", "{{percent}} %, ajuster à la fenêtre"),
	("common.library.lightbox.position", "{{position}} of {{count}}", "{{position}} sur {{count}}"),
	("common.library.document.back", "Library", "Bibliothèque"),
	("common.library.document.more", "More", "Plus"),
	("common.library.document.download", "Download", "Télécharger"),
	("common.library.document.copy", "Copy", "Copier"),
	("common.library.document.copied", "Copied", "Copié"),
	("common.library.document.close", "Close", "Fermer"),
	("common.library.document.agents.writing_one", "{{count}} agent writing", "{{count}} agent écrit"),
	("common.library.document.agents.writing_other", "{{count}} agents writing", "{{count}} agents écrivent"),
	("common.library.document.agents.stopAll", "Stop all", "Tout arrêter"),
	("common.library.document.agents.caret", "{{name}} is writing", "{{name}} écrit"),
	("common.library.document.agents.title", "{{name}} is writing…", "{{name}} écrit…"),
	("common.library.document.agents.summary_one", "{{count}} sentence added to “{{section}}”", "{{count}} phrase ajoutée à « {{section}} »"),
	("common.library.document.agents.summary_other", "{{count}} sentences added to “{{section}}”", "{{count}} phrases ajoutées à « {{section}} »"),
	("common.library.document.agents.stop", "Stop {{name}}", "Arrêter {{name}}"),
	("common.library.document.agents.openConversation", "Open conversation", "Ouvrir la conversation"),
	("common.library.document.readOnly", "Read-only", "Lecture seule"),
	("common.library.document.placeholder", "Start writing, or type / to add a block.", "Commencez à écrire, ou tapez / pour ajouter un bloc."),
	("common.library.document.start.label", "Start with", "Commencer avec"),
	("common.library.document.start.checklist", "Checklist", "Liste de tâches"),
	("common.library.document.start.gallery", "Gallery", "Galerie"),
	("common.library.document.start.table", "Table", "Tableau"),
	("common.library.document.start.template", "From a template", "Un modèle"),
	("common.library.document.drop_one", "Drop to add {{count}} image here", "Déposez pour ajouter {{count}} image ici"),
	("common.library.document.drop_other", "Drop to add {{count}} images here", "Déposez pour ajouter {{count}} images ici"),
	("common.library.document.failedImport.choose", "Choose another file", "Choisir un autre fichier"),
	("common.library.document.failedImport.remove", "Remove", "Retirer"),
	("common.library.panel.openInLibrary", "Open in Library", "Ouvrir dans la Bibliothèque"),
	("common.library.panel.close", "Close", "Fermer"),
	("common.library.panel.resize", "Resize document panel", "Redimensionner le panneau du document"),
	("common.library.tab.loadingDocument", "Loading the document…", "Chargement du document…"),
	("common.library.tab.loadingImage", "Loading the image…", "Chargement de l’image…"),
	("common.library.tab.unavailable.missing.title", "This item isn’t in the Library anymore.", "Cet élément n’est plus dans la Bibliothèque."),
	("common.library.tab.unavailable.missing.body", "It was deleted or moved. Close this tab.", "Il a été supprimé ou déplacé. Fermez cet onglet."),
	("common.library.tab.unavailable.missing.action", "Close tab", "Fermer l’onglet"),
	("common.library.tab.unavailable.unreadable.title", "Couldn’t open {{name}}", "Impossible d’ouvrir {{name}}"),
	("common.library.tab.unavailable.unreadable.body", "Couldn’t read this item on the computer where Kiroshi runs. Go back to the Library and open it again.", "Impossible de lire cet élément sur l’ordinateur où tourne Kiroshi. Revenez à la Bibliothèque et rouvrez-le."),
	("common.library.tab.unavailable.unreadable.action", "Back to the Library", "Retour à la Bibliothèque"),
	("common.library.documentPicker.label", "Attach from the Library", "Joindre depuis la Bibliothèque"),
	("common.library.documentPicker.search", "Search documents", "Rechercher des documents"),
	("common.library.documentPicker.attachFiles", "Attach files from this computer", "Joindre des fichiers de cet ordinateur"),
	("common.library.failure.list", "Couldn’t open the Library", "Impossible d’ouvrir la Bibliothèque"),
	("common.library.failure.image", "Couldn’t show an image of the Library", "Impossible d’afficher une image de la Bibliothèque"),
	("common.library.failure.save", "Couldn’t save the file", "Impossible d’enregistrer le fichier"),
	("common.library.failure.copy", "Couldn’t copy the image", "Impossible de copier l’image"),
	("common.library.failure.reveal", "Couldn’t show the file in its folder", "Impossible d’afficher le fichier dans son dossier"),
	("common.library.failure.delete", "Couldn’t delete the item", "Impossible de supprimer l’élément"),
	("common.library.failure.document.create", "Couldn’t create the document. Try again from New document.", "Impossible de créer le document. Réessayez depuis Nouveau document."),
	("common.library.failure.document.open", "Couldn’t open the document. Open it again from the Library.", "Impossible d’ouvrir le document. Rouvrez-le depuis la Bibliothèque."),
	("common.library.failure.document.save", "Couldn’t save your last changes. Keep the document open and edit again to retry.", "Impossible d’enregistrer vos dernières modifications. Gardez le document ouvert et modifiez-le à nouveau pour réessayer."),
	("common.library.failure.document.write", "{{name}} stopped writing before it finished. Ask again from the conversation.", "L’écriture de {{name}} s’est interrompue. Redemandez-la depuis la conversation."),
	("common.library.failure.document.caret", "Couldn’t show others where you are in the document. Keep editing to try again.", "Impossible de montrer aux autres où vous êtes dans le document. Continuez à modifier pour réessayer."),
	("common.library.failure.document.stopAll", "Couldn’t stop the agents writing in this document. Press Stop all to try again.", "Impossible d’arrêter les agents qui écrivent dans ce document. Appuyez sur Tout arrêter pour réessayer."),
	("common.library.failure.document.stop", "Couldn’t stop {{name}}. Press Stop {{name}} to try again.", "Impossible d’arrêter {{name}}. Appuyez sur Arrêter {{name}} pour réessayer."),
	("common.library.failure.document.saveAsDocument", "Couldn’t save the message as a document. Try Save as document again.", "Impossible d’enregistrer le message comme document. Réessayez avec Enregistrer comme document."),
	("common.library.failure.board.open", "Couldn’t open the board. Open it again from the Library.", "Impossible d’ouvrir le tableau. Ouvrez-le à nouveau depuis la Bibliothèque."),
	("common.library.failure.board.save", "Couldn’t save your last changes to the board. It shows what was saved, so make them again.", "Impossible d’enregistrer vos dernières modifications du tableau. Il affiche ce qui a été enregistré : refaites-les."),
	("common.library.failure.board.refused", "Couldn’t show the latest changes to the board. Close it and open it again from the Library.", "Impossible d’afficher les dernières modifications du tableau. Fermez-le et rouvrez-le depuis la Bibliothèque."),
	("common.library.failure.board.stopAll", "Couldn’t stop the agents drawing on this board. Press Stop all to try again.", "Impossible d’arrêter les agents qui dessinent sur ce tableau. Appuyez sur Tout arrêter pour réessayer."),
	("common.library.failure.import.title", "Couldn’t import {{name}}", "Impossible d’importer {{name}}"),
	("common.library.failure.import.tooLarge", "This file is too large for the Library. Make it smaller, then import it again.", "Ce fichier est trop lourd pour la Bibliothèque. Réduisez sa taille, puis importez-le à nouveau."),
	("common.library.failure.import.invalidName", "This file’s name can’t be used in the Library. Rename the file, then import it again.", "Le nom de ce fichier ne convient pas à la Bibliothèque. Renommez le fichier, puis importez-le à nouveau."),
	("common.library.failure.import.unsupported", "This type of file can’t go in the Library. Import a PNG, JPEG, GIF or WebP image, or a Markdown or plain text document.", "Ce type de fichier ne peut pas aller dans la Bibliothèque. Importez une image PNG, JPEG, GIF ou WebP, ou un document Markdown ou texte brut."),
	("common.library.failure.import.undecodable", "Couldn’t read the content of this file. Save it again from the app that made it, then import it again.", "Impossible de lire le contenu de ce fichier. Enregistrez-le à nouveau depuis l’app qui l’a créé, puis importez-le à nouveau."),
	("common.library.failure.import.notUtf8", "Couldn’t read the text of this document. Save it as UTF-8 text, then import it again.", "Impossible de lire le texte de ce document. Enregistrez-le en texte UTF-8, puis importez-le à nouveau."),
	("common.library.failure.import.missing", "Couldn’t find the file in the Library after the import. Import it again.", "Impossible de retrouver le fichier dans la Bibliothèque après l’import. Importez-le à nouveau."),
	("common.library.failure.import.unwritable", "Couldn’t save the file on the computer where Kiroshi runs. Check that its disk has space left, then import the file again.", "Impossible d’enregistrer le fichier sur l’ordinateur où tourne Kiroshi. Vérifiez qu’il reste de la place sur son disque, puis importez à nouveau le fichier."),
	("common.library.failure.import.unreadable", "Couldn’t read the Library folder on the computer where Kiroshi runs. Check that the folder is still there, then import the file again.", "Impossible de lire le dossier de la Bibliothèque sur l’ordinateur où tourne Kiroshi. Vérifiez que le dossier est toujours là, puis importez à nouveau le fichier."),
	("common.library.failure.import.unknownSpace", "This Space isn’t on the computer where Kiroshi runs anymore. Open another Space, then import the file there.", "Cet espace n’existe plus sur l’ordinateur où tourne Kiroshi. Ouvrez un autre espace, puis importez-y le fichier."),
	("common.library.failure.import.unavailable", "Couldn’t open the Library on the computer where Kiroshi runs. Restart Kiroshi there, then import the file again.", "Impossible d’ouvrir la Bibliothèque sur l’ordinateur où tourne Kiroshi. Redémarrez Kiroshi sur cet ordinateur, puis importez à nouveau le fichier."),
	("common.library.failure.import.storage", "Couldn’t record the file in the Library. Import it again.", "Impossible d’enregistrer le fichier dans la Bibliothèque. Importez-le à nouveau."),
	("common.library.failure.import.imageUnreadable", "Couldn’t read this image. Check that it still opens, then save it to the Library again.", "Impossible de lire cette image. Vérifiez qu’elle s’ouvre toujours, puis enregistrez-la à nouveau dans la Bibliothèque."),
	("common.library.failure.import.refused", "Couldn’t add this file to the Library. Check the file, then import it again.", "Impossible d’ajouter ce fichier à la Bibliothèque. Vérifiez le fichier, puis importez-le à nouveau."),
	("common.library.failure.import.generic", "Something went wrong during the import. Import the file again.", "Un problème est survenu pendant l’import. Importez à nouveau le fichier."),
	("common.library.failure.import.url.unsupportedScheme", "Only web links (http or https) can be imported. Drop a web link instead.", "Seuls les liens web (http ou https) peuvent être importés. Déposez plutôt un lien web."),
	("common.library.failure.import.url.privateAddress", "Kiroshi doesn’t import from a private address. Drop a public link instead.", "Kiroshi n’importe pas depuis une adresse privée. Déposez plutôt un lien public."),
	("common.library.failure.import.url.networkFailure", "Couldn’t reach this link. Check the address, then drop it again.", "Impossible d’atteindre ce lien. Vérifiez l’adresse, puis déposez-le à nouveau."),
	("common.library.failure.import.url.tooLarge", "The image behind this link is too large for the Library. Drop a link to a smaller image.", "L’image derrière ce lien est trop lourde pour la Bibliothèque. Déposez le lien d’une image plus petite."),
	("common.library.failure.import.url.unknownSpace", "This Space isn’t on the computer where Kiroshi runs anymore. Open another Space, then drop the link there.", "Cet espace n’existe plus sur l’ordinateur où tourne Kiroshi. Ouvrez un autre espace, puis déposez-y le lien."),
	("common.board.empty.title", "An empty board", "Un tableau vide"),
	("common.board.empty.body", "Pick a tool below, paste a link or an image, or drag something in from the Library. Agents in this Space can draw here too.", "Choisissez un outil ci-dessous, collez un lien ou une image, ou glissez un élément depuis la Bibliothèque. Les agents de cet espace peuvent aussi dessiner ici."),
	("common.board.zoom.controls", "Zoom", "Zoom"),
	("common.board.zoom.zoomOut", "Zoom out", "Dézoomer"),
	("common.board.zoom.zoomIn", "Zoom in", "Zoomer"),
	("common.board.zoom.level", "{{percent}}%", "{{percent}} %"),
	("common.board.presence.drawing_one", "{{count}} agent drawing", "{{count}} agent dessine"),
	("common.board.presence.drawing_other", "{{count}} agents drawing", "{{count}} agents dessinent"),
	("common.board.card.open", "Open", "Ouvrir"),
	("common.board.card.drawing_one", "Board · {{name}} is drawing · {{count}} item", "Tableau · {{name}} dessine · {{count}} élément"),
	("common.board.card.drawing_other", "Board · {{name}} is drawing · {{count}} items", "Tableau · {{name}} dessine · {{count}} éléments"),
	("common.board.card.atRest_one", "Board · {{count}} item · {{edited}}", "Tableau · {{count}} élément · {{edited}}"),
	("common.board.card.atRest_other", "Board · {{count}} items · {{edited}}", "Tableau · {{count}} éléments · {{edited}}"),
	("common.board.card.failed", "Couldn’t read this board. Open it to try again.", "Impossible de lire ce tableau. Ouvrez-le pour réessayer."),
	("common.board.libraryCard.documentMeta", "Document · from the Library", "Document · depuis la Bibliothèque"),
	("common.board.canvas.label", "Board", "Tableau"),
	("common.board.canvas.loading", "Loading the board…", "Chargement du tableau…"),
	("common.board.canvas.objects", "Board objects", "Éléments du tableau"),
	("common.board.object.named", "{{kind}}: {{text}}", "{{kind}} : {{text}}"),
	("common.board.object.editText", "Edit text", "Modifier le texte"),
	("common.board.object.kind.sticky", "Sticky note", "Note autocollante"),
	("common.board.object.kind.text", "Text", "Texte"),
	("common.board.object.kind.shape", "Shape", "Forme"),
	("common.board.object.kind.section", "Section", "Section"),
	("common.board.object.kind.image", "Image", "Image"),
	("common.board.object.kind.link", "Link", "Lien"),
	("common.board.object.moved", "Moved to {{x}}, {{y}}", "Déplacé en {{x}}, {{y}}"),
	("common.board.object.resized", "Resized to {{width}} by {{height}}", "Redimensionné à {{width}} sur {{height}}"),
	("common.board.connector.editLabel", "Arrow label", "Libellé de la flèche"),
	("common.board.connectorFlyout.label", "Arrow type", "Type de flèche"),
	("common.board.connectorFlyout.routing.straight", "Straight", "Droit"),
	("common.board.connectorFlyout.routing.elbow", "Elbow", "Coudé"),
	("common.board.selectionBar.label", "Shape style", "Style de la forme"),
	("common.board.selectionBar.shapeType", "Shape type", "Type de forme"),
	("common.board.selectionBar.shape.rounded-rectangle", "Rounded rectangle", "Rectangle arrondi"),
	("common.board.selectionBar.shape.ellipse", "Ellipse", "Ellipse"),
	("common.board.selectionBar.fill.surface", "No colour", "Sans couleur"),
	("common.board.selectionBar.fill.yellow", "Yellow", "Jaune"),
	("common.board.selectionBar.fill.green", "Green", "Vert"),
	("common.board.selectionBar.fill.blue", "Blue", "Bleu"),
	("common.board.selectionBar.fill.pink", "Pink", "Rose"),
	("common.board.selectionBar.textSize", "Text size", "Taille du texte"),
	("common.board.selectionBar.textSizeMedium", "M", "M"),
	("common.board.selectionBar.more", "More", "Plus"),
	("common.board.dock.label", "Board tools", "Outils du tableau"),
	("common.board.dock.tool.select", "Select", "Sélection"),
	("common.board.dock.tool.hand", "Hand", "Main"),
	("common.board.dock.tool.sticky", "Sticky note", "Note autocollante"),
	("common.board.dock.tool.shape", "Shape", "Forme"),
	("common.board.dock.tool.text", "Text", "Texte"),
	("common.board.dock.tool.connector", "Arrow", "Flèche"),
	("common.board.dock.tool.section", "Section", "Section"),
	("common.board.dock.tool.image", "Image", "Image"),
	("common.board.dock.tool.library", "Library", "Bibliothèque"),
	("common.board.picker.title", "From the Library", "Depuis la Bibliothèque"),
	("common.board.picker.hint", "Drag onto the board", "Glissez sur le tableau"),
	("common.board.picker.empty", "Nothing in the Library yet.", "Rien dans la Bibliothèque pour l’instant."),
	("common.board.drop.images_one", "Drop to add {{count}} image here", "Déposez pour ajouter {{count}} image ici"),
	("common.board.drop.images_other", "Drop to add {{count}} images here", "Déposez pour ajouter {{count}} images ici"),
	("common.board.drop.files_one", "Drop to add {{count}} file here", "Déposez pour ajouter {{count}} fichier ici"),
	("common.board.drop.files_other", "Drop to add {{count}} files here", "Déposez pour ajouter {{count}} fichiers ici"),
	("common.board.drop.unknown", "Drop to add files here", "Déposez pour ajouter des fichiers ici"),
	("common.whatsNew.firstLaunch.eyebrow", "New in {{version}}", "Nouveautés de la version {{version}}"),
	("common.whatsNew.firstLaunch.legend", "Also in this update", "Aussi dans cette mise à jour"),
	("common.whatsNew.firstLaunch.dismiss", "Got it", "Compris"),
	("common.whatsNew.fromAbout.eyebrow", "Version {{version}}", "Version {{version}}"),
	("common.whatsNew.fromAbout.legend", "Also in this version", "Aussi dans cette version"),
	("common.whatsNew.fromAbout.dismiss", "Close", "Fermer"),
	("common.whatsNew.beta", "Beta", "Bêta"),
	("common.whatsNew.releaseNotes", "Release notes", "Notes de version"),
	("search.open", "Search", "Rechercher"),
	("search.chord", "⌘K", "⌘K"),
	("search.placeholder", "Search messages, conversations, missions and routines", "Rechercher messages, conversations, missions et routines"),
	("search.results", "Results", "Résultats"),
	("search.tab.all", "All", "Tout"),
	("search.tab.messages", "Messages", "Messages"),
	("search.tab.chats", "Conversations", "Conversations"),
	("search.tab.missions", "Missions", "Missions"),
	("search.tab.routines", "Routines", "Routines"),
	("search.seeAll", "See all", "Tout voir"),
	("search.solo", "solo conversation", "conversation en tête-à-tête"),
	("search.unavailable.title", "Couldn’t run the search", "Impossible de lancer la recherche"),
	("search.unavailable.description", "Edit your search to retry.", "Modifiez votre recherche pour réessayer."),
	("search.rest.chats", "Recent conversations", "Conversations récentes"),
	("search.rest.missions", "Recent missions", "Missions récentes"),
	("search.rest.routines", "Routines", "Routines"),
	("search.rest.messages.title", "Search every message", "Rechercher dans tous les messages"),
	("search.rest.messages.body", "Type a word to search every message in {{space}}. Whole words only: “rout” won’t find “routine”.", "Tapez un mot pour chercher dans tous les messages de {{space}}. Mots entiers seulement : « rout » ne trouve pas « routine »."),
	("search.rest.none.chats", "No conversation here yet", "Aucune conversation ici"),
	("search.rest.none.missions", "No mission here yet", "Aucune mission ici"),
	("search.rest.none.routines", "No routine here yet", "Aucune routine ici"),
	("search.rest.none.body.chats", "No conversations in {{space}} yet.", "Aucune conversation dans {{space}}."),
	("search.rest.none.body.missions", "No missions in {{space}} yet.", "Aucune mission dans {{space}}."),
	("search.rest.none.body.routines", "No routines in {{space}} yet.", "Aucune routine dans {{space}}."),
	("search.empty.title", "Nothing here matches", "Rien ne correspond ici"),
	("search.empty.description", "No results for “{{query}}” in {{space}}.", "Aucun résultat pour « {{query}} » dans {{space}}."),
	("settings.breadcrumb.title", "Settings", "Réglages"),
	("settings.screen.back", "Back to conversations", "Retour aux conversations"),
	("settings.screen.backToAgents", "Back to Agents", "Retour aux agents"),
	("settings.screen.backToSettings", "Back to your settings", "Retour à vos réglages"),
	("settings.screen.menu", "Settings", "Réglages"),
	("settings.screen.subtitle.space", "Space settings", "Réglages de l’espace"),
	("settings.screen.subtitle.agent", "Agent settings", "Réglages de l’agent"),
	("settings.screen.subtitle.conversation", "Conversation settings", "Réglages de la conversation"),
	("settings.screen.subtitle.user", "User settings", "Réglages de l’utilisateur"),
	("settings.screen.subtitle.invitation", "Invitation", "Invitation"),
	("settings.screen.group.settings", "Settings", "Réglages"),
	("settings.screen.group.subjectSettings", "Settings", "Réglages"),
	("settings.screen.group.spaces", "Spaces", "Espaces"),
	("settings.screen.space.current", "Open now", "Ouvert"),
	("settings.screen.space.invitation", "Invitation", "Invitation"),
	("settings.screen.space.left.title", "You left {{name}}", "Vous avez quitté {{name}}"),
	("settings.screen.space.left.description", "Ask {{host}} for a new invitation to join again.", "Demandez une nouvelle invitation à {{host}} pour le rejoindre."),
	("settings.rail.account", "Account", "Compte"),
	("settings.rail.space", "Space", "Espace"),
	("settings.rail.members", "Members", "Membres"),
	("settings.rail.agents", "Agents", "Agents"),
	("settings.rail.secrets", "Secrets", "Secrets"),
	("settings.rail.appearance", "Appearance", "Apparence"),
	("settings.rail.notifications", "Notifications", "Notifications"),
	("settings.rail.language", "Language", "Langue"),
	("settings.rail.skills", "Skills", "Compétences"),
	("settings.rail.applications", "Applications", "Applications"),
	("settings.rail.history", "History", "Historique"),
	("settings.rail.diagnostics", "Diagnostics", "Diagnostic"),
	("settings.rail.danger", "Danger zone", "Zone sensible"),
	("settings.rail.about", "About", "À propos"),
	("settings.rail.invitation", "Invitation", "Invitation"),
	("settings.account.signedOut.title", "Sign in to Kiroshi", "Se connecter à Kiroshi"),
	("settings.account.signedOut.body", "Host a space for people who aren’t on your network, or join one someone hosts for you.", "Hébergez un espace pour des personnes hors de votre réseau, ou rejoignez celui qu’on héberge pour vous."),
	("settings.account.signedOut.signIn", "Sign in with your browser", "Se connecter avec votre navigateur"),
	("settings.account.signedOut.caption", "Your account, plan and signed-in computers live on kiroshi.app.", "Votre compte, votre offre et vos ordinateurs connectés se trouvent sur kiroshi.app."),
	("settings.account.waiting.label", "Waiting for your browser…", "En attente de votre navigateur…"),
	("settings.account.waiting.cancel", "Cancel", "Annuler"),
	("settings.account.waiting.caption", "Finish in your browser. Kiroshi picks it up from there.", "Terminez dans votre navigateur. Kiroshi prend le relais ensuite."),
	("settings.account.waiting.browserDidNotOpen", "Browser didn’t open?", "Le navigateur ne s’est pas ouvert ?"),
	("settings.account.waiting.copySignInLink", "Copy the sign-in link", "Copier le lien de connexion"),
	("settings.account.signedIn.plan.beta", "Free during the beta", "Gratuit pendant la bêta"),
	("settings.account.signedIn.plan.pro", "Pro", "Pro"),
	("settings.account.signedIn.plan.free", "Free", "Gratuit"),
	("settings.account.signedIn.manage", "Manage account", "Gérer le compte"),
	("settings.account.signedIn.signOut", "Sign out", "Se déconnecter"),
	("settings.account.onboarding.body", "Optional. Host a space for people who aren’t on your network, or join one someone hosts for you.", "Facultatif. Hébergez un espace pour des personnes hors de votre réseau, ou rejoignez celui qu’on héberge pour vous."),
	("settings.account.onboarding.skip", "Skip for now", "Passer pour l’instant"),
	("settings.account.onboarding.signedIn.title", "You’re signed in", "Vous êtes connecté"),
	("settings.account.onboarding.signedIn.body", "Your conversations stay on your computer. The account only connects you to spaces and devices beyond your network.", "Vos conversations restent sur votre ordinateur. Le compte vous relie seulement aux espaces et aux appareils au-delà de votre réseau."),
	("settings.account.onboarding.signedIn.continue", "Continue", "Continuer"),
	("settings.account.signedOutFromTheSite.title", "You were signed out on kiroshi.app", "Vous avez été déconnecté sur kiroshi.app"),
	("settings.account.signedOutFromTheSite.description", "This computer was signed out from Devices. Sign in again to use your spaces beyond your network.", "Cet ordinateur a été déconnecté depuis Appareils. Reconnectez-vous pour utiliser vos espaces au-delà de votre réseau."),
	("settings.account.deviceRevoked.title", "This computer is now signed in to another Kiroshi account.", "Cet ordinateur est maintenant connecté à un autre compte Kiroshi."),
	("settings.account.deviceRevoked.description", "Sign in again to use it here.", "Reconnectez-vous pour l’utiliser ici."),
	("settings.account.unreachable.title", "Couldn’t reach Kiroshi", "Impossible de joindre Kiroshi"),
	("settings.account.unreachable.description", "Check your connection and sign in again.", "Vérifiez votre connexion et reconnectez-vous."),
	("settings.account.failed.cancelled", "Signing in was cancelled", "Connexion annulée"),
	("settings.account.failed.timedOut", "Signing in took too long", "La connexion a pris trop de temps"),
	("settings.account.failed.description", "Press Sign in with your browser to try again.", "Appuyez sur Se connecter avec votre navigateur pour réessayer."),
	("settings.account.readFailed", "Couldn’t read your Kiroshi account", "Impossible de lire votre compte Kiroshi"),
	("settings.account.signInFailed", "Couldn’t start signing in to Kiroshi", "Impossible de lancer la connexion à Kiroshi"),
	("settings.account.cancelFailed", "Couldn’t cancel signing in", "Impossible d’annuler la connexion"),
	("settings.account.signInLinkCopied", "Sign-in link copied", "Lien de connexion copié"),
	("settings.account.copySignInLinkFailed", "Couldn’t copy the sign-in link", "Impossible de copier le lien de connexion"),
	("settings.account.manageAccountFailed", "Couldn’t open your account on kiroshi.app", "Impossible d’ouvrir votre compte sur kiroshi.app"),
	("settings.account.signOutFailed", "Couldn’t sign out of Kiroshi", "Impossible de se déconnecter de Kiroshi"),
	("settings.account.devices.title", "Your devices", "Vos appareils"),
	("settings.account.devices.thisDevice", "This device", "Cet appareil"),
	("settings.account.devices.activeNow", "Active now", "Actif maintenant"),
	("settings.account.devices.otherDevices", "Other devices", "Autres appareils"),
	("settings.account.devices.remove", "Remove", "Retirer"),
	("settings.account.devices.empty", "No other device reads your spaces. To add one, sign in on it with {{email}}, then approve it here.", "Aucun autre appareil ne lit vos espaces. Pour en ajouter un, connectez-vous dessus avec {{email}}, puis approuvez-le ici."),
	("settings.account.devices.confirm.title", "Remove {{device}}?", "Retirer {{device}} ?"),
	("settings.account.devices.confirm.body", "It will be signed out and won’t read your spaces.", "Il sera déconnecté et ne lira plus vos espaces."),
	("settings.account.devices.confirm.remove", "Remove", "Retirer"),
	("settings.account.devices.confirm.removing", "Removing…", "Retrait…"),
	("settings.account.devices.confirm.cancel", "Cancel", "Annuler"),
	("settings.account.devices.confirm.failed", "Couldn’t remove {{device}}. Check your connection and try again.", "Impossible de retirer {{device}}. Vérifiez votre connexion et réessayez."),
	("settings.account.devices.removed.title", "{{device}} was signed out", "{{device}} a été déconnecté"),
	("settings.account.devices.removed.description", "It doesn’t read your spaces anymore.", "Il ne lit plus vos espaces."),
	("settings.plugin.author.bot", "An agent", "Un agent"),
	("settings.notifications.label", "Notify me when", "Me prévenir quand"),
	("settings.notifications.event.question.label", "An agent asks a question", "Un agent pose une question"),
	("settings.notifications.event.question.description", "It’s paused until you answer.", "Il attend votre réponse pour continuer."),
	("settings.notifications.event.permission.label", "An agent asks for approval", "Un agent demande une autorisation"),
	("settings.notifications.event.permission.description", "It’s waiting for your approval to run a command or edit a file.", "Il attend votre autorisation pour lancer une commande ou modifier un fichier."),
	("settings.notifications.event.turn.label", "An agent finishes its turn", "Un agent termine son tour"),
	("settings.notifications.event.turn.description", "It’s done and waiting for your next message.", "Il a fini et attend votre prochain message."),
	("settings.notifications.sound.label", "Sound", "Son"),
	("settings.notifications.sound.switch", "Play a sound", "Jouer un son"),
	("settings.notifications.sound.description", "Kiroshi plays a short chime with every notification, even when your system shows it silently.", "Kiroshi joue un bref carillon à chaque notification, même quand votre système l’affiche en silence."),
	("settings.language.label", "Language", "Langue"),
	("settings.language.machine", "System", "Système"),
	("settings.appearance.scheme.label", "Scheme", "Thème"),
	("settings.appearance.scheme.option.light", "Light", "Clair"),
	("settings.appearance.scheme.option.dark", "Dark", "Sombre"),
	("settings.appearance.scheme.option.system", "System", "Système"),
	("settings.diagnostics.label", "Diagnostics", "Diagnostic"),
	("settings.diagnostics.description", "Copy diagnostics puts the details of the computer where Kiroshi runs and of the agent on the clipboard, ready for a bug report.", "Copier le diagnostic place dans le presse-papiers les détails de l’ordinateur où Kiroshi tourne et ceux de l’agent, prêts pour un signalement de bug."),
	("settings.diagnostics.copy", "Copy diagnostics", "Copier le diagnostic"),
	("settings.diagnostics.copyFailed", "Couldn’t copy the diagnostics. Try again.", "Impossible de copier le diagnostic. Réessayez."),
	("settings.diagnostics.reveal", "Reveal log", "Afficher le journal"),
	("settings.diagnostics.revealFailed", "Couldn’t reveal the log. Try again.", "Impossible d’afficher le journal. Réessayez."),
	("settings.diagnostics.clear.action", "Clear log", "Vider le journal"),
	("settings.diagnostics.clear.title", "Clear the log?", "Vider le journal ?"),
	("settings.diagnostics.clear.description", "Every line Kiroshi wrote to its log on this computer is deleted. This can’t be undone.", "Chaque ligne que Kiroshi a écrite dans son journal sur cet ordinateur est supprimée. C’est irréversible."),
	("settings.diagnostics.clear.failed", "Couldn’t clear the log. Try again.", "Impossible de vider le journal. Réessayez."),
	("settings.about.updates.label", "Updates", "Mises à jour"),
	("settings.about.version", "Kiroshi {{version}}", "Kiroshi {{version}}"),
	("settings.about.status.upToDate", "Up to date · Checked {{when}}", "À jour · Vérifié {{when}}"),
	("settings.about.status.checking", "Checking for updates…", "Recherche de mises à jour…"),
	("settings.about.status.available", "Kiroshi {{version}} is available.", "Kiroshi {{version}} est disponible."),
	("settings.about.status.downloading", "Downloading {{version}}. You can keep working meanwhile.", "Téléchargement de {{version}}. Vous pouvez continuer à travailler en attendant."),
	("settings.about.status.ready", "{{version}} is ready. Restart Kiroshi to finish updating.", "La {{version}} est prête. Redémarrez Kiroshi pour terminer la mise à jour."),
	("settings.about.status.readyHeld", "{{version}} is ready.", "La {{version}} est prête."),
	("settings.about.status.running_one", "{{count}} agent is still running. Stop it to restart.", "{{count}} agent tourne encore. Arrêtez-le pour redémarrer."),
	("settings.about.status.running_other", "{{count}} agents are still running. Stop them to restart.", "{{count}} agents tournent encore. Arrêtez-les pour redémarrer."),
	("settings.about.status.failed", "Couldn’t download {{version}}.", "Impossible de télécharger la {{version}}."),
	("settings.about.status.failedHint", "Check your connection, then download it again.", "Vérifiez votre connexion, puis téléchargez-la à nouveau."),
	("settings.about.action.check", "Check for updates", "Vérifier les mises à jour"),
	("settings.about.action.download", "Download update", "Télécharger la mise à jour"),
	("settings.about.action.restart", "Restart now", "Redémarrer maintenant"),
	("settings.about.action.downloadAgain", "Download again", "Télécharger à nouveau"),
	("settings.about.channel.label", "Release channel", "Canal de version"),
	("settings.about.channel.description", "Beta gets new features sooner, with rougher edges.", "La bêta reçoit les nouveautés plus tôt, avec quelques aspérités."),
	("settings.about.channel.option.stable", "Stable", "Stable"),
	("settings.about.channel.option.beta", "Beta", "Bêta"),
	("settings.about.betaNotice.title", "Beta builds are tested less", "Les versions bêta sont moins testées"),
	("settings.about.betaNotice.description", "Back on Stable, you keep this beta until Stable passes it.", "De retour sur Stable, vous gardez cette bêta jusqu’à ce que Stable la dépasse."),
	("settings.about.whatsNew.label", "Show what’s new after an update", "Montrer les nouveautés après une mise à jour"),
	("settings.about.whatsNew.description", "The first time Kiroshi opens on a new version, it shows what changed.", "La première fois que Kiroshi s’ouvre sur une nouvelle version, il montre ce qui a changé."),
	("settings.about.gettingStarted.label", "Getting started", "Premiers pas"),
	("settings.about.gettingStarted.importFromClaudeCode.label", "Import from Claude Code", "Importer depuis Claude Code"),
	("settings.about.gettingStarted.importFromClaudeCode.description", "Brings in agents, skills and CLAUDE.md from ~/.claude. You choose what comes in.", "Récupère les agents, les compétences et CLAUDE.md depuis ~/.claude. Vous choisissez ce qui arrive."),
	("settings.about.gettingStarted.importFromClaudeCode.nothingToImport", "Nothing to bring in: there’s no ~/.claude folder on this computer.", "Rien à récupérer : il n’y a pas de dossier ~/.claude sur cet ordinateur."),
	("settings.about.gettingStarted.replayOnboarding.label", "Replay onboarding", "Revoir l’accueil"),
	("settings.about.gettingStarted.replayOnboarding.description", "Shows the welcome screens again. Your agents, conversations and account stay as they are.", "Montre de nouveau les écrans d’accueil. Vos agents, vos conversations et votre compte restent tels quels."),
	("settings.about.kiroshi.label", "Kiroshi", "Kiroshi"),
	("settings.about.kiroshi.whatsNew", "What’s new in {{version}}", "Nouveautés de la {{version}}"),
	("settings.about.kiroshi.releaseNotes", "Release notes", "Notes de version"),
	("settings.about.kiroshi.releaseNotesName", "Release notes, opens in your browser", "Notes de version, s’ouvre dans votre navigateur"),
	("settings.space.untitled", "Untitled space", "Espace sans nom"),
	("settings.space.standing.yours", "Yours · not shared", "À vous · non partagé"),
	("settings.space.standing.yoursShared", "Yours · shared", "À vous · partagé"),
	("settings.space.standing.joined", "Joined · hosted by {{host}}", "Rejoint · hébergé par {{host}}"),
	("settings.space.standing.joinedNotConnected", "Joined · hosted by {{host}} · Not connected", "Rejoint · hébergé par {{host}} · Non connecté"),
	("settings.space.standing.invitation", "Invitation from {{email}} · Expires {{date}}", "Invitation de {{email}} · Expire le {{date}}"),
	("settings.space.open", "Open", "Ouvrir"),
	("settings.space.notShared.title", "Not shared yet", "Pas encore partagé"),
	("settings.space.notShared.description", "Share {{name}} to invite people. Deleting it lives in Danger zone.", "Partagez {{name}} pour inviter des personnes. Sa suppression se trouve dans Zone sensible."),
	("settings.space.notShared.share", "Share", "Partager"),
	("settings.space.name.label", "Name", "Nom"),
	("settings.space.name.placeholder", "No name", "Sans nom"),
	("settings.space.host.label", "Host", "Hôte"),
	("settings.space.host.hint", "This space lives on another Kiroshi.", "Cet espace vit sur un autre Kiroshi."),
	("settings.space.colour.label", "Colour", "Couleur"),
	("settings.space.colour.none", "No colour", "Aucune couleur"),
	("settings.space.colour.hint", "Any hue. Lightness and strength come from the recipe, so it reads in light and dark.", "N'importe quelle teinte. La clarté et l'intensité viennent de la recette, pour rester lisible en clair comme en sombre."),
	("settings.space.transfer.export", "Export this space", "Exporter cet espace"),
	("settings.space.transfer.import", "Import a space", "Importer un espace"),
	("settings.space.transfer.exported", "{{name}} exported", "{{name}} exporté"),
	("settings.space.transfer.imported", "{{name}} imported", "{{name}} importé"),
	("settings.space.transfer.exportFailed", "Couldn’t export {{name}}", "Impossible d’exporter {{name}}"),
	("settings.space.transfer.importFailed", "Couldn’t import the space", "Impossible d’importer l’espace"),
	("settings.space.transfer.retry", "Try again", "Réessayer"),
	("settings.space.transfer.reason.unsupportedArchive", "This archive is format version {{found}}, this app reads version {{supported}}.", "Cette archive est au format version {{found}}, cette app lit la version {{supported}}."),
	("settings.space.transfer.reason.unversionedArchive", "This archive carries no format version, this app reads version {{supported}}.", "Cette archive ne porte aucune version de format, cette app lit la version {{supported}}."),
	("settings.space.transfer.reason.unreadableArchive", "The archive couldn’t be read.", "L’archive n’a pas pu être lue."),
	("settings.space.transfer.reason.unwritableArchive", "The archive couldn’t be written.", "L’archive n’a pas pu être écrite."),
	("settings.space.transfer.reason.generic", "Something went wrong, nothing was changed.", "Une erreur est survenue, rien n’a été modifié."),
	("settings.space.agents.title", "Agents", "Agents"),
	("settings.space.agents.caption", "Every agent in {{space}}. Pick one to change how it works.", "Tous les agents de {{space}}. Choisissez-en un pour changer sa façon de travailler."),
	("settings.space.agents.create", "Create an agent", "Créer un agent"),
	("settings.space.agents.empty", "No agents in this space yet.", "Aucun agent dans cet espace pour l’instant."),
	("settings.space.agents.counts", "{{skills}} · {{applications}}", "{{skills}} · {{applications}}"),
	("settings.space.agents.countsUnreadable", "Couldn’t read the skills and applications of the agents. Open Agents again to retry.", "Impossible de lire les compétences et les applications des agents. Rouvrez Agents pour réessayer."),
	("settings.space.agents.skills_zero", "no skills", "aucune compétence"),
	("settings.space.agents.skills_one", "{{count}} skill", "{{count}} compétence"),
	("settings.space.agents.skills_other", "{{count}} skills", "{{count}} compétences"),
	("settings.space.agents.applications_zero", "no applications", "aucune application"),
	("settings.space.agents.applications_one", "{{count}} application", "{{count}} application"),
	("settings.space.agents.applications_other", "{{count}} applications", "{{count}} applications"),
	("settings.space.members.invite.label", "Invite people", "Inviter des personnes"),
	("settings.space.members.invite.placeholder", "Email", "E-mail"),
	("settings.space.members.invite.action", "Invite", "Inviter"),
	("settings.space.members.invite.hint", "Kiroshi emails them an invitation. It works once, for 7 days.", "Kiroshi leur envoie une invitation par e-mail. Elle sert une fois, pendant 7 jours."),
	("settings.space.members.invite.refusal.invited", "{{email}} is already invited.", "{{email}} est déjà invité."),
	("settings.space.members.invite.refusal.self", "That’s your own account.", "C’est votre propre compte."),
	("settings.space.members.invite.refusal.malformed", "Enter an email address, like sam@example.com.", "Saisissez une adresse e-mail, comme sam@example.com."),
	("settings.space.members.invite.notShared", "Turn on Share {{name}} to invite someone.", "Activez Partager {{name}} pour inviter quelqu’un."),
	("settings.space.members.invite.signedOut", "Sign in to Kiroshi to invite someone.", "Connectez-vous à Kiroshi pour inviter quelqu’un."),
	("settings.space.members.invite.hostOffline", "{{name}} is offline. You can invite people once {{host}}’s computer is back.", "{{name}} est hors ligne. Vous pourrez inviter des personnes quand l’ordinateur de {{host}} sera de retour."),
	("settings.space.members.invitations", "Invitations", "Invitations"),
	("settings.space.members.list", "Members", "Membres"),
	("settings.space.members.status.host", "Host", "Hôte"),
	("settings.space.members.status.expired", "Expired", "Expirée"),
	("settings.space.members.pending_one", "Invited · expires in 1 day", "Invité · expire dans 1 jour"),
	("settings.space.members.pending_other", "Invited · expires in {{count}} days", "Invité · expire dans {{count}} jours"),
	("settings.space.members.expired", "Sent {{date}}, not used", "Envoyée le {{date}}, non utilisée"),
	("settings.space.members.you", "{{name}} (you)", "{{name}} (vous)"),
	("settings.space.members.remove", "Remove", "Retirer"),
	("settings.space.members.removeLabel", "Remove {{name}}", "Retirer {{name}}"),
	("settings.space.members.withdrawLabel", "Withdraw the invitation to {{email}}", "Retirer l’invitation à {{email}}"),
	("settings.space.members.inviteAgainLabel", "Invite {{email}} again", "Inviter {{email}} de nouveau"),
	("settings.space.members.needsInvitation", "Needs a new invitation", "Doit être invité de nouveau"),
	("settings.space.members.inviteMemberAgain", "Invite again", "Inviter de nouveau"),
	("settings.space.members.invitedAgainFailure.listed.title", "Invitation sent to {{email}}", "Invitation envoyée à {{email}}"),
	("settings.space.members.invitedAgainFailure.listed.description", "The member list didn’t refresh. It shows the invitation within a few seconds.", "La liste des membres ne s’est pas actualisée. Elle affiche l’invitation d’ici quelques secondes."),
	("settings.space.members.invitedAgainFailure.removed.title", "{{name}} was removed, the invitation to {{email}} wasn’t sent", "{{name}} a été retiré, l’invitation à {{email}} n’est pas partie"),
	("settings.space.members.invitedAgainFailure.removed.description", "Type that address under Invite people and select Invite.", "Saisissez cette adresse sous Inviter des personnes et sélectionnez Inviter."),
	("settings.space.members.invitedAgainFailure.generic.title", "Couldn’t invite {{name}} again", "Impossible d’inviter {{name}} de nouveau"),
	("settings.space.members.invitedAgainFailure.generic.description", "Nothing changed, try again.", "Rien n’a changé, réessayez."),
	("settings.space.members.confirm.title", "Remove {{name}} from {{space}}?", "Retirer {{name}} de {{space}} ?"),
	("settings.space.members.confirm.description", "{{name}} loses access right away. You can invite {{name}} again.", "{{name}} perd l’accès immédiatement. Vous pourrez inviter {{name}} de nouveau."),
	("settings.space.members.sent", "Invitation sent to {{email}}", "Invitation envoyée à {{email}}"),
	("settings.space.members.sentDescription", "It works once, until {{date}}.", "Elle sert une fois, jusqu’au {{date}}."),
	("settings.space.members.withdrawn", "Invitation to {{email}} withdrawn", "Invitation à {{email}} retirée"),
	("settings.space.members.withdrawnDescription", "The link in their email stops working.", "Le lien de leur e-mail ne fonctionne plus."),
	("settings.space.members.failure.invite.notHosting", "{{space}} isn’t hosted anymore. Turn on hosting to invite {{email}}.", "{{space}} n’est plus hébergé. Activez l’hébergement pour inviter {{email}}."),
	("settings.space.members.failure.invite.limitReached", "{{space}} can’t take more members. Remove someone to invite {{email}}.", "{{space}} ne peut pas accueillir plus de membres. Retirez quelqu’un pour inviter {{email}}."),
	("settings.space.members.failure.invite.notOwner", "This account doesn’t host {{space}}. Sign in with the account that does to invite {{email}}.", "Ce compte n’héberge pas {{space}}. Connectez-vous avec le compte qui l’héberge pour inviter {{email}}."),
	("settings.space.members.failure.invite.needsSignIn", "Couldn’t invite {{email}}, you’re signed out. Sign in to Kiroshi and invite them again.", "Impossible d’inviter {{email}}, vous êtes déconnecté. Connectez-vous à Kiroshi et invitez cette personne de nouveau."),
	("settings.space.members.failure.invite.unreachable", "Couldn’t reach Kiroshi to invite {{email}}. Check your connection and try again.", "Impossible de joindre Kiroshi pour inviter {{email}}. Vérifiez votre connexion et réessayez."),
	("settings.space.members.failure.invite.offline", "Couldn’t invite {{email}}, this computer is offline. Connect to the internet and try again.", "Impossible d’inviter {{email}}, cet ordinateur est hors ligne. Connectez-vous à Internet et réessayez."),
	("settings.space.members.failure.invite.timedOut", "Kiroshi took too long to answer, {{email}} wasn’t invited. Try again in a moment.", "Kiroshi a mis trop de temps à répondre, {{email}} n’a pas été invité. Réessayez dans un instant."),
	("settings.space.members.failure.invite.unsent", "The invitation to {{email}} didn’t leave this computer. Check your connection and try again.", "L’invitation à {{email}} n’est pas partie de cet ordinateur. Vérifiez votre connexion et réessayez."),
	("settings.space.members.failure.invite.relayStatus", "Kiroshi answered with error {{status}}, {{email}} wasn’t invited. Try again in a moment.", "Kiroshi a répondu par l’erreur {{status}}, {{email}} n’a pas été invité. Réessayez dans un instant."),
	("settings.space.members.failure.invite.relayConflict", "Kiroshi refused to invite {{email}} ({{code}}). Check the member list, then try again.", "Kiroshi a refusé d’inviter {{email}} ({{code}}). Vérifiez la liste des membres, puis réessayez."),
	("settings.space.members.failure.invite.unreadableConflict", "Kiroshi refused to invite {{email}} without saying why. Check the member list, then try again.", "Kiroshi a refusé d’inviter {{email}} sans dire pourquoi. Vérifiez la liste des membres, puis réessayez."),
	("settings.space.members.failure.invite.unreadableList", "Couldn’t read the member list from Kiroshi, {{email}} wasn’t invited. Try again in a moment.", "Impossible de lire la liste des membres envoyée par Kiroshi, {{email}} n’a pas été invité. Réessayez dans un instant."),
	("settings.space.members.failure.invite.listNotReadBack", "The invitation to {{email}} was sent, but the member list didn’t refresh. Open this space’s settings again to see it.", "L’invitation à {{email}} a été envoyée, mais la liste des membres ne s’est pas actualisée. Rouvrez les réglages de cet espace pour la voir."),
	("settings.space.members.failure.invite.generic", "Couldn’t invite {{email}}. Nothing changed, try again.", "Impossible d’inviter {{email}}. Rien n’a changé, réessayez."),
	("settings.space.members.failure.withdraw.gone", "The invitation to {{email}} is already gone. There’s nothing to withdraw.", "L’invitation à {{email}} n’existe déjà plus. Il n’y a rien à retirer."),
	("settings.space.members.failure.withdraw.joined", "{{name}} already joined. Select Remove to take them out of {{space}}.", "{{name}} a déjà rejoint l’espace. Sélectionnez Retirer pour l’exclure de {{space}}."),
	("settings.space.members.failure.withdraw.notHosting", "{{space}} isn’t hosted anymore. Turn on hosting to withdraw the invitation to {{email}}.", "{{space}} n’est plus hébergé. Activez l’hébergement pour retirer l’invitation à {{email}}."),
	("settings.space.members.failure.withdraw.notOwner", "This account doesn’t host {{space}}. Sign in with the account that does to withdraw the invitation to {{email}}.", "Ce compte n’héberge pas {{space}}. Connectez-vous avec le compte qui l’héberge pour retirer l’invitation à {{email}}."),
	("settings.space.members.failure.withdraw.needsSignIn", "Couldn’t withdraw the invitation to {{email}}, you’re signed out. Sign in to Kiroshi and try again.", "Impossible de retirer l’invitation à {{email}}, vous êtes déconnecté. Connectez-vous à Kiroshi et réessayez."),
	("settings.space.members.failure.withdraw.unreachable", "Couldn’t reach Kiroshi to withdraw the invitation to {{email}}. Check your connection and try again.", "Impossible de joindre Kiroshi pour retirer l’invitation à {{email}}. Vérifiez votre connexion et réessayez."),
	("settings.space.members.failure.withdraw.generic", "Couldn’t withdraw the invitation to {{email}}. Nothing changed, try again.", "Impossible de retirer l’invitation à {{email}}. Rien n’a changé, réessayez."),
	("settings.space.members.failure.remove.gone", "{{name}} isn’t a member anymore. There’s nothing to remove.", "{{name}} n’est plus membre. Il n’y a rien à retirer."),
	("settings.space.members.failure.remove.pending", "{{name}} hasn’t joined yet. Select Remove again to withdraw the invitation.", "{{name}} n’a pas encore rejoint l’espace. Sélectionnez Retirer de nouveau pour retirer l’invitation."),
	("settings.space.members.failure.remove.host", "You host {{space}}, so you can’t be removed. Turn off hosting instead.", "Vous hébergez {{space}}, vous ne pouvez donc pas être retiré. Désactivez plutôt l’hébergement."),
	("settings.space.members.failure.remove.hostedBy", "{{name}} hosts {{space}} and can’t be removed. There’s nothing to do.", "{{name}} héberge {{space}} et ne peut pas être retiré. Il n’y a rien à faire."),
	("settings.space.members.failure.remove.notHosting", "{{space}} isn’t hosted anymore. Turn on hosting to remove {{name}}.", "{{space}} n’est plus hébergé. Activez l’hébergement pour retirer {{name}}."),
	("settings.space.members.failure.remove.notOwner", "This account doesn’t host {{space}}. Sign in with the account that does to remove {{name}}.", "Ce compte n’héberge pas {{space}}. Connectez-vous avec le compte qui l’héberge pour retirer {{name}}."),
	("settings.space.members.failure.remove.needsSignIn", "Couldn’t remove {{name}}, you’re signed out. Sign in to Kiroshi and try again.", "Impossible de retirer {{name}}, vous êtes déconnecté. Connectez-vous à Kiroshi et réessayez."),
	("settings.space.members.failure.remove.unreachable", "Couldn’t reach Kiroshi to remove {{name}}. Check your connection and try again.", "Impossible de joindre Kiroshi pour retirer {{name}}. Vérifiez votre connexion et réessayez."),
	("settings.space.members.failure.remove.generic", "Couldn’t remove {{name}}. Nothing changed, try again.", "Impossible de retirer {{name}}. Rien n’a changé, réessayez."),
	("settings.space.hosting.label", "Share {{name}}", "Partager {{name}}"),
	("settings.space.hosting.description", "Invite people who aren’t on your network. {{name}} runs on this computer, so they reach it while Kiroshi is open here.", "Invitez des personnes qui ne sont pas sur votre réseau. {{name}} tourne sur cet ordinateur, elles y accèdent donc tant que Kiroshi est ouvert ici."),
	("settings.space.hosting.signedOut", "Sign in to Kiroshi to invite people who aren’t on your network.", "Connectez-vous à Kiroshi pour inviter des personnes qui ne sont pas sur votre réseau."),
	("settings.space.hosting.signIn", "Sign in", "Se connecter"),
	("settings.space.hosting.connecting", "Connecting…", "Connexion…"),
	("settings.space.hosting.online", "Online", "En ligne"),
	("settings.space.hosting.failed.title", "Couldn’t host {{name}}", "Impossible d’héberger {{name}}"),
	("settings.space.hosting.failed.description", "Check your connection and turn it on again.", "Vérifiez votre connexion et réactivez-le."),
	("settings.space.hosting.failed.reasons.notOwner", "Another account hosts this space. Sign in with that account, or turn it on again to host it from this one.", "Un autre compte héberge cet espace. Connectez-vous avec ce compte, ou réactivez-le pour l’héberger depuis celui-ci."),
	("settings.space.hosting.failed.reasons.deviceAwaitingApproval", "This computer isn’t approved yet. Approve it on a device you already use, then turn it on again.", "Cet ordinateur n’est pas encore approuvé. Approuvez-le sur un appareil que vous utilisez déjà, puis réactivez-le."),
	("settings.space.hosting.failed.reasons.deviceRefused", "Someone chose Not me on another device, so this computer was signed out. Sign in again and approve it on a device you already use.", "Quelqu’un a choisi Pas moi sur un autre appareil, cet ordinateur a donc été déconnecté. Reconnectez-vous et approuvez-le sur un appareil que vous utilisez déjà."),
	("settings.space.hosting.failed.reasons.keysMissing", "This computer couldn’t read the keys for this space. Quit Kiroshi, open it again, then turn hosting on again.", "Cet ordinateur n’a pas pu lire les clés de cet espace. Quittez Kiroshi, rouvrez-le, puis réactivez l’hébergement."),
	("settings.space.hosting.failed.reasons.instanceGone", "This space no longer exists on Kiroshi. Turn it on again to host it from this computer.", "Cet espace n’existe plus sur Kiroshi. Réactivez-le pour l’héberger depuis cet ordinateur."),
	("settings.space.hosting.failed.reasons.takenOver", "Another computer hosts this space now. Turn it on again to host it from this one.", "Un autre ordinateur héberge maintenant cet espace. Réactivez-le pour l’héberger depuis celui-ci."),
	("settings.space.hosting.failed.reasons.streamClosed", "This computer stopped hosting this space. Turn hosting on again.", "Cet ordinateur a arrêté d’héberger cet espace. Réactivez l’hébergement."),
	("settings.space.hosting.failed.reasons.unknown", "Check your connection and turn it on again.", "Vérifiez votre connexion et réactivez-le."),
	("settings.space.hosting.stopFailed.title", "Couldn’t stop hosting {{name}}", "Impossible d’arrêter d’héberger {{name}}"),
	("settings.space.hosting.stopFailed.description", "Turn it off again.", "Désactivez-le de nouveau."),
	("settings.space.danger.delete", "Delete space", "Supprimer l’espace"),
	("settings.space.danger.description", "Agents that are only in this space are deleted with it. This can’t be undone.", "Les agents présents uniquement dans cet espace sont supprimés avec lui. C’est irréversible."),
	("settings.space.danger.last", "You can’t delete your last space.", "Vous ne pouvez pas supprimer votre dernier espace."),
	("settings.space.danger.confirm.title", "Delete {{name}}?", "Supprimer {{name}} ?"),
	("bots.roster.backgroundTasks_many", "waiting on {{count}} background tasks", "attend {{count}} tâches en arrière-plan"),
	("bots.spaces.switchInvited_many", "Change space, {{name}} open, {{count}} invitations", "Changer d’espace, {{name}} ouvert, {{count}} invitations"),
	("bots.spaces.switchHostedInvited_many", "Change space, {{name}} open, {{host}}, {{count}} invitations", "Changer d’espace, {{name}} ouvert, {{host}}, {{count}} invitations"),
	("bots.history.summary_many", "Lists {{count}} changes since {{date}}. Undoing one writes a new change, so nothing’s ever removed.", "Liste {{count}} modifications depuis le {{date}}. Annuler une modification en écrit une nouvelle : rien n’est jamais supprimé."),
	("bots.history.retouches_many", "({{count}} goes)", "({{count}} fois)"),
	("bots.history.change.added_many", "{{count}} lines added", "{{count}} lignes ajoutées"),
	("bots.history.change.removed_many", "{{count}} lines removed", "{{count}} lignes supprimées"),
	("bots.history.change.consequence.counted_many", "Puts everything back to how it read before this change, across {{count}} files, and writes that as a new change you can undo too.", "Remet tout dans l’état d’avant cette modification, sur {{count}} fichiers, et écrit cela comme une nouvelle modification que vous pouvez annuler aussi."),
	("bots.applications.uses_many", "{{count, number}} uses", "{{count, number}} utilisations"),
	("bots.applications.connection.refused.description_many", "Kiroshi couldn’t refresh the token, so {{name}}’s {{count}} tools were left out of {{agent}}’s {{sessions}}. Signing in again is usually all it takes.", "Kiroshi n’a pas pu renouveler le jeton, les {{count}} outils de {{name}} ont donc été absents {{sessions}} de {{agent}}. Se reconnecter suffit en général."),
	("bots.applications.connection.refused.sessions_many", "last {{count}} sessions", "des {{count}} dernières sessions"),
	("bots.applications.install.tools.count.plain_many", "{{count}} tools", "{{count}} outils"),
	("chat.conversationEmptyState.description_many", "{{count}} agents are ready.", "{{count}} agents sont prêts."),
	("chat.transcript.mention.counted_many", "{{count}} mentions", "{{count}} mentions"),
	("chat.transcript.mention.unresolved.title_many", "Couldn’t summon these agents", "Impossible de convoquer ces agents"),
	("chat.transcript.mention.unresolved.description_many", "{{names}} were named but hold no seat in this conversation.", "{{names}} ont été nommés mais n’ont pas de siège dans cette conversation."),
	("chat.transcript.mention.notStarted.title_many", "{{names}} didn’t start", "{{names}} n’ont pas démarré"),
	("chat.transcript.mention.notStarted.description_many", "Seat them in this conversation, or pick other agents.", "Faites-les venir dans cette conversation, ou choisissez d’autres agents."),
	("chat.queue.title_many", "Queued · {{count}} · sent in order, one after each answer", "En file · {{count}} · partent dans l’ordre, une après chaque réponse"),
	("chat.pinned.counted_many", "Pinned messages, {{count}} pinned", "Messages épinglés, {{count}} épinglés"),
	("chat.working.backgroundTasks_many", "waiting on {{count}} background tasks", "attend {{count}} tâches en arrière-plan"),
	("chat.workLine.agents_many", "{{count}} agents", "{{count}} agents"),
	("chat.workLine.state_many", "are working…", "travaillent…"),
	("chat.workLine.others_many", "{{count}} others working", "{{count}} autres au travail"),
	("chat.workLine.breakdown.writing_many", "{{count}} writing", "{{count}} écrivent"),
	("chat.workLine.breakdown.tool_many", "{{count}} using a tool", "{{count}} utilisent un outil"),
	("chat.workLine.breakdown.thinking_many", "{{count}} thinking", "{{count}} réfléchissent"),
	("chat.workLine.breakdown.upNext_many", "{{count}} up next", "{{count}} passent ensuite"),
	("chat.composer.mentioned_many", "{{count}} mentions in the draft", "{{count}} mentions dans le brouillon"),
	("chat.composer.further_many", "Keep typing to reach the other {{count}} in {{space}}", "Continuez à taper pour atteindre les {{count}} autres dans {{space}}"),
	("chat.applicationInstall.secret_many", "Its keys go in {{secret}}.", "Ses clés vont dans {{secret}}."),
	("chat.webSources.counted_many", "{{count}} sources", "{{count}} sources"),
	("chat.answerBlock.gallery.more_many", "{{count}} more photos", "{{count}} photos de plus"),
	("chat.routines.detail.history.counted_many", "{{count}} runs", "{{count}} exécutions"),
	("chat.routines.detail.history.page_many", "Last {{count}} runs read", "{{count}} dernières exécutions lues"),
	("chat.routines.detail.history.reported_many", "{{count}} reports", "{{count}} rapports"),
	("chat.missions.activity.commitsAhead_many", "{{count}} commits ahead", "{{count}} commits d'avance"),
	("common.claudeImport.select.importItems_many", "Import {{count}} items", "Importer {{count}} éléments"),
	("common.claudeImport.select.importCompanions_many", "Import {{count}} agents", "Importer {{count}} agents"),
	("common.claudeImport.done.companions_many", "{{companions}} are ready.", "{{companions}} sont prêts."),
	("common.claudeImport.done.companionsWith_many", "{{companions}} are ready, with {{extras}}.", "{{companions}} sont prêts, avec {{extras}}."),
	("common.claudeImport.done.instructionsAndSkills_many", "Your CLAUDE.md and {{count}} skills are ready.", "Votre CLAUDE.md et {{count}} compétences sont prêts."),
	("common.claudeImport.done.onlySkills_many", "{{count}} skills are ready.", "{{count}} compétences sont prêtes."),
	("common.claudeImport.row.skills_many", "{{count}} skills", "{{count}} compétences"),
	("common.claudeImport.row.newSkills_many", "{{count}} new skills", "{{count}} nouvelles compétences"),
	("common.update.badge.botsBusy_many", "{{count}} agents are still running. Stop them to restart.", "{{count}} agents tournent encore. Arrêtez-les pour redémarrer."),
	("common.library.drop.title_many", "Drop to add {{count}} files to the Library", "Déposez pour ajouter {{count}} fichiers à la Bibliothèque"),
	("common.library.drop.more_many", "and {{count}} more", "et {{count}} autres"),
	("common.library.added.title_many", "{{count}} files added", "{{count}} fichiers ajoutés"),
	("common.library.added.stillImporting_many", "{{count}} files are still importing.", "{{count}} fichiers sont encore en cours d’importation."),
	("common.library.document.agents.writing_many", "{{count}} agents writing", "{{count}} agents écrivent"),
	("common.library.document.agents.summary_many", "{{count}} sentences added to “{{section}}”", "{{count}} phrases ajoutées à « {{section}} »"),
	("common.library.document.drop_many", "Drop to add {{count}} images here", "Déposez pour ajouter {{count}} images ici"),
	("common.board.presence.drawing_many", "{{count}} agents drawing", "{{count}} agents dessinent"),
	("common.board.card.drawing_many", "Board · {{name}} is drawing · {{count}} items", "Tableau · {{name}} dessine · {{count}} éléments"),
	("common.board.card.atRest_many", "Board · {{count}} items · {{edited}}", "Tableau · {{count}} éléments · {{edited}}"),
	("common.board.drop.images_many", "Drop to add {{count}} images here", "Déposez pour ajouter {{count}} images ici"),
	("common.board.drop.files_many", "Drop to add {{count}} files here", "Déposez pour ajouter {{count}} fichiers ici"),
	("settings.about.status.running_many", "{{count}} agents are still running. Stop them to restart.", "{{count}} agents tournent encore. Arrêtez-les pour redémarrer."),
	("settings.space.agents.skills_many", "{{count}} skills", "{{count}} compétences"),
	("settings.space.agents.applications_many", "{{count}} applications", "{{count}} applications"),
	("settings.space.members.pending_many", "Invited · expires in {{count}} days", "Invité · expire dans {{count}} jours"),
];

pub mod bots {
	pub mod applications {
		use crate::strings::Key;
		pub const UNTITLED: Key = Key(276);
		pub const ADD: Key = Key(277);
		pub const CREATE: Key = Key(278);
		pub const SAVE: Key = Key(279);
		pub const UNSAVED: Key = Key(280);
		pub const BACK: Key = Key(281);
		pub const SEARCH: Key = Key(282);
		pub const PASTE: Key = Key(283);
		pub const VERIFIED: Key = Key(284);
		pub const USES_ONE: Key = Key(285);
		pub const USES_OTHER: Key = Key(286);
		pub const HOSTED_ON: Key = Key(287);
		pub const OPEN: Key = Key(293);
		pub const NOTICE: Key = Key(358);
		pub const UNAVAILABLE: Key = Key(398);
		pub const USES_MANY: Key = Key(2069);
		pub mod args {
			use crate::strings::Key;
			pub const LABEL: Key = Key(416);
			pub const PLACEHOLDER: Key = Key(417);
			pub const HINT: Key = Key(418);
		}
		pub mod catalogue {
			use crate::strings::Key;
			pub const LOADING: Key = Key(365);
			pub const DIRECTORY: Key = Key(366);
			pub const EMPTY: Key = Key(367);
			pub const FAILED: Key = Key(368);
			pub const PARTLY_FAILED: Key = Key(369);
			pub const STALE: Key = Key(370);
			pub const RETRY: Key = Key(371);
			pub const UNAVAILABLE: Key = Key(390);
			pub const NOTHING: Key = Key(393);
			pub mod category {
				use crate::strings::Key;
				pub const EVERYTHING: Key = Key(372);
				pub const ON_THIS_MACHINE: Key = Key(373);
				pub const COMMERCE_SHOPPING: Key = Key(374);
				pub const COMMUNICATION: Key = Key(375);
				pub const CONSUMER_HEALTH: Key = Key(376);
				pub const CREATIVE: Key = Key(377);
				pub const DATA_ANALYTICS: Key = Key(378);
				pub const DEVELOPER_TOOLS: Key = Key(379);
				pub const EDUCATION: Key = Key(380);
				pub const FINANCIAL_SERVICES: Key = Key(381);
				pub const HEALTH_LIFE_SCIENCES: Key = Key(382);
				pub const LEGAL: Key = Key(383);
				pub const MEDIA_ENTERTAINMENT: Key = Key(384);
				pub const NONPROFIT: Key = Key(385);
				pub const PRODUCTIVITY: Key = Key(386);
				pub const SALES_MARKETING: Key = Key(387);
				pub const TRAVEL: Key = Key(388);
				pub const OTHER: Key = Key(389);
			}
			pub mod setup {
				use crate::strings::Key;
				pub const SIGN_IN: Key = Key(394);
				pub const API_KEY: Key = Key(395);
				pub const NONE: Key = Key(396);
				pub const UNAVAILABLE: Key = Key(397);
			}
			pub mod unrefreshed {
				use crate::strings::Key;
				pub const TITLE: Key = Key(391);
				pub const DESCRIPTION: Key = Key(392);
			}
		}
		pub mod command {
			use crate::strings::Key;
			pub const LABEL: Key = Key(413);
			pub const PLACEHOLDER: Key = Key(414);
			pub const HINT: Key = Key(415);
		}
		pub mod config {
			use crate::strings::Key;
			pub const LABEL: Key = Key(405);
			pub const PLACEHOLDER: Key = Key(406);
			pub const HINT: Key = Key(407);
			pub const INVALID: Key = Key(408);
		}
		pub mod connection {
			use crate::strings::Key;
			pub const CONNECT: Key = Key(301);
			pub const RETRY: Key = Key(302);
			pub const CANCEL: Key = Key(303);
			pub const DISCONNECT: Key = Key(304);
			pub const WAITING: Key = Key(307);
			pub mod confirm {
				use crate::strings::Key;
				pub const TITLE: Key = Key(318);
				pub const DESCRIPTION: Key = Key(319);
			}
			pub mod description {
				use crate::strings::Key;
				pub const NEEDS_AUTHORIZATION: Key = Key(308);
				pub const CONNECTING: Key = Key(309);
				pub const UNSAVED: Key = Key(310);
			}
			pub mod reason {
				use crate::strings::Key;
				pub const ALREADY_RUNNING: Key = Key(311);
				pub const STORE: Key = Key(312);
				pub const TRANSPORT: Key = Key(313);
				pub const REFUSED_URL: Key = Key(314);
				pub const BROWSER_REFUSED: Key = Key(315);
				pub const TIMED_OUT: Key = Key(316);
				pub const UNKNOWN: Key = Key(317);
			}
			pub mod refused {
				use crate::strings::Key;
				pub const TITLE: Key = Key(321);
				pub const DESCRIPTION_ONE: Key = Key(322);
				pub const DESCRIPTION_OTHER: Key = Key(323);
				pub const SESSIONS_ONE: Key = Key(324);
				pub const SESSIONS_OTHER: Key = Key(325);
				pub const ACTION: Key = Key(326);
				pub const DESCRIPTION_MANY: Key = Key(2070);
				pub const SESSIONS_MANY: Key = Key(2071);
			}
			pub mod row {
				use crate::strings::Key;
				pub const CONNECT: Key = Key(305);
				pub const RETRY: Key = Key(306);
			}
			pub mod session {
				use crate::strings::Key;
				pub const TITLE: Key = Key(320);
			}
			pub mod state {
				use crate::strings::Key;
				pub const CONNECTED: Key = Key(297);
				pub const NEEDS_AUTHORIZATION: Key = Key(298);
				pub const CONNECTING: Key = Key(299);
				pub const FAILED: Key = Key(300);
			}
		}
		pub mod delete {
			use crate::strings::Key;
			pub const ACTION: Key = Key(441);
			pub const DESCRIPTION: Key = Key(442);
			pub mod confirm {
				use crate::strings::Key;
				pub const TITLE: Key = Key(443);
			}
		}
		pub mod empty {
			pub mod description {
				use crate::strings::Key;
				pub const AGENT: Key = Key(362);
				pub const SPACE: Key = Key(363);
				pub const PROFILE: Key = Key(364);
			}
			pub mod title {
				use crate::strings::Key;
				pub const AGENT: Key = Key(359);
				pub const SPACE: Key = Key(360);
				pub const PROFILE: Key = Key(361);
			}
		}
		pub mod endpoint {
			use crate::strings::Key;
			pub const LABEL: Key = Key(422);
			pub const HINT: Key = Key(423);
			pub mod option {
				use crate::strings::Key;
				pub const HTTP: Key = Key(424);
				pub const SSE: Key = Key(425);
				pub const WS: Key = Key(426);
			}
		}
		pub mod footnote {
			use crate::strings::Key;
			pub const SPACE: Key = Key(291);
			pub const PROFILE: Key = Key(292);
		}
		pub mod headers {
			use crate::strings::Key;
			pub const LABEL: Key = Key(427);
			pub const PLACEHOLDER: Key = Key(428);
			pub const HINT: Key = Key(429);
		}
		pub mod install {
			use crate::strings::Key;
			pub const NONE: Key = Key(339);
			pub const HOSTED_NONE: Key = Key(340);
			pub const HOSTING: Key = Key(343);
			pub const DONE: Key = Key(353);
			pub const FAILED: Key = Key(354);
			pub const MISSING: Key = Key(355);
			pub mod footnote {
				use crate::strings::Key;
				pub const AGENT: Key = Key(347);
				pub const SPACE: Key = Key(348);
				pub const PROFILE: Key = Key(349);
			}
			pub mod hosted_footnote {
				use crate::strings::Key;
				pub const AGENT: Key = Key(350);
				pub const SPACE: Key = Key(351);
				pub const PROFILE: Key = Key(352);
			}
			pub mod key {
				use crate::strings::Key;
				pub const TITLE: Key = Key(331);
				pub const REVEAL: Key = Key(332);
				pub const CONCEAL: Key = Key(333);
				pub const REVEAL_LABEL: Key = Key(334);
				pub const CONCEAL_LABEL: Key = Key(335);
				pub mod description {
					use crate::strings::Key;
					pub const AGENT: Key = Key(336);
					pub const SPACE: Key = Key(337);
					pub const PROFILE: Key = Key(338);
				}
			}
			pub mod rollback {
				use crate::strings::Key;
				pub const TITLE: Key = Key(356);
				pub const DESCRIPTION: Key = Key(357);
			}
			pub mod sign_in {
				use crate::strings::Key;
				pub const TITLE: Key = Key(327);
				pub const DESCRIPTION: Key = Key(328);
				pub const ACTION: Key = Key(329);
				pub const FACT: Key = Key(330);
			}
			pub mod tools {
				use crate::strings::Key;
				pub const TITLE: Key = Key(344);
				pub mod count {
					use crate::strings::Key;
					pub const PLAIN_ONE: Key = Key(345);
					pub const PLAIN_OTHER: Key = Key(346);
					pub const PLAIN_MANY: Key = Key(2072);
				}
			}
			pub mod unavailable {
				use crate::strings::Key;
				pub const TITLE: Key = Key(341);
				pub const DESCRIPTION: Key = Key(342);
			}
		}
		pub mod intro {
			use crate::strings::Key;
			pub const AGENT: Key = Key(288);
			pub const SPACE: Key = Key(289);
			pub const PROFILE: Key = Key(290);
		}
		pub mod launch {
			use crate::strings::Key;
			pub const LABEL: Key = Key(436);
			pub const SECRETS: Key = Key(437);
			pub const UNKNOWN: Key = Key(438);
			pub const REVEAL: Key = Key(439);
			pub const CONCEAL: Key = Key(440);
		}
		pub mod leave {
			use crate::strings::Key;
			pub const TITLE: Key = Key(433);
			pub const DESCRIPTION: Key = Key(434);
			pub const ACTION: Key = Key(435);
		}
		pub mod name {
			use crate::strings::Key;
			pub const LABEL: Key = Key(401);
			pub const PLACEHOLDER: Key = Key(402);
			pub const HINT: Key = Key(403);
			pub const BLANK: Key = Key(404);
		}
		pub mod reopen {
			pub mod refused {
				use crate::strings::Key;
				pub const TITLE: Key = Key(399);
				pub const DESCRIPTION: Key = Key(400);
			}
		}
		pub mod secrets {
			use crate::strings::Key;
			pub const LABEL: Key = Key(430);
			pub const PLACEHOLDER: Key = Key(431);
			pub const HINT: Key = Key(432);
		}
		pub mod section {
			use crate::strings::Key;
			pub const CONNECTION: Key = Key(294);
			pub const SECRETS: Key = Key(295);
			pub const ADVANCED: Key = Key(296);
		}
		pub mod transport {
			use crate::strings::Key;
			pub const LABEL: Key = Key(409);
			pub const HINT: Key = Key(410);
			pub mod option {
				use crate::strings::Key;
				pub const LOCAL: Key = Key(411);
				pub const REMOTE: Key = Key(412);
			}
		}
		pub mod url {
			use crate::strings::Key;
			pub const LABEL: Key = Key(419);
			pub const PLACEHOLDER: Key = Key(420);
			pub const HINT: Key = Key(421);
		}
	}
	pub mod approvals {
		pub mod mode {
			use crate::strings::Key;
			pub const LABEL: Key = Key(493);
			pub mod option {
				pub mod accept_edits {
					use crate::strings::Key;
					pub const LABEL: Key = Key(498);
					pub const HINT: Key = Key(499);
				}
				pub mod auto {
					use crate::strings::Key;
					pub const LABEL: Key = Key(494);
					pub const HINT: Key = Key(495);
				}
				pub mod default {
					use crate::strings::Key;
					pub const LABEL: Key = Key(496);
					pub const HINT: Key = Key(497);
				}
				pub mod dont_ask {
					use crate::strings::Key;
					pub const LABEL: Key = Key(502);
					pub const HINT: Key = Key(503);
				}
				pub mod plan {
					use crate::strings::Key;
					pub const LABEL: Key = Key(500);
					pub const HINT: Key = Key(501);
				}
			}
		}
		pub mod rule {
			use crate::strings::Key;
			pub const ADD: Key = Key(504);
			pub const PLACEHOLDER: Key = Key(505);
			pub const INVALID: Key = Key(506);
			pub const REMOVE: Key = Key(507);
			pub mod allow {
				use crate::strings::Key;
				pub const LABEL: Key = Key(508);
				pub const HINT: Key = Key(509);
				pub const EMPTY: Key = Key(510);
			}
			pub mod ask {
				use crate::strings::Key;
				pub const LABEL: Key = Key(511);
				pub const HINT: Key = Key(512);
				pub const EMPTY: Key = Key(513);
			}
			pub mod deny {
				use crate::strings::Key;
				pub const LABEL: Key = Key(514);
				pub const HINT: Key = Key(515);
				pub const EMPTY: Key = Key(516);
			}
		}
	}
	pub mod danger {
		use crate::strings::Key;
		pub const DELETE: Key = Key(537);
		pub const DESCRIPTION: Key = Key(538);
		pub const FAILED: Key = Key(540);
		pub mod confirm {
			use crate::strings::Key;
			pub const TITLE: Key = Key(539);
		}
	}
	pub mod dialog {
		use crate::strings::Key;
		pub const UNTITLED: Key = Key(108);
		pub const BREADCRUMB: Key = Key(109);
		pub mod instructions {
			use crate::strings::Key;
			pub const LABEL: Key = Key(124);
			pub const PLACEHOLDER: Key = Key(125);
		}
		pub mod memory {
			use crate::strings::Key;
			pub const LABEL: Key = Key(126);
			pub const HINT: Key = Key(127);
			pub const EMPTY: Key = Key(128);
			pub const SAVE: Key = Key(129);
			pub mod clear {
				use crate::strings::Key;
				pub const ACTION: Key = Key(130);
				pub const TITLE: Key = Key(131);
				pub const DESCRIPTION: Key = Key(132);
				pub const CONFIRM: Key = Key(133);
			}
		}
		pub mod name {
			use crate::strings::Key;
			pub const LABEL: Key = Key(120);
			pub const PLACEHOLDER: Key = Key(121);
		}
		pub mod tab {
			use crate::strings::Key;
			pub const GENERAL: Key = Key(110);
			pub const APPEARANCE: Key = Key(111);
			pub const INSTRUCTIONS: Key = Key(112);
			pub const SKILLS: Key = Key(113);
			pub const APPLICATIONS: Key = Key(114);
			pub const SECRETS: Key = Key(115);
			pub const HISTORY: Key = Key(116);
			pub const APPROVALS: Key = Key(117);
			pub const RUNTIME: Key = Key(118);
			pub const DANGER: Key = Key(119);
		}
		pub mod title {
			use crate::strings::Key;
			pub const LABEL: Key = Key(122);
			pub const PLACEHOLDER: Key = Key(123);
		}
	}
	pub mod history {
		use crate::strings::Key;
		pub const EMPTY: Key = Key(134);
		pub const UNAVAILABLE: Key = Key(135);
		pub const SUMMARY_ONE: Key = Key(136);
		pub const SUMMARY_OTHER: Key = Key(137);
		pub const NO_MATCH: Key = Key(138);
		pub const RETOUCHES_ONE: Key = Key(139);
		pub const RETOUCHES_OTHER: Key = Key(140);
		pub const UNDONE: Key = Key(141);
		pub const SUMMARY_MANY: Key = Key(2064);
		pub const RETOUCHES_MANY: Key = Key(2065);
		pub mod author {
			use crate::strings::Key;
			pub const USER: Key = Key(151);
		}
		pub mod change {
			use crate::strings::Key;
			pub const BACK: Key = Key(161);
			pub const DATE: Key = Key(162);
			pub const ADDED_ONE: Key = Key(163);
			pub const ADDED_OTHER: Key = Key(164);
			pub const REMOVED_ONE: Key = Key(165);
			pub const REMOVED_OTHER: Key = Key(166);
			pub const UNAVAILABLE: Key = Key(170);
			pub const ADDED_MANY: Key = Key(2066);
			pub const REMOVED_MANY: Key = Key(2067);
			pub mod consequence {
				use crate::strings::Key;
				pub const COUNTED_ONE: Key = Key(167);
				pub const COUNTED_OTHER: Key = Key(168);
				pub const UNCOUNTED: Key = Key(169);
				pub const COUNTED_MANY: Key = Key(2068);
			}
		}
		pub mod day {
			use crate::strings::Key;
			pub const TODAY: Key = Key(146);
			pub const YESTERDAY: Key = Key(147);
		}
		pub mod diff {
			use crate::strings::Key;
			pub const SHOW: Key = Key(152);
			pub const HIDE: Key = Key(153);
			pub const LOADING: Key = Key(154);
			pub const FILENAME: Key = Key(155);
		}
		pub mod record_failed {
			use crate::strings::Key;
			pub const DESCRIPTION: Key = Key(145);
			pub mod title {
				use crate::strings::Key;
				pub const BOT: Key = Key(142);
				pub const USER: Key = Key(143);
				pub const SPACE: Key = Key(144);
			}
		}
		pub mod search {
			use crate::strings::Key;
			pub const LABEL: Key = Key(148);
			pub const PLACEHOLDER: Key = Key(149);
			pub const CLEAR: Key = Key(150);
		}
		pub mod undo {
			use crate::strings::Key;
			pub const ACTION: Key = Key(156);
			pub const LABEL: Key = Key(157);
			pub const TITLE: Key = Key(158);
			pub const DESCRIPTION: Key = Key(159);
			pub const CONFIRM: Key = Key(160);
		}
	}
	pub mod identity {
		use crate::strings::Key;
		pub const AVATAR: Key = Key(517);
		pub const UPLOADED_IMAGE: Key = Key(518);
		pub mod colour {
			use crate::strings::Key;
			pub const LABEL: Key = Key(519);
			pub const NONE: Key = Key(520);
			pub const OWN: Key = Key(521);
			pub const OWN_VALUE: Key = Key(522);
			pub const DEGREE: Key = Key(523);
			pub mod option {
				use crate::strings::Key;
				pub const RED: Key = Key(524);
				pub const YELLOW: Key = Key(525);
				pub const GREEN: Key = Key(526);
				pub const CYAN: Key = Key(527);
				pub const BLUE: Key = Key(528);
				pub const PURPLE: Key = Key(529);
				pub const PINK: Key = Key(530);
				pub const ORANGE: Key = Key(531);
			}
		}
		pub mod picture {
			use crate::strings::Key;
			pub const LABEL: Key = Key(532);
			pub const FILE: Key = Key(533);
			pub const ADD: Key = Key(534);
			pub const CHANGE: Key = Key(535);
			pub const REMOVE: Key = Key(536);
		}
	}
	pub mod rail {
		use crate::strings::Key;
		pub const LABEL: Key = Key(60);
		pub const CONVERSATIONS: Key = Key(61);
		pub const MISSIONS: Key = Key(62);
		pub const LIBRARY: Key = Key(63);
		pub const SEARCH_MISSIONS: Key = Key(64);
		pub const SPACE_SETTINGS: Key = Key(65);
		pub const DOT: Key = Key(66);
		pub mod badge {
			use crate::strings::Key;
			pub const ATTENTION: Key = Key(67);
			pub const DONE: Key = Key(68);
			pub const FAILED: Key = Key(69);
		}
	}
	pub mod roster {
		use crate::strings::Key;
		pub const LABEL: Key = Key(0);
		pub const CREATE: Key = Key(1);
		pub const CREATE_MENU: Key = Key(2);
		pub const EMPTY: Key = Key(8);
		pub const UNAVAILABLE: Key = Key(9);
		pub const FAILED: Key = Key(10);
		pub const RETRY: Key = Key(11);
		pub const PREVIEW_UNREADABLE: Key = Key(12);
		pub const SETTINGS_UNSAVED: Key = Key(13);
		pub const CONVERSATION_UNSAVED: Key = Key(14);
		pub const ACTIONS: Key = Key(21);
		pub const TITLED: Key = Key(22);
		pub const OPEN_IN_NEW_TAB: Key = Key(23);
		pub const SETTINGS: Key = Key(24);
		pub const DUPLICATE: Key = Key(25);
		pub const PIN: Key = Key(28);
		pub const PIN_DROP: Key = Key(29);
		pub const UNPIN: Key = Key(30);
		pub const MOVED: Key = Key(31);
		pub const MOVED_IN_SECTION: Key = Key(32);
		pub const DELETE: Key = Key(33);
		pub const NEEDS_YOU: Key = Key(34);
		pub const WORKING: Key = Key(35);
		pub const BACKGROUND_TASKS_ONE: Key = Key(36);
		pub const BACKGROUND_TASKS_OTHER: Key = Key(37);
		pub const IDLE: Key = Key(43);
		pub const SEED_REFUSED: Key = Key(59);
		pub const BACKGROUND_TASKS_MANY: Key = Key(2061);
		pub mod announcement {
			use crate::strings::Key;
			pub const NONE: Key = Key(44);
			pub const SELECTED: Key = Key(45);
		}
		pub mod conversation {
			use crate::strings::Key;
			pub const CREATE: Key = Key(3);
			pub const OTHERS: Key = Key(4);
			pub const PREVIEW: Key = Key(5);
			pub const YOU: Key = Key(6);
			pub const NOT_SENT: Key = Key(7);
		}
		pub mod mission {
			pub mod state {
				use crate::strings::Key;
				pub const WAITING: Key = Key(15);
				pub const FAILED: Key = Key(16);
				pub const READY: Key = Key(17);
				pub const WORKING: Key = Key(18);
			}
			pub mod unavailable {
				use crate::strings::Key;
				pub const TITLE: Key = Key(19);
				pub const DESCRIPTION: Key = Key(20);
			}
		}
		pub mod pose {
			use crate::strings::Key;
			pub const THINKING: Key = Key(38);
			pub const SEARCHING: Key = Key(39);
			pub const WORKING: Key = Key(40);
			pub const WRITING: Key = Key(41);
			pub const WAITING: Key = Key(42);
		}
		pub mod section {
			use crate::strings::Key;
			pub const ACTIONS: Key = Key(46);
			pub const MOVE_TO: Key = Key(47);
			pub const NONE: Key = Key(48);
			pub const CREATE: Key = Key(49);
			pub const CREATE_FIELD: Key = Key(50);
			pub const CREATE_DEFAULT: Key = Key(51);
			pub const RENAME: Key = Key(52);
			pub const RENAME_FIELD: Key = Key(53);
			pub const MOVE_UP: Key = Key(54);
			pub const MOVE_DOWN: Key = Key(55);
			pub const DELETE: Key = Key(56);
			pub const EMPTY: Key = Key(57);
			pub const UNREADABLE: Key = Key(58);
		}
		pub mod spaces {
			use crate::strings::Key;
			pub const LABEL: Key = Key(26);
			pub const LAST_SPACE: Key = Key(27);
		}
	}
	pub mod runtime {
		pub mod effort {
			use crate::strings::Key;
			pub const LABEL: Key = Key(481);
			pub mod option {
				use crate::strings::Key;
				pub const DEFAULT: Key = Key(482);
				pub const LOW: Key = Key(483);
				pub const MEDIUM: Key = Key(484);
				pub const HIGH: Key = Key(485);
				pub const XHIGH: Key = Key(486);
				pub const MAX: Key = Key(487);
			}
		}
		pub mod model {
			use crate::strings::Key;
			pub const LABEL: Key = Key(478);
			pub const PLACEHOLDER: Key = Key(479);
			pub const UNREADABLE: Key = Key(480);
		}
		pub mod output_style {
			use crate::strings::Key;
			pub const LABEL: Key = Key(488);
			pub mod option {
				pub mod concise {
					use crate::strings::Key;
					pub const LABEL: Key = Key(489);
					pub const HINT: Key = Key(490);
				}
				pub mod default {
					use crate::strings::Key;
					pub const LABEL: Key = Key(491);
					pub const HINT: Key = Key(492);
				}
			}
		}
	}
	pub mod secrets {
		use crate::strings::Key;
		pub const ADD: Key = Key(444);
		pub const NOTICE: Key = Key(445);
		pub mod empty {
			use crate::strings::Key;
			pub const TITLE: Key = Key(448);
			pub const DESCRIPTION: Key = Key(449);
		}
		pub mod remove {
			use crate::strings::Key;
			pub const TITLE: Key = Key(474);
			pub const DESCRIPTION: Key = Key(475);
			pub const ACTION: Key = Key(476);
			pub const FAILED: Key = Key(477);
		}
		pub mod row {
			use crate::strings::Key;
			pub const SCOPES: Key = Key(454);
			pub const OVERRIDDEN: Key = Key(455);
			pub const OVERRIDING: Key = Key(456);
			pub const NEEDS_VALUE: Key = Key(457);
			pub const UNSET_HERE: Key = Key(458);
			pub const NO_VALUE: Key = Key(459);
			pub const REPLACE: Key = Key(460);
			pub const REMOVE: Key = Key(461);
		}
		pub mod scope {
			use crate::strings::Key;
			pub const USER: Key = Key(450);
			pub const SPACE: Key = Key(451);
			pub const BOT: Key = Key(452);
			pub const SERVER: Key = Key(453);
		}
		pub mod set {
			use crate::strings::Key;
			pub const SUBMIT: Key = Key(472);
			pub const FAILED: Key = Key(473);
			pub mod add {
				use crate::strings::Key;
				pub const TITLE: Key = Key(462);
				pub const DESCRIPTION: Key = Key(463);
			}
			pub mod name {
				use crate::strings::Key;
				pub const LABEL: Key = Key(466);
				pub const PLACEHOLDER: Key = Key(467);
				pub const HINT: Key = Key(468);
				pub const INVALID: Key = Key(469);
			}
			pub mod replace {
				use crate::strings::Key;
				pub const TITLE: Key = Key(464);
				pub const DESCRIPTION: Key = Key(465);
			}
			pub mod value {
				use crate::strings::Key;
				pub const LABEL: Key = Key(470);
				pub const HINT: Key = Key(471);
			}
		}
		pub mod unreadable {
			use crate::strings::Key;
			pub const TITLE: Key = Key(446);
			pub const DESCRIPTION: Key = Key(447);
		}
	}
	pub mod skills {
		use crate::strings::Key;
		pub const UNTITLED: Key = Key(171);
		pub const ADD: Key = Key(172);
		pub const CREATE: Key = Key(173);
		pub const SAVE: Key = Key(174);
		pub const UNSAVED: Key = Key(175);
		pub const BACK: Key = Key(176);
		pub mod agent {
			use crate::strings::Key;
			pub const LABEL: Key = Key(231);
			pub const PLACEHOLDER: Key = Key(232);
			pub const HINT: Key = Key(233);
		}
		pub mod allowed_tools {
			use crate::strings::Key;
			pub const LABEL: Key = Key(236);
			pub const PLACEHOLDER: Key = Key(237);
			pub const HINT: Key = Key(238);
		}
		pub mod argument_hint {
			use crate::strings::Key;
			pub const LABEL: Key = Key(198);
			pub const PLACEHOLDER: Key = Key(199);
			pub const HINT: Key = Key(200);
		}
		pub mod arguments {
			use crate::strings::Key;
			pub const LABEL: Key = Key(201);
			pub const PLACEHOLDER: Key = Key(202);
		}
		pub mod background {
			use crate::strings::Key;
			pub const LABEL: Key = Key(234);
			pub const DESCRIPTION: Key = Key(235);
		}
		pub mod body {
			use crate::strings::Key;
			pub const LABEL: Key = Key(196);
			pub const PLACEHOLDER: Key = Key(197);
		}
		pub mod budget {
			use crate::strings::Key;
			pub const LABEL: Key = Key(193);
			pub const HINT: Key = Key(194);
			pub const OVER: Key = Key(195);
		}
		pub mod compatibility {
			use crate::strings::Key;
			pub const LABEL: Key = Key(246);
			pub const PLACEHOLDER: Key = Key(247);
			pub const HINT: Key = Key(248);
		}
		pub mod context {
			use crate::strings::Key;
			pub const LABEL: Key = Key(223);
			pub const DEFAULT: Key = Key(224);
			pub const HINT: Key = Key(225);
			pub mod option {
				use crate::strings::Key;
				pub const SHARED: Key = Key(226);
				pub const FORK: Key = Key(227);
			}
		}
		pub mod delete {
			use crate::strings::Key;
			pub const ACTION: Key = Key(255);
			pub const DESCRIPTION: Key = Key(256);
			pub mod confirm {
				use crate::strings::Key;
				pub const TITLE: Key = Key(257);
			}
		}
		pub mod description {
			use crate::strings::Key;
			pub const LABEL: Key = Key(189);
			pub const PLACEHOLDER: Key = Key(190);
		}
		pub mod disallowed_tools {
			use crate::strings::Key;
			pub const LABEL: Key = Key(239);
			pub const PLACEHOLDER: Key = Key(240);
		}
		pub mod effort {
			use crate::strings::Key;
			pub const LABEL: Key = Key(218);
			pub const DEFAULT: Key = Key(219);
			pub mod option {
				use crate::strings::Key;
				pub const LOW: Key = Key(220);
				pub const MEDIUM: Key = Key(221);
				pub const HIGH: Key = Key(222);
			}
		}
		pub mod empty {
			use crate::strings::Key;
			pub const TITLE: Key = Key(183);
			pub const DESCRIPTION: Key = Key(184);
		}
		pub mod files {
			use crate::strings::Key;
			pub const BACK: Key = Key(258);
			pub const SAVE: Key = Key(259);
			pub const LOADING: Key = Key(260);
			pub const RETRY: Key = Key(261);
			pub mod add {
				use crate::strings::Key;
				pub const LABEL: Key = Key(262);
				pub const PLACEHOLDER: Key = Key(263);
				pub const HINT: Key = Key(264);
				pub const BLANK: Key = Key(265);
				pub const TAKEN: Key = Key(266);
				pub const ACTION: Key = Key(267);
			}
			pub mod delete {
				use crate::strings::Key;
				pub const ACTION: Key = Key(273);
				pub const DESCRIPTION: Key = Key(274);
				pub mod confirm {
					use crate::strings::Key;
					pub const TITLE: Key = Key(275);
				}
			}
			pub mod failure {
				use crate::strings::Key;
				pub const READ: Key = Key(270);
				pub const WRITE: Key = Key(271);
				pub const DELETE: Key = Key(272);
			}
			pub mod text {
				use crate::strings::Key;
				pub const LABEL: Key = Key(268);
				pub const PLACEHOLDER: Key = Key(269);
			}
		}
		pub mod hooks {
			use crate::strings::Key;
			pub const LABEL: Key = Key(241);
			pub const PLACEHOLDER: Key = Key(242);
			pub const HINT: Key = Key(243);
		}
		pub mod leave {
			use crate::strings::Key;
			pub const TITLE: Key = Key(252);
			pub const DESCRIPTION: Key = Key(253);
			pub const ACTION: Key = Key(254);
		}
		pub mod license {
			use crate::strings::Key;
			pub const LABEL: Key = Key(244);
			pub const PLACEHOLDER: Key = Key(245);
		}
		pub mod metadata {
			use crate::strings::Key;
			pub const LABEL: Key = Key(249);
			pub const PLACEHOLDER: Key = Key(250);
			pub const HINT: Key = Key(251);
		}
		pub mod model {
			use crate::strings::Key;
			pub const LABEL: Key = Key(215);
			pub const PLACEHOLDER: Key = Key(216);
			pub const HINT: Key = Key(217);
		}
		pub mod model_invocation {
			use crate::strings::Key;
			pub const LABEL: Key = Key(206);
			pub const DESCRIPTION: Key = Key(207);
		}
		pub mod name {
			use crate::strings::Key;
			pub const LABEL: Key = Key(185);
			pub const PLACEHOLDER: Key = Key(186);
			pub const HINT: Key = Key(187);
			pub const BLANK: Key = Key(188);
		}
		pub mod paths {
			use crate::strings::Key;
			pub const LABEL: Key = Key(203);
			pub const PLACEHOLDER: Key = Key(204);
			pub const HINT: Key = Key(205);
		}
		pub mod preloaded {
			use crate::strings::Key;
			pub const LABEL: Key = Key(210);
			pub const TAG: Key = Key(211);
			pub const DESCRIPTION: Key = Key(212);
		}
		pub mod section {
			use crate::strings::Key;
			pub const INSTRUCTIONS: Key = Key(177);
			pub const TRIGGERING: Key = Key(178);
			pub const EXECUTION: Key = Key(179);
			pub const TOOLS: Key = Key(180);
			pub const FILES: Key = Key(181);
			pub const ADVANCED: Key = Key(182);
		}
		pub mod shell {
			use crate::strings::Key;
			pub const LABEL: Key = Key(228);
			pub const PLACEHOLDER: Key = Key(229);
			pub const HINT: Key = Key(230);
		}
		pub mod system {
			use crate::strings::Key;
			pub const TAG: Key = Key(213);
			pub const NOTICE: Key = Key(214);
		}
		pub mod user_invocable {
			use crate::strings::Key;
			pub const LABEL: Key = Key(208);
			pub const DESCRIPTION: Key = Key(209);
		}
		pub mod when_to_use {
			use crate::strings::Key;
			pub const LABEL: Key = Key(191);
			pub const PLACEHOLDER: Key = Key(192);
		}
	}
	pub mod spaces {
		use crate::strings::Key;
		pub const LABEL: Key = Key(70);
		pub const SWITCH: Key = Key(71);
		pub const SWITCH_HOSTED: Key = Key(72);
		pub const SWITCH_INVITED_ONE: Key = Key(73);
		pub const SWITCH_INVITED_OTHER: Key = Key(74);
		pub const SWITCH_HOSTED_INVITED_ONE: Key = Key(75);
		pub const SWITCH_HOSTED_INVITED_OTHER: Key = Key(76);
		pub const OPEN: Key = Key(77);
		pub const CREATE: Key = Key(78);
		pub const SHORTCUT: Key = Key(79);
		pub const SWITCH_INVITED_MANY: Key = Key(2062);
		pub const SWITCH_HOSTED_INVITED_MANY: Key = Key(2063);
		pub mod host {
			use crate::strings::Key;
			pub const SHARED: Key = Key(80);
			pub const UP: Key = Key(81);
			pub const CONNECTING: Key = Key(82);
			pub const DOWN: Key = Key(83);
		}
		pub mod invitations {
			use crate::strings::Key;
			pub const LABEL: Key = Key(86);
			pub const INVITED_BY: Key = Key(87);
			pub const EXPIRES: Key = Key(88);
			pub const ACCEPT: Key = Key(89);
			pub const DECLINE: Key = Key(90);
			pub const JOINING: Key = Key(91);
			pub const RETRY: Key = Key(92);
			pub const WITHDRAWN: Key = Key(95);
			pub const EXPIRED: Key = Key(96);
			pub const HOST_OFFLINE: Key = Key(97);
			pub mod failed {
				use crate::strings::Key;
				pub const SERVERS: Key = Key(93);
				pub const OFFLINE: Key = Key(94);
			}
		}
		pub mod remove {
			use crate::strings::Key;
			pub const LAST_SPACE: Key = Key(84);
			pub const FAILED: Key = Key(85);
		}
		pub mod removed {
			use crate::strings::Key;
			pub const NOTICE: Key = Key(98);
			pub const NOTICE_DESCRIPTION: Key = Key(99);
			pub const MEMBER_NOTICE: Key = Key(100);
			pub const MEMBER_NOTICE_DESCRIPTION: Key = Key(101);
			pub const DELETED_NOTICE: Key = Key(102);
			pub const DELETED_NOTICE_DESCRIPTION: Key = Key(103);
		}
		pub mod sign_out {
			use crate::strings::Key;
			pub const TITLE: Key = Key(104);
			pub const DESCRIPTION: Key = Key(105);
			pub const CONFIRM: Key = Key(106);
			pub const NOTICE: Key = Key(107);
		}
	}
}
pub mod chat {
	pub mod activity {
		pub mod empty {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1000);
			pub const DESCRIPTION: Key = Key(1001);
		}
		pub mod failure {
			pub mod activity {
				use crate::strings::Key;
				pub const TITLE: Key = Key(1006);
				pub const DESCRIPTION: Key = Key(1007);
			}
			pub mod missions {
				use crate::strings::Key;
				pub const TITLE: Key = Key(1002);
				pub const DESCRIPTION: Key = Key(1003);
			}
			pub mod routines {
				use crate::strings::Key;
				pub const TITLE: Key = Key(1004);
				pub const DESCRIPTION: Key = Key(1005);
			}
			pub mod write {
				use crate::strings::Key;
				pub const TITLE: Key = Key(1008);
				pub const DESCRIPTION: Key = Key(1009);
			}
		}
		pub mod missions {
			pub mod group {
				use crate::strings::Key;
				pub const WAITING: Key = Key(994);
				pub const IN_PROGRESS: Key = Key(995);
				pub const EARLIER_TODAY: Key = Key(996);
			}
		}
		pub mod panel {
			use crate::strings::Key;
			pub const CLOSE: Key = Key(990);
			pub const LABEL: Key = Key(991);
			pub const TOGGLE: Key = Key(992);
			pub const TITLE: Key = Key(993);
		}
		pub mod routines {
			use crate::strings::Key;
			pub const TITLE: Key = Key(997);
			pub const BACK: Key = Key(998);
		}
		pub mod runs {
			use crate::strings::Key;
			pub const REPORTED: Key = Key(999);
		}
	}
	pub mod answer_block {
		pub mod callout {
			use crate::strings::Key;
			pub const NOTE: Key = Key(800);
			pub const TIP: Key = Key(801);
			pub const WARNING: Key = Key(802);
		}
		pub mod checklist {
			use crate::strings::Key;
			pub const COPY: Key = Key(781);
		}
		pub mod gallery {
			use crate::strings::Key;
			pub const TILE: Key = Key(803);
			pub const MORE_ONE: Key = Key(804);
			pub const MORE_OTHER: Key = Key(805);
			pub const MORE_MANY: Key = Key(2093);
		}
		pub mod image {
			use crate::strings::Key;
			pub const UNTITLED: Key = Key(797);
			pub const COPY_FAILED: Key = Key(798);
			pub const OPEN_FAILED: Key = Key(799);
		}
		pub mod interactive {
			use crate::strings::Key;
			pub const RESULT: Key = Key(793);
			pub const NOT_DEFINED: Key = Key(794);
			pub const USE: Key = Key(795);
			pub const SUMMARY: Key = Key(796);
		}
		pub mod map {
			use crate::strings::Key;
			pub const OPEN: Key = Key(792);
		}
		pub mod sourced_image {
			use crate::strings::Key;
			pub const SAVE: Key = Key(782);
			pub const SAVING: Key = Key(783);
			pub const UNAVAILABLE: Key = Key(784);
			pub const OPEN_ORIGINAL: Key = Key(785);
		}
		pub mod video {
			use crate::strings::Key;
			pub const PLAY: Key = Key(788);
			pub const PAUSE: Key = Key(789);
			pub const SEEK: Key = Key(790);
			pub const FAILED: Key = Key(791);
		}
		pub mod web_page {
			use crate::strings::Key;
			pub const OPEN: Key = Key(786);
			pub const OPEN_FAILED: Key = Key(787);
		}
	}
	pub mod answered_question {
		use crate::strings::Key;
		pub const BY_VIEWER: Key = Key(743);
		pub const BY_MEMBER: Key = Key(744);
	}
	pub mod application_install {
		use crate::strings::Key;
		pub const OPEN_SETTINGS: Key = Key(753);
		pub const SECRET_ONE: Key = Key(757);
		pub const SECRET_OTHER: Key = Key(758);
		pub const UNREADABLE: Key = Key(759);
		pub const SECRET_MANY: Key = Key(2091);
		pub mod receipt {
			use crate::strings::Key;
			pub const AGENT: Key = Key(754);
			pub const SPACE: Key = Key(755);
			pub const USER: Key = Key(756);
		}
	}
	pub mod attachments {
		use crate::strings::Key;
		pub const LABEL: Key = Key(698);
		pub const OPEN: Key = Key(699);
		pub const REMOVE: Key = Key(700);
		pub const ATTACH: Key = Key(701);
	}
	pub mod code {
		use crate::strings::Key;
		pub const SNIPPET: Key = Key(760);
		pub const NAMED_SNIPPET: Key = Key(761);
		pub const COPY: Key = Key(762);
		pub const COPIED: Key = Key(763);
		pub const COPY_TOOLTIP: Key = Key(764);
		pub const COPY_ANNOUNCED: Key = Key(765);
		pub const COPY_FAILED: Key = Key(766);
		pub const WRITING: Key = Key(767);
		pub const READY: Key = Key(768);
	}
	pub mod composer {
		use crate::strings::Key;
		pub const LABEL: Key = Key(702);
		pub const PLACEHOLDER: Key = Key(703);
		pub const SEND: Key = Key(704);
		pub const OFFLINE: Key = Key(705);
		pub const COMMANDS: Key = Key(706);
		pub const MENTIONS: Key = Key(707);
		pub const LEAD: Key = Key(708);
		pub const MENTIONED_ONE: Key = Key(709);
		pub const MENTIONED_OTHER: Key = Key(710);
		pub const OUTSIDE: Key = Key(711);
		pub const INVITE: Key = Key(712);
		pub const FURTHER_ONE: Key = Key(713);
		pub const FURTHER_OTHER: Key = Key(714);
		pub const MENTIONED_MANY: Key = Key(2089);
		pub const FURTHER_MANY: Key = Key(2090);
	}
	pub mod connection {
		use crate::strings::Key;
		pub const CHECKING: Key = Key(563);
		pub const READY: Key = Key(564);
		pub const UNAVAILABLE: Key = Key(565);
		pub const CRASHED: Key = Key(566);
	}
	pub mod conversation_arrival {
		use crate::strings::Key;
		pub const INVITED_BY_PERSON: Key = Key(560);
		pub const INVITED_BY_AGENT: Key = Key(561);
		pub const CREATED_BY: Key = Key(562);
	}
	pub mod conversation_empty_state {
		use crate::strings::Key;
		pub const DESCRIPTION_ONE: Key = Key(554);
		pub const DESCRIPTION_OTHER: Key = Key(555);
		pub const HINT: Key = Key(556);
		pub const DESCRIPTION_MANY: Key = Key(2073);
		pub mod nobody {
			use crate::strings::Key;
			pub const TITLE: Key = Key(557);
			pub const DESCRIPTION: Key = Key(558);
			pub const SUGGESTED: Key = Key(559);
		}
	}
	pub mod conversation_seating {
		use crate::strings::Key;
		pub const FAILED: Key = Key(943);
		pub const REFUSED: Key = Key(944);
		pub const UNAVAILABLE: Key = Key(945);
	}
	pub mod conversation_settings {
		use crate::strings::Key;
		pub const BREADCRUMB: Key = Key(946);
		pub const UNTITLED: Key = Key(947);
		pub mod danger {
			use crate::strings::Key;
			pub const DELETE: Key = Key(986);
			pub const DESCRIPTION: Key = Key(987);
			pub const FAILED: Key = Key(989);
			pub mod confirm {
				use crate::strings::Key;
				pub const TITLE: Key = Key(988);
			}
		}
		pub mod icon {
			use crate::strings::Key;
			pub const LABEL: Key = Key(954);
			pub mod option {
				use crate::strings::Key;
				pub const MESSAGE_SQUARE: Key = Key(955);
				pub const BUG: Key = Key(956);
				pub const ROCKET: Key = Key(957);
				pub const SHIELD_KEY: Key = Key(958);
				pub const PEN: Key = Key(959);
				pub const FILE_TEXT: Key = Key(960);
				pub const DOWNLOAD: Key = Key(961);
				pub const LAPTOP: Key = Key(962);
				pub const SMARTPHONE: Key = Key(963);
				pub const BOOK_OPEN: Key = Key(964);
				pub const CREDIT_CARD: Key = Key(965);
				pub const MEGAPHONE: Key = Key(966);
				pub const PANEL_LEFT: Key = Key(967);
				pub const CODE: Key = Key(968);
				pub const TERMINAL: Key = Key(969);
				pub const SERVER: Key = Key(970);
				pub const GLOBE: Key = Key(971);
				pub const PALETTE: Key = Key(972);
				pub const LIGHTBULB: Key = Key(973);
				pub const CHART_LINE: Key = Key(974);
				pub const CALENDAR: Key = Key(975);
				pub const USERS: Key = Key(976);
				pub const FLAG: Key = Key(977);
				pub const SPARKLES: Key = Key(978);
			}
		}
		pub mod instructions {
			use crate::strings::Key;
			pub const LABEL: Key = Key(979);
			pub const PLACEHOLDER: Key = Key(980);
		}
		pub mod name {
			use crate::strings::Key;
			pub const LABEL: Key = Key(952);
			pub const PLACEHOLDER: Key = Key(953);
		}
		pub mod participants {
			use crate::strings::Key;
			pub const LABEL: Key = Key(981);
			pub const LEAD: Key = Key(982);
			pub const PROMOTE: Key = Key(983);
			pub const DISMISS: Key = Key(984);
			pub const LAST: Key = Key(985);
		}
		pub mod tab {
			use crate::strings::Key;
			pub const GENERAL: Key = Key(948);
			pub const PARTICIPANTS: Key = Key(949);
			pub const INSTRUCTIONS: Key = Key(950);
			pub const DANGER: Key = Key(951);
		}
	}
	pub mod diagram {
		use crate::strings::Key;
		pub const LABEL: Key = Key(772);
	}
	pub mod empty_state {
		use crate::strings::Key;
		pub const SETTINGS: Key = Key(550);
		pub const HINT: Key = Key(551);
		pub const SETUP: Key = Key(552);
		pub const SIGN_IN: Key = Key(553);
		pub mod not_connected {
			use crate::strings::Key;
			pub const TITLE: Key = Key(548);
			pub const DESCRIPTION: Key = Key(549);
		}
		pub mod ready {
			use crate::strings::Key;
			pub const TITLE: Key = Key(541);
			pub const DESCRIPTION: Key = Key(542);
			pub const DESCRIPTION_NAMED: Key = Key(543);
		}
		pub mod unavailable {
			use crate::strings::Key;
			pub const TITLE: Key = Key(544);
			pub const TITLE_NAMED: Key = Key(545);
			pub const DESCRIPTION: Key = Key(546);
			pub const DESCRIPTION_NAMED: Key = Key(547);
		}
	}
	pub mod file_reference {
		use crate::strings::Key;
		pub const WRITING: Key = Key(775);
	}
	pub mod interactive_view {
		use crate::strings::Key;
		pub const MADE_BY: Key = Key(745);
		pub const MODES: Key = Key(746);
		pub const INLINE: Key = Key(747);
		pub const PINNED: Key = Key(748);
		pub const FULLSCREEN: Key = Key(749);
	}
	pub mod missions {
		use crate::strings::Key;
		pub const LIVE: Key = Key(1112);
		pub mod activity {
			use crate::strings::Key;
			pub const COMMITS_AHEAD_ONE: Key = Key(1140);
			pub const COMMITS_AHEAD_OTHER: Key = Key(1141);
			pub const COMMITS_AHEAD_MANY: Key = Key(2097);
		}
		pub mod card {
			use crate::strings::Key;
			pub const OPEN: Key = Key(1163);
		}
		pub mod composer {
			use crate::strings::Key;
			pub const PLACEHOLDER: Key = Key(1170);
		}
		pub mod event {
			use crate::strings::Key;
			pub const LINK: Key = Key(1139);
			pub mod kind {
				use crate::strings::Key;
				pub const OPENED: Key = Key(1128);
				pub const NOTE: Key = Key(1129);
				pub const AGENT_ASKED: Key = Key(1130);
				pub const ANSWERED: Key = Key(1131);
				pub const ESCALATED: Key = Key(1132);
				pub const READY: Key = Key(1133);
				pub const CHECKS_FAILED: Key = Key(1134);
				pub const FAILED: Key = Key(1135);
				pub const CLOSED: Key = Key(1136);
				pub const DISMISSED: Key = Key(1137);
				pub const REOPENED: Key = Key(1138);
			}
			pub mod line {
				use crate::strings::Key;
				pub const OPENED: Key = Key(1117);
				pub const NOTE: Key = Key(1118);
				pub const AGENT_ASKED: Key = Key(1119);
				pub const ANSWERED: Key = Key(1120);
				pub const ESCALATED: Key = Key(1121);
				pub const READY: Key = Key(1122);
				pub const CHECKS_FAILED: Key = Key(1123);
				pub const FAILED: Key = Key(1124);
				pub const CLOSED: Key = Key(1125);
				pub const DISMISSED: Key = Key(1126);
				pub const REOPENED: Key = Key(1127);
			}
			pub mod source {
				use crate::strings::Key;
				pub const BOT: Key = Key(1113);
				pub const READER: Key = Key(1114);
				pub const AGENT: Key = Key(1115);
				pub const GITHUB: Key = Key(1116);
			}
		}
		pub mod failure {
			pub mod read {
				use crate::strings::Key;
				pub const TITLE: Key = Key(1171);
				pub const DESCRIPTION: Key = Key(1172);
			}
			pub mod run {
				use crate::strings::Key;
				pub const TITLE: Key = Key(1175);
				pub const DESCRIPTION: Key = Key(1176);
			}
			pub mod send {
				use crate::strings::Key;
				pub const TITLE: Key = Key(1173);
				pub const DESCRIPTION: Key = Key(1174);
			}
		}
		pub mod feed {
			use crate::strings::Key;
			pub const LABEL: Key = Key(1167);
		}
		pub mod header {
			use crate::strings::Key;
			pub const TOOLS: Key = Key(1164);
			pub const BACK: Key = Key(1165);
			pub const OPENED_AT: Key = Key(1166);
		}
		pub mod menu {
			use crate::strings::Key;
			pub const LABEL: Key = Key(1144);
			pub const OPEN: Key = Key(1145);
			pub const OPEN_PULL_REQUEST: Key = Key(1146);
			pub const COPY: Key = Key(1147);
			pub const MESSAGE_AGENT: Key = Key(1152);
			pub const STOP_AGENT: Key = Key(1153);
			pub const ANSWER: Key = Key(1154);
			pub const CLOSE: Key = Key(1155);
			pub const REOPEN: Key = Key(1156);
			pub const COPIED: Key = Key(1157);
			pub mod copy_kind {
				use crate::strings::Key;
				pub const ISSUE_ID: Key = Key(1148);
				pub const BRANCH: Key = Key(1149);
				pub const PULL_REQUEST_URL: Key = Key(1150);
				pub const WORKSPACE_PATH: Key = Key(1151);
			}
			pub mod failed {
				use crate::strings::Key;
				pub const OPEN_PULL_REQUEST: Key = Key(1158);
				pub const COPY: Key = Key(1159);
				pub const STOP_AGENT: Key = Key(1160);
				pub const CLOSE: Key = Key(1161);
				pub const REOPEN: Key = Key(1162);
			}
		}
		pub mod panel {
			pub mod empty {
				use crate::strings::Key;
				pub const TITLE: Key = Key(1105);
				pub const DESCRIPTION: Key = Key(1106);
			}
		}
		pub mod pull_request {
			use crate::strings::Key;
			pub const LABEL: Key = Key(1142);
			pub const OPEN: Key = Key(1143);
		}
		pub mod state {
			use crate::strings::Key;
			pub const WAITING_HUMAN: Key = Key(1107);
			pub const READY_TO_MERGE: Key = Key(1108);
			pub const FAILED: Key = Key(1109);
			pub const DONE: Key = Key(1110);
			pub const CLOSED: Key = Key(1111);
		}
		pub mod summons {
			use crate::strings::Key;
			pub const WORKING: Key = Key(1168);
			pub const WAITING_BOT: Key = Key(1169);
		}
	}
	pub mod nameless_conversation {
		use crate::strings::Key;
		pub const SEPARATOR: Key = Key(942);
	}
	pub mod notice {
		use crate::strings::Key;
		pub const RETRY: Key = Key(682);
		pub const DISMISS: Key = Key(683);
	}
	pub mod onboarding {
		pub mod access {
			use crate::strings::Key;
			pub const HEADER: Key = Key(1183);
			pub const QUESTION: Key = Key(1184);
			pub mod api_key {
				use crate::strings::Key;
				pub const LABEL: Key = Key(1187);
				pub const DESCRIPTION: Key = Key(1188);
			}
			pub mod sign_in {
				use crate::strings::Key;
				pub const LABEL: Key = Key(1185);
				pub const DESCRIPTION: Key = Key(1186);
			}
		}
		pub mod account {
			use crate::strings::Key;
			pub const HEADER: Key = Key(1177);
			pub const QUESTION: Key = Key(1178);
			pub mod another {
				use crate::strings::Key;
				pub const LABEL: Key = Key(1181);
				pub const DESCRIPTION: Key = Key(1182);
			}
			pub mod r#use {
				use crate::strings::Key;
				pub const LABEL: Key = Key(1179);
				pub const DESCRIPTION: Key = Key(1180);
			}
		}
		pub mod api_key {
			use crate::strings::Key;
			pub const HEADER: Key = Key(1194);
			pub const QUESTION: Key = Key(1195);
			pub const ENTRY: Key = Key(1196);
			pub const PLACEHOLDER: Key = Key(1197);
			pub const EXIT: Key = Key(1198);
		}
		pub mod arrival {
			use crate::strings::Key;
			pub const FAILURE: Key = Key(1209);
			pub const FIRST_COMPANION_MISSING: Key = Key(1210);
			pub const UNKNOWN_COMPANION: Key = Key(1211);
		}
		pub mod code {
			use crate::strings::Key;
			pub const HEADER: Key = Key(1189);
			pub const QUESTION: Key = Key(1190);
			pub const LINK: Key = Key(1191);
			pub const ENTRY: Key = Key(1192);
			pub const EXIT: Key = Key(1193);
		}
		pub mod connect {
			use crate::strings::Key;
			pub const FOUND_IN: Key = Key(1248);
			pub const CONTINUE: Key = Key(1256);
			pub const CONNECTING: Key = Key(1257);
			pub mod agent_missing {
				use crate::strings::Key;
				pub const TITLE: Key = Key(1261);
				pub const BODY: Key = Key(1262);
				pub const DOWNLOAD: Key = Key(1263);
			}
			pub mod browser {
				use crate::strings::Key;
				pub const BODY: Key = Key(1251);
				pub const WAITING: Key = Key(1252);
				pub const CHECKING: Key = Key(1253);
				pub const PLACEHOLDER: Key = Key(1254);
				pub const REOPEN: Key = Key(1255);
			}
			pub mod failed {
				use crate::strings::Key;
				pub const CANCELLED: Key = Key(1258);
				pub const TIMED_OUT: Key = Key(1259);
				pub const LINK_REFUSED: Key = Key(1260);
			}
			pub mod key {
				use crate::strings::Key;
				pub const BODY: Key = Key(1264);
			}
			pub mod provider {
				use crate::strings::Key;
				pub const TITLE: Key = Key(1249);
				pub const BODY: Key = Key(1250);
			}
		}
		pub mod connection {
			pub mod key_failed {
				use crate::strings::Key;
				pub const TITLE: Key = Key(1204);
				pub const SENTENCE: Key = Key(1205);
				pub const ANOTHER_KEY: Key = Key(1206);
				pub const ANOTHER_KEY_DESCRIPTION: Key = Key(1207);
				pub const SIGN_IN: Key = Key(1208);
			}
		}
		pub mod intro {
			use crate::strings::Key;
			pub const SKIP: Key = Key(1212);
			pub const BACK: Key = Key(1213);
			pub const NEXT: Key = Key(1214);
			pub const GET_STARTED: Key = Key(1215);
			pub const PROGRESS: Key = Key(1216);
			pub const POSITION: Key = Key(1217);
			pub mod companions {
				use crate::strings::Key;
				pub const TITLE: Key = Key(1218);
				pub const BODY: Key = Key(1219);
				pub mod atlas {
					use crate::strings::Key;
					pub const NAME: Key = Key(1220);
					pub const JOB: Key = Key(1221);
				}
				pub mod juniper {
					use crate::strings::Key;
					pub const NAME: Key = Key(1222);
					pub const JOB: Key = Key(1223);
				}
				pub mod wren {
					use crate::strings::Key;
					pub const NAME: Key = Key(1224);
					pub const JOB: Key = Key(1225);
				}
			}
			pub mod conversations {
				use crate::strings::Key;
				pub const TITLE: Key = Key(1226);
				pub const BODY: Key = Key(1227);
				pub const THREAD: Key = Key(1228);
				pub const ASK: Key = Key(1229);
				pub const REPLY: Key = Key(1230);
				pub const MISSION: Key = Key(1231);
				pub const MISSION_DETAIL: Key = Key(1232);
				pub const STATUS: Key = Key(1233);
			}
			pub mod spaces {
				use crate::strings::Key;
				pub const TITLE: Key = Key(1234);
				pub const BODY: Key = Key(1235);
				pub mod personal {
					use crate::strings::Key;
					pub const NAME: Key = Key(1238);
					pub const DETAIL: Key = Key(1239);
				}
				pub mod work {
					use crate::strings::Key;
					pub const NAME: Key = Key(1236);
					pub const DETAIL: Key = Key(1237);
				}
			}
			pub mod tools {
				use crate::strings::Key;
				pub const TITLE: Key = Key(1240);
				pub const BODY: Key = Key(1241);
				pub const FOLDERS: Key = Key(1242);
				pub const FOLDERS_DETAIL: Key = Key(1243);
				pub const APPLICATIONS: Key = Key(1244);
				pub const APPLICATIONS_DETAIL: Key = Key(1245);
				pub const SECRETS: Key = Key(1246);
				pub const SECRETS_DETAIL: Key = Key(1247);
			}
		}
		pub mod sign_in_failed {
			use crate::strings::Key;
			pub const HEADER: Key = Key(1199);
			pub const QUESTION: Key = Key(1200);
			pub const TITLE: Key = Key(1201);
			pub mod retry {
				use crate::strings::Key;
				pub const LABEL: Key = Key(1202);
				pub const DESCRIPTION: Key = Key(1203);
			}
		}
	}
	pub mod pinned {
		use crate::strings::Key;
		pub const TITLE: Key = Key(637);
		pub const COUNTED_ONE: Key = Key(638);
		pub const COUNTED_OTHER: Key = Key(639);
		pub const JUMP: Key = Key(640);
		pub const JUMP_TO: Key = Key(641);
		pub const UNPIN: Key = Key(642);
		pub const EMPTY: Key = Key(643);
		pub const COUNTED_MANY: Key = Key(2080);
		pub mod unavailable {
			use crate::strings::Key;
			pub const TITLE: Key = Key(644);
			pub const DESCRIPTION: Key = Key(645);
		}
	}
	pub mod queue {
		use crate::strings::Key;
		pub const TITLE_ONE: Key = Key(626);
		pub const TITLE_OTHER: Key = Key(627);
		pub const YOU: Key = Key(628);
		pub const NEXT: Key = Key(629);
		pub const SEND_NOW: Key = Key(630);
		pub const REMOVE: Key = Key(631);
		pub const TITLE_MANY: Key = Key(2079);
	}
	pub mod reply {
		use crate::strings::Key;
		pub const LABEL: Key = Key(632);
		pub const JUMP: Key = Key(633);
		pub const DISMISS: Key = Key(634);
		pub const DISMISS_FROM: Key = Key(635);
		pub const EXCERPT: Key = Key(636);
	}
	pub mod rich_block {
		use crate::strings::Key;
		pub const BUILDING: Key = Key(617);
		pub mod pending {
			use crate::strings::Key;
			pub const INTERACTIVE: Key = Key(618);
			pub const GALLERY: Key = Key(619);
			pub const ILLUSTRATED_LIST: Key = Key(620);
			pub const CHECKLIST: Key = Key(621);
			pub const COLLAPSIBLE: Key = Key(622);
			pub const WEB_PAGE: Key = Key(623);
			pub const VIDEO: Key = Key(624);
			pub const MAP: Key = Key(625);
		}
	}
	pub mod routines {
		pub mod confirm {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1096);
			pub const DESCRIPTION: Key = Key(1097);
			pub const LABEL: Key = Key(1098);
			pub const FAILURE: Key = Key(1099);
		}
		pub mod detail {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1069);
			pub const BACK: Key = Key(1070);
			pub mod history {
				use crate::strings::Key;
				pub const LABEL: Key = Key(1076);
				pub const READING: Key = Key(1077);
				pub const COUNTED_ONE: Key = Key(1078);
				pub const COUNTED_OTHER: Key = Key(1079);
				pub const PAGE_ONE: Key = Key(1080);
				pub const PAGE_OTHER: Key = Key(1081);
				pub const REPORTED_ONE: Key = Key(1082);
				pub const REPORTED_OTHER: Key = Key(1083);
				pub const LATEST: Key = Key(1084);
				pub const COUNTED_MANY: Key = Key(2094);
				pub const PAGE_MANY: Key = Key(2095);
				pub const REPORTED_MANY: Key = Key(2096);
				pub mod empty {
					use crate::strings::Key;
					pub const TITLE: Key = Key(1090);
					pub const DESCRIPTION: Key = Key(1091);
				}
				pub mod failure {
					use crate::strings::Key;
					pub const TITLE: Key = Key(1092);
					pub const DESCRIPTION: Key = Key(1093);
				}
				pub mod outcome {
					use crate::strings::Key;
					pub const REPORTED: Key = Key(1085);
					pub const NOTHING: Key = Key(1086);
					pub const SKIPPED: Key = Key(1087);
					pub const FAILED: Key = Key(1088);
					pub const RUNNING: Key = Key(1089);
				}
			}
			pub mod run_now {
				use crate::strings::Key;
				pub const ACTION: Key = Key(1071);
				pub mod refusal {
					use crate::strings::Key;
					pub const DISABLED: Key = Key(1072);
					pub const FILTER: Key = Key(1073);
					pub const DEDUPE_VALUE_MISSING: Key = Key(1074);
					pub const ALREADY_SEEN: Key = Key(1075);
				}
			}
		}
		pub mod empty {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1100);
			pub const DESCRIPTION: Key = Key(1101);
		}
		pub mod form {
			use crate::strings::Key;
			pub const NEW: Key = Key(1010);
			pub const EDIT: Key = Key(1011);
			pub const BACK: Key = Key(1012);
			pub const SAVE: Key = Key(1013);
			pub mod error {
				use crate::strings::Key;
				pub const BLANK_TITLE: Key = Key(1063);
				pub const BLANK_INSTRUCTION: Key = Key(1064);
				pub const BLANK_VALUE: Key = Key(1065);
				pub const UNTYPED_COMPARISON: Key = Key(1066);
				pub const UNREADABLE_EXPRESSION: Key = Key(1067);
				pub const UNSUPPORTED_OPERATOR: Key = Key(1068);
			}
			pub mod expression {
				use crate::strings::Key;
				pub const LABEL: Key = Key(1021);
				pub const PLACEHOLDER: Key = Key(1022);
			}
			pub mod filter {
				use crate::strings::Key;
				pub const LABEL: Key = Key(1033);
				pub const EVERY_EVENT: Key = Key(1034);
				pub const ADD: Key = Key(1035);
				pub const ROW: Key = Key(1036);
				pub const REMOVE: Key = Key(1037);
				pub mod field {
					use crate::strings::Key;
					pub const LABEL: Key = Key(1041);
					pub const OTHER_PATH: Key = Key(1042);
				}
				pub mod field_types {
					use crate::strings::Key;
					pub const STRING: Key = Key(1059);
					pub const NUMBER: Key = Key(1060);
					pub const BOOLEAN: Key = Key(1061);
					pub const DATETIME: Key = Key(1062);
				}
				pub mod match_mode {
					use crate::strings::Key;
					pub const LABEL: Key = Key(1038);
					pub const ALL: Key = Key(1039);
					pub const ANY: Key = Key(1040);
				}
				pub mod operator {
					use crate::strings::Key;
					pub const LABEL: Key = Key(1045);
				}
				pub mod operators {
					use crate::strings::Key;
					pub const EXISTS: Key = Key(1049);
					pub const NOT_EXISTS: Key = Key(1050);
					pub const EQUALS: Key = Key(1051);
					pub const NOT_EQUALS: Key = Key(1052);
					pub const CONTAINS: Key = Key(1053);
					pub const NOT_CONTAINS: Key = Key(1054);
					pub const STARTS_WITH: Key = Key(1055);
					pub const ENDS_WITH: Key = Key(1056);
					pub const GT: Key = Key(1057);
					pub const LT: Key = Key(1058);
				}
				pub mod path {
					use crate::strings::Key;
					pub const LABEL: Key = Key(1043);
					pub const PLACEHOLDER: Key = Key(1044);
				}
				pub mod value {
					use crate::strings::Key;
					pub const LABEL: Key = Key(1046);
					pub const TRUE: Key = Key(1047);
					pub const FALSE: Key = Key(1048);
				}
			}
			pub mod instruction {
				use crate::strings::Key;
				pub const LABEL: Key = Key(1016);
				pub const PLACEHOLDER: Key = Key(1017);
			}
			pub mod path {
				use crate::strings::Key;
				pub const LABEL: Key = Key(1023);
				pub const PLACEHOLDER: Key = Key(1024);
			}
			pub mod source {
				use crate::strings::Key;
				pub const LABEL: Key = Key(1018);
				pub const PLACEHOLDER: Key = Key(1019);
				pub const TIED: Key = Key(1020);
			}
			pub mod title {
				use crate::strings::Key;
				pub const LABEL: Key = Key(1014);
				pub const PLACEHOLDER: Key = Key(1015);
			}
			pub mod webhook {
				use crate::strings::Key;
				pub const URL: Key = Key(1025);
				pub const KEY: Key = Key(1026);
				pub const HEADER: Key = Key(1027);
				pub const COPY: Key = Key(1028);
				pub const COPIED: Key = Key(1029);
				pub const READING: Key = Key(1030);
				pub const PENDING: Key = Key(1031);
				pub const FAILURE: Key = Key(1032);
			}
		}
		pub mod leave {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1102);
			pub const DESCRIPTION: Key = Key(1103);
			pub const ACTION: Key = Key(1104);
		}
		pub mod row {
			use crate::strings::Key;
			pub const DELETE: Key = Key(1094);
			pub const STOPPED: Key = Key(1095);
		}
	}
	pub mod screen {
		use crate::strings::Key;
		pub const LABEL: Key = Key(806);
		pub const IDENTITY: Key = Key(807);
		pub const CONVERSATION_IDENTITY: Key = Key(808);
		pub const PLACEHOLDER: Key = Key(809);
		pub const ATTACHMENTS_REFUSED: Key = Key(814);
		pub const RESTART: Key = Key(815);
		pub mod approval {
			use crate::strings::Key;
			pub const DESCRIPTION: Key = Key(810);
			pub const DESCRIPTION_NAMED: Key = Key(811);
			pub const PATH: Key = Key(812);
		}
		pub mod attachment {
			use crate::strings::Key;
			pub const MEGABYTES: Key = Key(934);
			pub const STORAGE: Key = Key(935);
			pub const UNKNOWN_CONVERSATION: Key = Key(936);
			pub const TOO_MANY: Key = Key(937);
			pub const TOO_LARGE: Key = Key(938);
			pub const TOO_LARGE_TOGETHER: Key = Key(939);
			pub const UNREADABLE: Key = Key(940);
			pub const UNWRITABLE: Key = Key(941);
		}
		pub mod notice {
			use crate::strings::Key;
			pub const CRASHED: Key = Key(816);
			pub const CRASHED_NAMED: Key = Key(817);
			pub const RESUME_FAILED: Key = Key(818);
			pub const SETTINGS_REJECTED: Key = Key(819);
			pub const SETTINGS_REJECTED_NAMED: Key = Key(820);
			pub const SERVER_ENV_REJECTED: Key = Key(821);
			pub const NOT_AUTHENTICATED: Key = Key(822);
			pub const UNAVAILABLE: Key = Key(823);
			pub const UNAVAILABLE_NAMED: Key = Key(824);
			pub const FAILED: Key = Key(825);
			pub const STOP_FAILED: Key = Key(826);
			pub const STOP_FAILED_NAMED: Key = Key(827);
			pub const DOCK_BADGE_FAILED: Key = Key(828);
			pub const HOST_ONLY: Key = Key(833);
			pub const READ_FAILED: Key = Key(896);
			pub mod describe_refused {
				use crate::strings::Key;
				pub const TITLE: Key = Key(836);
				pub const DESCRIPTION: Key = Key(837);
			}
			pub mod host_offline {
				use crate::strings::Key;
				pub const TITLE: Key = Key(834);
				pub const DESCRIPTION: Key = Key(835);
			}
			pub mod join_refused {
				pub mod bad_signature {
					use crate::strings::Key;
					pub const TITLE: Key = Key(874);
					pub const DESCRIPTION: Key = Key(875);
				}
				pub mod could_not_accept {
					use crate::strings::Key;
					pub const TITLE: Key = Key(868);
					pub const DESCRIPTION: Key = Key(869);
				}
				pub mod invitation_expired {
					use crate::strings::Key;
					pub const TITLE: Key = Key(860);
					pub const DESCRIPTION: Key = Key(861);
				}
				pub mod invitation_other_email {
					use crate::strings::Key;
					pub const TITLE: Key = Key(866);
					pub const DESCRIPTION: Key = Key(867);
				}
				pub mod invitation_used {
					use crate::strings::Key;
					pub const TITLE: Key = Key(864);
					pub const DESCRIPTION: Key = Key(865);
				}
				pub mod invitation_withdrawn {
					use crate::strings::Key;
					pub const TITLE: Key = Key(862);
					pub const DESCRIPTION: Key = Key(863);
				}
				pub mod key_store {
					use crate::strings::Key;
					pub const TITLE: Key = Key(892);
					pub const DESCRIPTION: Key = Key(893);
				}
				pub mod needs_sign_in {
					use crate::strings::Key;
					pub const TITLE: Key = Key(850);
					pub const DESCRIPTION: Key = Key(851);
				}
				pub mod no_invitation {
					use crate::strings::Key;
					pub const TITLE: Key = Key(870);
					pub const DESCRIPTION: Key = Key(871);
				}
				pub mod not_in_roster {
					use crate::strings::Key;
					pub const TITLE: Key = Key(872);
					pub const DESCRIPTION: Key = Key(873);
				}
				pub mod owner_not_removable {
					use crate::strings::Key;
					pub const TITLE: Key = Key(848);
					pub const DESCRIPTION: Key = Key(849);
				}
				pub mod proxy_unavailable {
					use crate::strings::Key;
					pub const TITLE: Key = Key(846);
					pub const DESCRIPTION: Key = Key(847);
				}
				pub mod relay_refused {
					use crate::strings::Key;
					pub const TITLE: Key = Key(858);
					pub const DESCRIPTION: Key = Key(859);
				}
				pub mod relay_unreachable {
					use crate::strings::Key;
					pub const TITLE: Key = Key(856);
					pub const DESCRIPTION: Key = Key(857);
				}
				pub mod removed_by_rotation {
					use crate::strings::Key;
					pub const TITLE: Key = Key(876);
					pub const DESCRIPTION: Key = Key(877);
				}
				pub mod session_revoked {
					use crate::strings::Key;
					pub const TITLE: Key = Key(852);
					pub const DESCRIPTION: Key = Key(853);
				}
				pub mod session_store {
					use crate::strings::Key;
					pub const TITLE: Key = Key(854);
					pub const DESCRIPTION: Key = Key(855);
				}
				pub mod storage {
					use crate::strings::Key;
					pub const TITLE: Key = Key(840);
					pub const DESCRIPTION: Key = Key(841);
				}
				pub mod unavailable {
					use crate::strings::Key;
					pub const TITLE: Key = Key(838);
					pub const DESCRIPTION: Key = Key(839);
				}
				pub mod undeliverable {
					use crate::strings::Key;
					pub const TITLE: Key = Key(844);
					pub const DESCRIPTION: Key = Key(845);
				}
				pub mod unexpected {
					use crate::strings::Key;
					pub const TITLE: Key = Key(894);
					pub const DESCRIPTION: Key = Key(895);
				}
				pub mod unknown_joined_space {
					use crate::strings::Key;
					pub const TITLE: Key = Key(842);
					pub const DESCRIPTION: Key = Key(843);
				}
				pub mod waiting_for_host {
					use crate::strings::Key;
					pub const TITLE: Key = Key(878);
					pub const DESCRIPTION: Key = Key(879);
					pub mod reasons {
						use crate::strings::Key;
						pub const RELAY_UNREACHABLE: Key = Key(880);
						pub const REKEY_SEND_FAILED: Key = Key(881);
						pub const HOST_SILENT: Key = Key(882);
						pub const SOCKET_CLOSED: Key = Key(883);
						pub const REKEY_NOT_VERIFIED: Key = Key(884);
						pub const NOT_MEMBER: Key = Key(885);
						pub const UNKNOWN_INSTANCE: Key = Key(886);
						pub const DEVICE_KEYS_UNREADABLE: Key = Key(887);
						pub const DEVICE_AWAITING_APPROVAL: Key = Key(888);
						pub const SOCKET_URL_FAILED: Key = Key(889);
						pub const ROSTER_MISSING: Key = Key(890);
						pub const KEYCHAIN_READ_FAILED: Key = Key(891);
					}
				}
			}
			pub mod question_run_failed {
				use crate::strings::Key;
				pub const TITLE: Key = Key(829);
				pub const DESCRIPTION: Key = Key(830);
			}
			pub mod unauthorized {
				use crate::strings::Key;
				pub const TITLE: Key = Key(831);
				pub const DESCRIPTION: Key = Key(832);
			}
		}
		pub mod question {
			use crate::strings::Key;
			pub const RECALL: Key = Key(813);
		}
		pub mod transport {
			use crate::strings::Key;
			pub const BINARY_NOT_FOUND: Key = Key(897);
			pub const BINARY_NOT_FOUND_NAMED: Key = Key(898);
			pub const NOT_AUTHENTICATED: Key = Key(899);
			pub const NOT_CONNECTED: Key = Key(900);
			pub const AUTH_CHECK_FAILED: Key = Key(901);
			pub const SPAWN_FAILED: Key = Key(902);
			pub const SPAWN_FAILED_NAMED: Key = Key(903);
			pub const STARTUP_TIMEOUT: Key = Key(904);
			pub const STARTUP_TIMEOUT_NAMED: Key = Key(905);
			pub const CRASHED: Key = Key(906);
			pub const CRASHED_NAMED: Key = Key(907);
			pub const CRASHED_DETAIL: Key = Key(908);
			pub const CRASHED_DETAIL_NAMED: Key = Key(909);
			pub const CRASHED_UNKNOWN_CODE: Key = Key(910);
			pub const CRASHED_UNKNOWN_CODE_NAMED: Key = Key(911);
			pub const CRASHED_UNKNOWN_CODE_DETAIL: Key = Key(912);
			pub const CRASHED_UNKNOWN_CODE_DETAIL_NAMED: Key = Key(913);
			pub const RESUME_FAILED: Key = Key(914);
			pub const RESUME_FAILED_NAMED: Key = Key(915);
			pub const INVALID_FRAME: Key = Key(916);
			pub const SETTINGS_REJECTED: Key = Key(917);
			pub const SERVER_ENV_REJECTED: Key = Key(918);
			pub const NOT_STARTED: Key = Key(919);
			pub const TURN_ALREADY_RUNNING: Key = Key(920);
			pub const TRANSITION_IN_PROGRESS: Key = Key(921);
			pub const NO_ACTIVE_TURN: Key = Key(922);
			pub const STALE_RUNTIME_SESSION: Key = Key(923);
			pub const UNKNOWN_PERMISSION: Key = Key(924);
			pub const WRITE_FAILED: Key = Key(925);
			pub const RUN_LAPSED_SILENT: Key = Key(926);
			pub const RUN_LAPSED_SILENT_NAMED: Key = Key(927);
			pub const RUN_LAPSED_INTERRUPT: Key = Key(928);
			pub const RUN_LAPSED_INTERRUPT_NAMED: Key = Key(929);
			pub const RUN_LAPSED_TASKS_PENDING: Key = Key(930);
			pub const RUN_LAPSED_TASKS_PENDING_NAMED: Key = Key(931);
			pub const READ_FAILED: Key = Key(932);
			pub const UNKNOWN_FAILURE: Key = Key(933);
		}
	}
	pub mod selection_quote {
		use crate::strings::Key;
		pub const LABEL: Key = Key(750);
		pub const GROUP: Key = Key(751);
		pub const REMOVE: Key = Key(752);
	}
	pub mod space_access_banner {
		pub mod offline {
			use crate::strings::Key;
			pub const TITLE: Key = Key(684);
			pub const BODY: Key = Key(685);
			pub mod reasons {
				use crate::strings::Key;
				pub const RELAY_UNREACHABLE: Key = Key(686);
				pub const REKEY_SEND_FAILED: Key = Key(687);
				pub const HOST_SILENT: Key = Key(688);
				pub const SOCKET_CLOSED: Key = Key(689);
				pub const REKEY_NOT_VERIFIED: Key = Key(690);
				pub const NOT_MEMBER: Key = Key(691);
				pub const UNKNOWN_INSTANCE: Key = Key(692);
				pub const DEVICE_KEYS_UNREADABLE: Key = Key(693);
				pub const DEVICE_AWAITING_APPROVAL: Key = Key(694);
				pub const SOCKET_URL_FAILED: Key = Key(695);
				pub const ROSTER_MISSING: Key = Key(696);
				pub const KEYCHAIN_READ_FAILED: Key = Key(697);
			}
		}
	}
	pub mod table {
		use crate::strings::Key;
		pub const LABEL: Key = Key(769);
		pub const COPY: Key = Key(770);
		pub const COPY_ANNOUNCED: Key = Key(771);
	}
	pub mod task {
		use crate::strings::Key;
		pub const DONE: Key = Key(773);
		pub const TODO: Key = Key(774);
	}
	pub mod tool_approval {
		use crate::strings::Key;
		pub const TITLE: Key = Key(715);
		pub const SENSITIVE: Key = Key(719);
		pub const INPUT: Key = Key(720);
		pub const ALLOW_ONCE: Key = Key(721);
		pub const DENY: Key = Key(722);
		pub mod status {
			use crate::strings::Key;
			pub const PENDING: Key = Key(716);
			pub const ALLOWED: Key = Key(717);
			pub const DENIED: Key = Key(718);
		}
	}
	pub mod tool_question {
		use crate::strings::Key;
		pub const FREE_TEXT: Key = Key(723);
		pub const FREE_TEXT_PLACEHOLDER: Key = Key(724);
		pub const BLANK: Key = Key(725);
		pub const PREVIEW: Key = Key(726);
		pub const SUBMIT: Key = Key(727);
		pub const SEND: Key = Key(728);
		pub const NEXT: Key = Key(729);
		pub const NEXT_LABEL: Key = Key(730);
		pub const CONTINUE: Key = Key(731);
		pub const SKIP: Key = Key(732);
		pub const MINIMISE: Key = Key(733);
		pub const PICK_ANY: Key = Key(734);
		pub const COPY: Key = Key(739);
		pub const COPIED: Key = Key(740);
		pub const COPY_ANNOUNCED: Key = Key(741);
		pub const COPY_FAILED: Key = Key(742);
		pub mod waiting {
			use crate::strings::Key;
			pub const TITLE: Key = Key(735);
			pub const UNNAMED_TITLE: Key = Key(736);
			pub const MARK: Key = Key(737);
			pub const ANSWER: Key = Key(738);
		}
	}
	pub mod transcript {
		use crate::strings::Key;
		pub const LABEL: Key = Key(567);
		pub const LOAD_NEWER: Key = Key(568);
		pub const JUMP_TO_LATEST: Key = Key(569);
		pub const NEW_MESSAGES: Key = Key(570);
		pub const START_OF_HISTORY: Key = Key(571);
		pub const SHOW_MORE: Key = Key(581);
		pub const SHOW_LESS: Key = Key(582);
		pub mod author {
			use crate::strings::Key;
			pub const LEAD: Key = Key(583);
			pub const DELETED: Key = Key(584);
		}
		pub mod cause {
			use crate::strings::Key;
			pub const LABEL: Key = Key(585);
			pub const MISSION: Key = Key(586);
			pub mod unavailable {
				use crate::strings::Key;
				pub const TITLE: Key = Key(587);
				pub const DESCRIPTION: Key = Key(588);
				pub const SOLO_DESCRIPTION: Key = Key(589);
			}
		}
		pub mod day {
			use crate::strings::Key;
			pub const TODAY: Key = Key(572);
			pub const YESTERDAY: Key = Key(573);
		}
		pub mod landing {
			pub mod unavailable {
				use crate::strings::Key;
				pub const TITLE: Key = Key(574);
				pub const DESCRIPTION: Key = Key(575);
			}
		}
		pub mod mention {
			use crate::strings::Key;
			pub const UNKNOWN: Key = Key(590);
			pub const COUNTED_ONE: Key = Key(591);
			pub const COUNTED_OTHER: Key = Key(592);
			pub const COUNTED_MANY: Key = Key(2074);
			pub mod not_started {
				use crate::strings::Key;
				pub const TITLE_ONE: Key = Key(597);
				pub const TITLE_OTHER: Key = Key(598);
				pub const DESCRIPTION_ONE: Key = Key(599);
				pub const DESCRIPTION_OTHER: Key = Key(600);
				pub const TITLE_MANY: Key = Key(2077);
				pub const DESCRIPTION_MANY: Key = Key(2078);
			}
			pub mod summon_limit {
				use crate::strings::Key;
				pub const DESCRIPTION: Key = Key(601);
			}
			pub mod unresolved {
				use crate::strings::Key;
				pub const TITLE_ONE: Key = Key(593);
				pub const TITLE_OTHER: Key = Key(594);
				pub const DESCRIPTION_ONE: Key = Key(595);
				pub const DESCRIPTION_OTHER: Key = Key(596);
				pub const TITLE_MANY: Key = Key(2075);
				pub const DESCRIPTION_MANY: Key = Key(2076);
			}
		}
		pub mod message {
			use crate::strings::Key;
			pub const USER: Key = Key(576);
			pub const ASSISTANT: Key = Key(577);
			pub const PERSON: Key = Key(578);
			pub const MISSION: Key = Key(579);
			pub const ACTIONS: Key = Key(580);
		}
	}
	pub mod turn {
		use crate::strings::Key;
		pub const COPY: Key = Key(602);
		pub const YOU: Key = Key(603);
		pub const REPLY: Key = Key(604);
		pub const SELECTION: Key = Key(605);
		pub const PIN: Key = Key(606);
		pub const UNPIN: Key = Key(607);
		pub const SAVE_AS_DOCUMENT: Key = Key(608);
		pub const COPIED: Key = Key(609);
		pub const RETRY: Key = Key(610);
		pub const CANCEL: Key = Key(611);
		pub const NOT_SENT: Key = Key(615);
		pub const NOT_SENT_BECAUSE: Key = Key(616);
		pub mod footer {
			use crate::strings::Key;
			pub const CANCELLED: Key = Key(612);
			pub const FAILED: Key = Key(613);
			pub const QUEUED: Key = Key(614);
		}
	}
	pub mod web_sources {
		use crate::strings::Key;
		pub const LIST: Key = Key(776);
		pub const COUNTED_ONE: Key = Key(777);
		pub const COUNTED_OTHER: Key = Key(778);
		pub const OPEN: Key = Key(779);
		pub const OPEN_TITLED: Key = Key(780);
		pub const COUNTED_MANY: Key = Key(2092);
	}
	pub mod work_line {
		use crate::strings::Key;
		pub const AND: Key = Key(665);
		pub const AGENTS_ONE: Key = Key(666);
		pub const AGENTS_OTHER: Key = Key(667);
		pub const STATE_ONE: Key = Key(668);
		pub const STATE_OTHER: Key = Key(669);
		pub const OTHERS_ONE: Key = Key(670);
		pub const OTHERS_OTHER: Key = Key(671);
		pub const RETRY: Key = Key(680);
		pub const TOGGLE: Key = Key(681);
		pub const AGENTS_MANY: Key = Key(2082);
		pub const STATE_MANY: Key = Key(2083);
		pub const OTHERS_MANY: Key = Key(2084);
		pub mod breakdown {
			use crate::strings::Key;
			pub const WRITING_ONE: Key = Key(672);
			pub const WRITING_OTHER: Key = Key(673);
			pub const TOOL_ONE: Key = Key(674);
			pub const TOOL_OTHER: Key = Key(675);
			pub const THINKING_ONE: Key = Key(676);
			pub const THINKING_OTHER: Key = Key(677);
			pub const UP_NEXT_ONE: Key = Key(678);
			pub const UP_NEXT_OTHER: Key = Key(679);
			pub const WRITING_MANY: Key = Key(2085);
			pub const TOOL_MANY: Key = Key(2086);
			pub const THINKING_MANY: Key = Key(2087);
			pub const UP_NEXT_MANY: Key = Key(2088);
		}
	}
	pub mod working {
		use crate::strings::Key;
		pub const NAME: Key = Key(646);
		pub const STATE: Key = Key(652);
		pub const LABELLED: Key = Key(653);
		pub const MCP: Key = Key(654);
		pub const BACKGROUND_TASKS_ONE: Key = Key(655);
		pub const BACKGROUND_TASKS_OTHER: Key = Key(656);
		pub const WAITING_TITLED: Key = Key(657);
		pub const UP_NEXT: Key = Key(658);
		pub const STOP: Key = Key(659);
		pub const BACKGROUND_TASKS_MANY: Key = Key(2081);
		pub mod line {
			use crate::strings::Key;
			pub const STATE: Key = Key(660);
			pub const UP_NEXT: Key = Key(661);
			pub const WAITING_TITLED: Key = Key(662);
			pub const SEPARATOR: Key = Key(663);
			pub const TITLED: Key = Key(664);
		}
		pub mod verb {
			use crate::strings::Key;
			pub const THINKING: Key = Key(647);
			pub const SEARCHING: Key = Key(648);
			pub const WORKING: Key = Key(649);
			pub const WRITING: Key = Key(650);
			pub const WAITING: Key = Key(651);
		}
	}
}
pub mod common {
	use crate::strings::Key;
	pub const SKIP_LINK: Key = Key(1273);
	pub mod agent {
		use crate::strings::Key;
		pub const UNNAMED: Key = Key(1274);
	}
	pub mod board {
		pub mod canvas {
			use crate::strings::Key;
			pub const LABEL: Key = Key(1709);
			pub const LOADING: Key = Key(1710);
			pub const OBJECTS: Key = Key(1711);
		}
		pub mod card {
			use crate::strings::Key;
			pub const OPEN: Key = Key(1702);
			pub const DRAWING_ONE: Key = Key(1703);
			pub const DRAWING_OTHER: Key = Key(1704);
			pub const AT_REST_ONE: Key = Key(1705);
			pub const AT_REST_OTHER: Key = Key(1706);
			pub const FAILED: Key = Key(1707);
			pub const DRAWING_MANY: Key = Key(2115);
			pub const AT_REST_MANY: Key = Key(2116);
		}
		pub mod connector {
			use crate::strings::Key;
			pub const EDIT_LABEL: Key = Key(1722);
		}
		pub mod connector_flyout {
			use crate::strings::Key;
			pub const LABEL: Key = Key(1723);
			pub mod routing {
				use crate::strings::Key;
				pub const STRAIGHT: Key = Key(1724);
				pub const ELBOW: Key = Key(1725);
			}
		}
		pub mod dock {
			use crate::strings::Key;
			pub const LABEL: Key = Key(1738);
			pub mod tool {
				use crate::strings::Key;
				pub const SELECT: Key = Key(1739);
				pub const HAND: Key = Key(1740);
				pub const STICKY: Key = Key(1741);
				pub const SHAPE: Key = Key(1742);
				pub const TEXT: Key = Key(1743);
				pub const CONNECTOR: Key = Key(1744);
				pub const SECTION: Key = Key(1745);
				pub const IMAGE: Key = Key(1746);
				pub const LIBRARY: Key = Key(1747);
			}
		}
		pub mod drop {
			use crate::strings::Key;
			pub const IMAGES_ONE: Key = Key(1751);
			pub const IMAGES_OTHER: Key = Key(1752);
			pub const FILES_ONE: Key = Key(1753);
			pub const FILES_OTHER: Key = Key(1754);
			pub const UNKNOWN: Key = Key(1755);
			pub const IMAGES_MANY: Key = Key(2117);
			pub const FILES_MANY: Key = Key(2118);
		}
		pub mod empty {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1694);
			pub const BODY: Key = Key(1695);
		}
		pub mod library_card {
			use crate::strings::Key;
			pub const DOCUMENT_META: Key = Key(1708);
		}
		pub mod object {
			use crate::strings::Key;
			pub const NAMED: Key = Key(1712);
			pub const EDIT_TEXT: Key = Key(1713);
			pub const MOVED: Key = Key(1720);
			pub const RESIZED: Key = Key(1721);
			pub mod kind {
				use crate::strings::Key;
				pub const STICKY: Key = Key(1714);
				pub const TEXT: Key = Key(1715);
				pub const SHAPE: Key = Key(1716);
				pub const SECTION: Key = Key(1717);
				pub const IMAGE: Key = Key(1718);
				pub const LINK: Key = Key(1719);
			}
		}
		pub mod picker {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1748);
			pub const HINT: Key = Key(1749);
			pub const EMPTY: Key = Key(1750);
		}
		pub mod presence {
			use crate::strings::Key;
			pub const DRAWING_ONE: Key = Key(1700);
			pub const DRAWING_OTHER: Key = Key(1701);
			pub const DRAWING_MANY: Key = Key(2114);
		}
		pub mod selection_bar {
			use crate::strings::Key;
			pub const LABEL: Key = Key(1726);
			pub const SHAPE_TYPE: Key = Key(1727);
			pub const TEXT_SIZE: Key = Key(1735);
			pub const TEXT_SIZE_MEDIUM: Key = Key(1736);
			pub const MORE: Key = Key(1737);
			pub mod fill {
				use crate::strings::Key;
				pub const SURFACE: Key = Key(1730);
				pub const YELLOW: Key = Key(1731);
				pub const GREEN: Key = Key(1732);
				pub const BLUE: Key = Key(1733);
				pub const PINK: Key = Key(1734);
			}
			pub mod shape {
				use crate::strings::Key;
				pub const ROUNDED_RECTANGLE: Key = Key(1728);
				pub const ELLIPSE: Key = Key(1729);
			}
		}
		pub mod zoom {
			use crate::strings::Key;
			pub const CONTROLS: Key = Key(1696);
			pub const ZOOM_OUT: Key = Key(1697);
			pub const ZOOM_IN: Key = Key(1698);
			pub const LEVEL: Key = Key(1699);
		}
	}
	pub mod boot {
		use crate::strings::Key;
		pub const STATUS: Key = Key(1265);
	}
	pub mod claude_import {
		use crate::strings::Key;
		pub const LIST_LABEL: Key = Key(1354);
		pub mod done {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1375);
			pub const COMPANIONS_ONE: Key = Key(1376);
			pub const COMPANIONS_OTHER: Key = Key(1377);
			pub const COMPANIONS_WITH_ONE: Key = Key(1378);
			pub const COMPANIONS_WITH_OTHER: Key = Key(1379);
			pub const INSTRUCTIONS: Key = Key(1380);
			pub const INSTRUCTIONS_AND_SKILLS_ONE: Key = Key(1381);
			pub const INSTRUCTIONS_AND_SKILLS_OTHER: Key = Key(1382);
			pub const ONLY_INSTRUCTIONS: Key = Key(1383);
			pub const ONLY_SKILLS_ONE: Key = Key(1384);
			pub const ONLY_SKILLS_OTHER: Key = Key(1385);
			pub const CONTINUE: Key = Key(1386);
			pub const COMPANIONS_MANY: Key = Key(2100);
			pub const COMPANIONS_WITH_MANY: Key = Key(2101);
			pub const INSTRUCTIONS_AND_SKILLS_MANY: Key = Key(2102);
			pub const ONLY_SKILLS_MANY: Key = Key(2103);
		}
		pub mod from_settings {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1369);
			pub const BODY: Key = Key(1370);
			pub const CANCEL: Key = Key(1371);
		}
		pub mod importing {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1372);
			pub const BODY: Key = Key(1373);
			pub const ACTION: Key = Key(1374);
		}
		pub mod partly_failed {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1387);
			pub const BODY: Key = Key(1388);
			pub const BODY_NAMED: Key = Key(1389);
			pub const RETRY: Key = Key(1390);
		}
		pub mod row {
			use crate::strings::Key;
			pub const IN_KIROSHI: Key = Key(1394);
			pub const SKILLS_ONE: Key = Key(1395);
			pub const SKILLS_OTHER: Key = Key(1396);
			pub const NEW_SKILLS_ONE: Key = Key(1397);
			pub const NEW_SKILLS_OTHER: Key = Key(1398);
			pub const NAME_TAKEN: Key = Key(1399);
			pub const COMPANION_NAME_TAKEN: Key = Key(1400);
			pub const UNPARSABLE: Key = Key(1401);
			pub const SKILLS_MANY: Key = Key(2104);
			pub const NEW_SKILLS_MANY: Key = Key(2105);
			pub mod r#type {
				use crate::strings::Key;
				pub const COMPANION: Key = Key(1402);
				pub const INSTRUCTIONS: Key = Key(1403);
				pub const SKILL: Key = Key(1404);
			}
			pub mod status {
				use crate::strings::Key;
				pub const DONE: Key = Key(1405);
				pub const PENDING: Key = Key(1406);
				pub const FAILED: Key = Key(1407);
			}
		}
		pub mod select {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1355);
			pub const BODY: Key = Key(1356);
			pub const BODY_MANY: Key = Key(1357);
			pub const NOTHING_SELECTED: Key = Key(1358);
			pub const IMPORT: Key = Key(1362);
			pub const IMPORT_ITEMS_ONE: Key = Key(1363);
			pub const IMPORT_ITEMS_OTHER: Key = Key(1364);
			pub const IMPORT_COMPANIONS_ONE: Key = Key(1365);
			pub const IMPORT_COMPANIONS_OTHER: Key = Key(1366);
			pub const SKIP: Key = Key(1367);
			pub const NOT_NOW: Key = Key(1368);
			pub const IMPORT_ITEMS_MANY: Key = Key(2098);
			pub const IMPORT_COMPANIONS_MANY: Key = Key(2099);
			pub mod names_taken {
				use crate::strings::Key;
				pub const ONE: Key = Key(1359);
				pub const TWO: Key = Key(1360);
				pub const OTHER: Key = Key(1361);
			}
		}
		pub mod unreadable {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1391);
			pub const BODY: Key = Key(1392);
			pub const RETRY: Key = Key(1393);
		}
	}
	pub mod confirm {
		use crate::strings::Key;
		pub const CANCEL: Key = Key(1276);
	}
	pub mod devices {
		pub mod approval {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1326);
			pub const BODY: Key = Key(1327);
			pub const NOT_ME: Key = Key(1328);
			pub const APPROVE: Key = Key(1329);
			pub const APPROVING: Key = Key(1330);
			pub const RETRY: Key = Key(1331);
			pub const FAILED: Key = Key(1332);
			pub mod approved {
				use crate::strings::Key;
				pub const TITLE: Key = Key(1333);
				pub const DESCRIPTION: Key = Key(1334);
			}
			pub mod rejected {
				use crate::strings::Key;
				pub const TITLE: Key = Key(1335);
				pub const DESCRIPTION: Key = Key(1336);
			}
		}
		pub mod new_device {
			use crate::strings::Key;
			pub const THIS_DEVICE: Key = Key(1337);
			pub const NO_OTHER_DEVICE: Key = Key(1338);
			pub const SIGN_OUT: Key = Key(1339);
			pub mod code {
				use crate::strings::Key;
				pub const TITLE: Key = Key(1343);
				pub const BODY: Key = Key(1344);
				pub const LABEL: Key = Key(1345);
				pub const APPROVE: Key = Key(1346);
				pub const RESEND: Key = Key(1347);
			}
			pub mod expired {
				use crate::strings::Key;
				pub const TITLE: Key = Key(1348);
				pub const BODY: Key = Key(1349);
				pub const ASK_AGAIN: Key = Key(1350);
			}
			pub mod rejected {
				use crate::strings::Key;
				pub const TITLE: Key = Key(1351);
				pub const BODY: Key = Key(1352);
				pub const BACK_TO_SIGN_IN: Key = Key(1353);
			}
			pub mod waiting {
				use crate::strings::Key;
				pub const TITLE: Key = Key(1340);
				pub const BODY: Key = Key(1341);
				pub const STATUS: Key = Key(1342);
			}
		}
	}
	pub mod dialog {
		use crate::strings::Key;
		pub const CLOSE: Key = Key(1275);
	}
	pub mod library {
		use crate::strings::Key;
		pub const TITLE: Key = Key(1427);
		pub const SUBTITLE: Key = Key(1428);
		pub const SEARCH: Key = Key(1429);
		pub const IMPORT: Key = Key(1430);
		pub const NEW_DOCUMENT: Key = Key(1431);
		pub const NEW_BOARD: Key = Key(1432);
		pub const BOARD_FILE_REPLACED: Key = Key(1433);
		pub const BLANK_BOARD: Key = Key(1434);
		pub const START: Key = Key(1447);
		pub mod added {
			use crate::strings::Key;
			pub const TITLE_ONE: Key = Key(1583);
			pub const TITLE_OTHER: Key = Key(1584);
			pub const STILL_IMPORTING_ONE: Key = Key(1585);
			pub const STILL_IMPORTING_OTHER: Key = Key(1586);
			pub const TITLE_MANY: Key = Key(2109);
			pub const STILL_IMPORTING_MANY: Key = Key(2110);
		}
		pub mod bring_in {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1573);
			pub const DROP: Key = Key(1574);
			pub const FORMATS: Key = Key(1575);
			pub const ACTION: Key = Key(1576);
		}
		pub mod document {
			use crate::strings::Key;
			pub const BACK: Key = Key(1616);
			pub const MORE: Key = Key(1617);
			pub const DOWNLOAD: Key = Key(1618);
			pub const COPY: Key = Key(1619);
			pub const COPIED: Key = Key(1620);
			pub const CLOSE: Key = Key(1621);
			pub const READ_ONLY: Key = Key(1631);
			pub const PLACEHOLDER: Key = Key(1632);
			pub const DROP_ONE: Key = Key(1638);
			pub const DROP_OTHER: Key = Key(1639);
			pub const DROP_MANY: Key = Key(2113);
			pub mod agents {
				use crate::strings::Key;
				pub const WRITING_ONE: Key = Key(1622);
				pub const WRITING_OTHER: Key = Key(1623);
				pub const STOP_ALL: Key = Key(1624);
				pub const CARET: Key = Key(1625);
				pub const TITLE: Key = Key(1626);
				pub const SUMMARY_ONE: Key = Key(1627);
				pub const SUMMARY_OTHER: Key = Key(1628);
				pub const STOP: Key = Key(1629);
				pub const OPEN_CONVERSATION: Key = Key(1630);
				pub const WRITING_MANY: Key = Key(2111);
				pub const SUMMARY_MANY: Key = Key(2112);
			}
			pub mod failed_import {
				use crate::strings::Key;
				pub const CHOOSE: Key = Key(1640);
				pub const REMOVE: Key = Key(1641);
			}
			pub mod start {
				use crate::strings::Key;
				pub const LABEL: Key = Key(1633);
				pub const CHECKLIST: Key = Key(1634);
				pub const GALLERY: Key = Key(1635);
				pub const TABLE: Key = Key(1636);
				pub const TEMPLATE: Key = Key(1637);
			}
		}
		pub mod document_picker {
			use crate::strings::Key;
			pub const LABEL: Key = Key(1653);
			pub const SEARCH: Key = Key(1654);
			pub const ATTACH_FILES: Key = Key(1655);
		}
		pub mod drop {
			use crate::strings::Key;
			pub const TITLE_ONE: Key = Key(1577);
			pub const TITLE_OTHER: Key = Key(1578);
			pub const MORE_ONE: Key = Key(1579);
			pub const MORE_OTHER: Key = Key(1580);
			pub const TITLE_MANY: Key = Key(2107);
			pub const MORE_MANY: Key = Key(2108);
		}
		pub mod editor {
			use crate::strings::Key;
			pub const UNTITLED: Key = Key(1476);
			pub const CREATED: Key = Key(1477);
			pub const CREATED_FROM: Key = Key(1478);
			pub const TITLE: Key = Key(1479);
			pub const BODY: Key = Key(1480);
			pub mod blocks {
				pub mod callout {
					use crate::strings::Key;
					pub const TEXT: Key = Key(1547);
					pub const TONE: Key = Key(1548);
				}
				pub mod checklist {
					use crate::strings::Key;
					pub const ITEM: Key = Key(1545);
					pub const MOVE: Key = Key(1546);
				}
				pub mod code {
					use crate::strings::Key;
					pub const BODY: Key = Key(1553);
					pub const LANGUAGE: Key = Key(1554);
					pub const SEARCH: Key = Key(1555);
					pub const NO_MATCH: Key = Key(1556);
					pub mod languages {
						use crate::strings::Key;
						pub const TEXT: Key = Key(1557);
						pub const BASH: Key = Key(1558);
						pub const JSON: Key = Key(1559);
						pub const TYPESCRIPT: Key = Key(1560);
						pub const PYTHON: Key = Key(1561);
						pub const CSS: Key = Key(1562);
						pub const DIFF: Key = Key(1563);
						pub const HTML: Key = Key(1564);
						pub const MARKDOWN: Key = Key(1565);
						pub const RUST: Key = Key(1566);
						pub const TSX: Key = Key(1567);
						pub const YAML: Key = Key(1568);
					}
				}
				pub mod gallery {
					use crate::strings::Key;
					pub const ADD: Key = Key(1538);
					pub const HINT: Key = Key(1539);
					pub const ADD_FAILED: Key = Key(1540);
					pub const TILE: Key = Key(1541);
					pub const REMOVE: Key = Key(1542);
					pub const CAPTION: Key = Key(1543);
					pub const CAPTION_PLACEHOLDER: Key = Key(1544);
				}
				pub mod handle {
					use crate::strings::Key;
					pub const INSERT: Key = Key(1522);
					pub const MENU: Key = Key(1523);
				}
				pub mod markdown {
					use crate::strings::Key;
					pub const HEADING: Key = Key(1508);
					pub const LIST: Key = Key(1509);
					pub const CHECKLIST: Key = Key(1510);
					pub const QUOTE: Key = Key(1511);
					pub const CODE: Key = Key(1512);
				}
				pub mod menu {
					use crate::strings::Key;
					pub const TURN_INTO: Key = Key(1524);
					pub const DUPLICATE: Key = Key(1525);
					pub const MOVE_UP: Key = Key(1526);
					pub const MOVE_DOWN: Key = Key(1527);
					pub const DELETE: Key = Key(1528);
					pub mod shortcuts {
						pub mod mac {
							use crate::strings::Key;
							pub const DUPLICATE: Key = Key(1529);
							pub const MOVE_UP: Key = Key(1530);
							pub const MOVE_DOWN: Key = Key(1531);
							pub const DELETE: Key = Key(1532);
						}
						pub mod other {
							use crate::strings::Key;
							pub const DUPLICATE: Key = Key(1533);
							pub const MOVE_UP: Key = Key(1534);
							pub const MOVE_DOWN: Key = Key(1535);
							pub const DELETE: Key = Key(1536);
						}
					}
				}
				pub mod skeleton {
					use crate::strings::Key;
					pub const COLUMN: Key = Key(1537);
				}
				pub mod slash {
					use crate::strings::Key;
					pub const LABEL: Key = Key(1513);
					pub const TEXT: Key = Key(1514);
					pub const RICH: Key = Key(1515);
					pub const MOVE_KEYS: Key = Key(1516);
					pub const MOVE: Key = Key(1517);
					pub const INSERT_KEY: Key = Key(1518);
					pub const INSERT: Key = Key(1519);
					pub const CLOSE_KEY: Key = Key(1520);
					pub const CLOSE: Key = Key(1521);
				}
				pub mod table {
					use crate::strings::Key;
					pub const CELL: Key = Key(1549);
					pub const EMPTY: Key = Key(1550);
					pub const ADD_ROW: Key = Key(1551);
					pub const ADD_COLUMN: Key = Key(1552);
				}
				pub mod types {
					use crate::strings::Key;
					pub const PARAGRAPH: Key = Key(1496);
					pub const HEADING: Key = Key(1497);
					pub const LIST: Key = Key(1498);
					pub const CHECKLIST: Key = Key(1499);
					pub const QUOTE: Key = Key(1500);
					pub const GALLERY: Key = Key(1501);
					pub const CALLOUT: Key = Key(1502);
					pub const TABLE: Key = Key(1503);
					pub const CODE: Key = Key(1504);
					pub const WEB_PAGE: Key = Key(1505);
					pub const COLLAPSIBLE: Key = Key(1506);
					pub const OTHER: Key = Key(1507);
				}
				pub mod web_page {
					use crate::strings::Key;
					pub const LINK: Key = Key(1569);
					pub const UPDATE_KEY: Key = Key(1570);
					pub const UPDATE: Key = Key(1571);
					pub const FAILED: Key = Key(1572);
				}
			}
			pub mod toolbar {
				use crate::strings::Key;
				pub const LABEL: Key = Key(1481);
				pub const BOLD: Key = Key(1482);
				pub const ITALIC: Key = Key(1483);
				pub const STRIKETHROUGH: Key = Key(1484);
				pub const CODE: Key = Key(1485);
				pub const LINK: Key = Key(1486);
				pub const HEADING: Key = Key(1487);
				pub const LIST: Key = Key(1488);
				pub const BOLD_SHORTCUT: Key = Key(1489);
				pub const ITALIC_SHORTCUT: Key = Key(1490);
				pub const STRIKETHROUGH_SHORTCUT: Key = Key(1491);
				pub const CODE_SHORTCUT: Key = Key(1492);
				pub const LINK_SHORTCUT: Key = Key(1493);
				pub const LINK_FIELD: Key = Key(1494);
				pub const CONFIRM_LINK: Key = Key(1495);
			}
		}
		pub mod failure {
			use crate::strings::Key;
			pub const LIST: Key = Key(1656);
			pub const IMAGE: Key = Key(1657);
			pub const SAVE: Key = Key(1658);
			pub const COPY: Key = Key(1659);
			pub const REVEAL: Key = Key(1660);
			pub const DELETE: Key = Key(1661);
			pub mod board {
				use crate::strings::Key;
				pub const OPEN: Key = Key(1670);
				pub const SAVE: Key = Key(1671);
				pub const REFUSED: Key = Key(1672);
				pub const STOP_ALL: Key = Key(1673);
			}
			pub mod document {
				use crate::strings::Key;
				pub const CREATE: Key = Key(1662);
				pub const OPEN: Key = Key(1663);
				pub const SAVE: Key = Key(1664);
				pub const WRITE: Key = Key(1665);
				pub const CARET: Key = Key(1666);
				pub const STOP_ALL: Key = Key(1667);
				pub const STOP: Key = Key(1668);
				pub const SAVE_AS_DOCUMENT: Key = Key(1669);
			}
			pub mod import {
				use crate::strings::Key;
				pub const TITLE: Key = Key(1674);
				pub const TOO_LARGE: Key = Key(1675);
				pub const INVALID_NAME: Key = Key(1676);
				pub const UNSUPPORTED: Key = Key(1677);
				pub const UNDECODABLE: Key = Key(1678);
				pub const NOT_UTF8: Key = Key(1679);
				pub const MISSING: Key = Key(1680);
				pub const UNWRITABLE: Key = Key(1681);
				pub const UNREADABLE: Key = Key(1682);
				pub const UNKNOWN_SPACE: Key = Key(1683);
				pub const UNAVAILABLE: Key = Key(1684);
				pub const STORAGE: Key = Key(1685);
				pub const IMAGE_UNREADABLE: Key = Key(1686);
				pub const REFUSED: Key = Key(1687);
				pub const GENERIC: Key = Key(1688);
				pub mod url {
					use crate::strings::Key;
					pub const UNSUPPORTED_SCHEME: Key = Key(1689);
					pub const PRIVATE_ADDRESS: Key = Key(1690);
					pub const NETWORK_FAILURE: Key = Key(1691);
					pub const TOO_LARGE: Key = Key(1692);
					pub const UNKNOWN_SPACE: Key = Key(1693);
				}
			}
		}
		pub mod filters {
			use crate::strings::Key;
			pub const LABEL: Key = Key(1438);
			pub const ALL: Key = Key(1439);
			pub const IMAGES: Key = Key(1440);
			pub const DOCUMENTS: Key = Key(1441);
			pub const BOARDS: Key = Key(1442);
		}
		pub mod image_menu {
			use crate::strings::Key;
			pub const SAVE_TO_LIBRARY: Key = Key(1598);
			pub const COPY_IMAGE: Key = Key(1599);
			pub const OPEN_IN_VIEWER: Key = Key(1600);
		}
		pub mod importing {
			use crate::strings::Key;
			pub const LABEL: Key = Key(1581);
			pub const DETAIL: Key = Key(1582);
		}
		pub mod item_menu {
			use crate::strings::Key;
			pub const LABEL: Key = Key(1587);
			pub const OPEN: Key = Key(1588);
			pub const OPEN_IN_NEW_TAB: Key = Key(1589);
			pub const RENAME: Key = Key(1590);
			pub const COPY: Key = Key(1591);
			pub const DOWNLOAD: Key = Key(1592);
			pub const SHOW_IN_FOLDER: Key = Key(1593);
			pub const DELETE: Key = Key(1594);
			pub mod delete_confirm {
				use crate::strings::Key;
				pub const TITLE: Key = Key(1595);
				pub const DESCRIPTION: Key = Key(1596);
				pub const FAILURE: Key = Key(1597);
			}
		}
		pub mod lightbox {
			use crate::strings::Key;
			pub const DOWNLOAD: Key = Key(1601);
			pub const COPY: Key = Key(1602);
			pub const COPIED: Key = Key(1603);
			pub const MORE: Key = Key(1604);
			pub const BACK: Key = Key(1605);
			pub const CLOSE: Key = Key(1606);
			pub const PREVIOUS: Key = Key(1607);
			pub const NEXT: Key = Key(1608);
			pub const ZOOM_OUT: Key = Key(1609);
			pub const ZOOM_IN: Key = Key(1610);
			pub const FIT: Key = Key(1611);
			pub const FIT_TO_STAGE: Key = Key(1612);
			pub const ZOOM: Key = Key(1613);
			pub const ZOOM_THEN_FIT: Key = Key(1614);
			pub const POSITION: Key = Key(1615);
		}
		pub mod no_result {
			use crate::strings::Key;
			pub const IMAGES: Key = Key(1443);
			pub const DOCUMENTS: Key = Key(1444);
			pub const BOARDS: Key = Key(1445);
			pub const SEARCH: Key = Key(1446);
		}
		pub mod panel {
			use crate::strings::Key;
			pub const OPEN_IN_LIBRARY: Key = Key(1642);
			pub const CLOSE: Key = Key(1643);
			pub const RESIZE: Key = Key(1644);
		}
		pub mod picker {
			use crate::strings::Key;
			pub const SUBTITLE: Key = Key(1472);
			pub const TEMPLATES: Key = Key(1473);
			pub const CANCEL: Key = Key(1474);
			pub const CREATE: Key = Key(1475);
		}
		pub mod saved {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1435);
			pub const IMAGE: Key = Key(1436);
			pub const OPEN: Key = Key(1437);
		}
		pub mod tab {
			use crate::strings::Key;
			pub const LOADING_DOCUMENT: Key = Key(1645);
			pub const LOADING_IMAGE: Key = Key(1646);
			pub mod unavailable {
				pub mod missing {
					use crate::strings::Key;
					pub const TITLE: Key = Key(1647);
					pub const BODY: Key = Key(1648);
					pub const ACTION: Key = Key(1649);
				}
				pub mod unreadable {
					use crate::strings::Key;
					pub const TITLE: Key = Key(1650);
					pub const BODY: Key = Key(1651);
					pub const ACTION: Key = Key(1652);
				}
			}
		}
		pub mod templates {
			pub mod blank {
				use crate::strings::Key;
				pub const NAME: Key = Key(1448);
				pub const DESCRIPTION: Key = Key(1449);
				pub const PLACEHOLDER: Key = Key(1450);
			}
			pub mod brief {
				use crate::strings::Key;
				pub const NAME: Key = Key(1451);
				pub const PREVIEW: Key = Key(1452);
				pub const DESCRIPTION: Key = Key(1453);
				pub const INTRO: Key = Key(1454);
				pub mod done_when {
					use crate::strings::Key;
					pub const HEADING: Key = Key(1457);
					pub const PLACEHOLDER: Key = Key(1458);
				}
				pub mod goal {
					use crate::strings::Key;
					pub const HEADING: Key = Key(1455);
					pub const PLACEHOLDER: Key = Key(1456);
				}
			}
			pub mod checklist {
				use crate::strings::Key;
				pub const NAME: Key = Key(1468);
				pub const PREVIEW: Key = Key(1469);
				pub const DESCRIPTION: Key = Key(1470);
				pub const ITEM: Key = Key(1471);
			}
			pub mod meeting_notes {
				use crate::strings::Key;
				pub const NAME: Key = Key(1459);
				pub const PREVIEW: Key = Key(1460);
				pub const DESCRIPTION: Key = Key(1461);
				pub const TITLE: Key = Key(1462);
				pub const INTRO: Key = Key(1463);
				pub mod decisions {
					use crate::strings::Key;
					pub const HEADING: Key = Key(1464);
					pub const PLACEHOLDER: Key = Key(1465);
				}
				pub mod next_steps {
					use crate::strings::Key;
					pub const HEADING: Key = Key(1466);
					pub const PLACEHOLDER: Key = Key(1467);
				}
			}
		}
	}
	pub mod notice {
		use crate::strings::Key;
		pub const LABEL: Key = Key(1321);
		pub const CLOSE: Key = Key(1322);
		pub const COPY: Key = Key(1323);
		pub const COPIED: Key = Key(1324);
		pub const COPY_FAILED: Key = Key(1325);
	}
	pub mod notification {
		use crate::strings::Key;
		pub const QUESTION: Key = Key(1408);
		pub const APPROVAL: Key = Key(1409);
		pub const FINISHED_TURN: Key = Key(1410);
		pub const SPOKE: Key = Key(1411);
		pub mod failure {
			use crate::strings::Key;
			pub const CLICKS: Key = Key(1415);
			pub const FOCUS: Key = Key(1416);
			pub const REVEAL: Key = Key(1417);
			pub const SEND: Key = Key(1418);
		}
		pub mod mission {
			use crate::strings::Key;
			pub const QUESTION: Key = Key(1412);
			pub const WAITING_HUMAN: Key = Key(1413);
			pub const READY_TO_MERGE: Key = Key(1414);
		}
	}
	pub mod sidebar {
		use crate::strings::Key;
		pub const LABEL: Key = Key(1277);
		pub const TOGGLE: Key = Key(1278);
		pub const CLOSE: Key = Key(1279);
		pub const RESIZE: Key = Key(1280);
	}
	pub mod spaces {
		pub mod leave {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1268);
			pub const DESCRIPTION: Key = Key(1269);
			pub const ACTION: Key = Key(1270);
		}
		pub mod unavailable {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1266);
			pub const DESCRIPTION: Key = Key(1267);
		}
		pub mod unnamed {
			use crate::strings::Key;
			pub const HOST: Key = Key(1271);
			pub const SPACE: Key = Key(1272);
		}
	}
	pub mod title_bar {
		use crate::strings::Key;
		pub const TABS: Key = Key(1291);
		pub const BACK: Key = Key(1292);
		pub const FORWARD: Key = Key(1293);
		pub const NEW_TAB: Key = Key(1294);
		pub const CLOSE_TAB: Key = Key(1295);
		pub const CLOSE_TAB_NAMED: Key = Key(1296);
		pub const PIN_TAB: Key = Key(1297);
		pub const UNPIN_TAB: Key = Key(1298);
		pub const CLOSE_OTHER_TABS: Key = Key(1299);
		pub const DUPLICATE_TAB: Key = Key(1300);
		pub const REOPEN_CLOSED_TAB: Key = Key(1301);
		pub const MOVE_TAB_TO_NEW_WINDOW: Key = Key(1302);
		pub const PIN_TAB_SHORTCUT: Key = Key(1313);
		pub const NEW_TAB_SHORTCUT: Key = Key(1314);
		pub const REOPEN_CLOSED_TAB_SHORTCUT: Key = Key(1315);
		pub const CLOSE_TAB_SHORTCUT: Key = Key(1316);
		pub const CLOSE_OTHER_TABS_SHORTCUT: Key = Key(1317);
		pub const MORE: Key = Key(1318);
		pub const TAB_NEEDS_YOU: Key = Key(1319);
		pub const TAB_MOVED: Key = Key(1320);
		pub mod move_tab_failed {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1303);
			pub const DESCRIPTION: Key = Key(1304);
			pub const DESCRIPTION_WITH_REASON: Key = Key(1305);
		}
		pub mod redock_tab_failed {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1306);
			pub const DESCRIPTION: Key = Key(1307);
		}
		pub mod reopen_window_failed {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1310);
			pub const DESCRIPTION: Key = Key(1311);
			pub const DESCRIPTION_WITH_REASON: Key = Key(1312);
		}
		pub mod reveal_tab_failed {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1308);
			pub const DESCRIPTION: Key = Key(1309);
		}
	}
	pub mod update {
		pub mod badge {
			use crate::strings::Key;
			pub const AVAILABLE: Key = Key(1419);
			pub const DOWNLOADING: Key = Key(1420);
			pub const READY: Key = Key(1421);
			pub const READY_VERSION: Key = Key(1422);
			pub const BOTS_BUSY_ONE: Key = Key(1423);
			pub const BOTS_BUSY_OTHER: Key = Key(1424);
			pub const ERROR: Key = Key(1425);
			pub const RETRY: Key = Key(1426);
			pub const BOTS_BUSY_MANY: Key = Key(2106);
		}
	}
	pub mod whats_new {
		use crate::strings::Key;
		pub const BETA: Key = Key(1762);
		pub const RELEASE_NOTES: Key = Key(1763);
		pub mod first_launch {
			use crate::strings::Key;
			pub const EYEBROW: Key = Key(1756);
			pub const LEGEND: Key = Key(1757);
			pub const DISMISS: Key = Key(1758);
		}
		pub mod from_about {
			use crate::strings::Key;
			pub const EYEBROW: Key = Key(1759);
			pub const LEGEND: Key = Key(1760);
			pub const DISMISS: Key = Key(1761);
		}
	}
	pub mod window_controls {
		use crate::strings::Key;
		pub const MINIMIZE: Key = Key(1281);
		pub const MAXIMIZE: Key = Key(1282);
		pub const RESTORE: Key = Key(1283);
		pub const CLOSE: Key = Key(1284);
		pub mod failure {
			use crate::strings::Key;
			pub const MINIMIZE: Key = Key(1285);
			pub const MAXIMIZE: Key = Key(1286);
			pub const CLOSE: Key = Key(1287);
			pub const STATE: Key = Key(1288);
			pub const SNAP: Key = Key(1289);
			pub const POINTER: Key = Key(1290);
		}
	}
}
pub mod search {
	use crate::strings::Key;
	pub const OPEN: Key = Key(1764);
	pub const CHORD: Key = Key(1765);
	pub const PLACEHOLDER: Key = Key(1766);
	pub const RESULTS: Key = Key(1767);
	pub const SEE_ALL: Key = Key(1773);
	pub const SOLO: Key = Key(1774);
	pub mod empty {
		use crate::strings::Key;
		pub const TITLE: Key = Key(1788);
		pub const DESCRIPTION: Key = Key(1789);
	}
	pub mod rest {
		use crate::strings::Key;
		pub const CHATS: Key = Key(1777);
		pub const MISSIONS: Key = Key(1778);
		pub const ROUTINES: Key = Key(1779);
		pub mod messages {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1780);
			pub const BODY: Key = Key(1781);
		}
		pub mod none {
			use crate::strings::Key;
			pub const CHATS: Key = Key(1782);
			pub const MISSIONS: Key = Key(1783);
			pub const ROUTINES: Key = Key(1784);
			pub mod body {
				use crate::strings::Key;
				pub const CHATS: Key = Key(1785);
				pub const MISSIONS: Key = Key(1786);
				pub const ROUTINES: Key = Key(1787);
			}
		}
	}
	pub mod tab {
		use crate::strings::Key;
		pub const ALL: Key = Key(1768);
		pub const MESSAGES: Key = Key(1769);
		pub const CHATS: Key = Key(1770);
		pub const MISSIONS: Key = Key(1771);
		pub const ROUTINES: Key = Key(1772);
	}
	pub mod unavailable {
		use crate::strings::Key;
		pub const TITLE: Key = Key(1775);
		pub const DESCRIPTION: Key = Key(1776);
	}
}
pub mod settings {
	pub mod about {
		use crate::strings::Key;
		pub const VERSION: Key = Key(1899);
		pub mod action {
			use crate::strings::Key;
			pub const CHECK: Key = Key(1910);
			pub const DOWNLOAD: Key = Key(1911);
			pub const RESTART: Key = Key(1912);
			pub const DOWNLOAD_AGAIN: Key = Key(1913);
		}
		pub mod beta_notice {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1918);
			pub const DESCRIPTION: Key = Key(1919);
		}
		pub mod channel {
			use crate::strings::Key;
			pub const LABEL: Key = Key(1914);
			pub const DESCRIPTION: Key = Key(1915);
			pub mod option {
				use crate::strings::Key;
				pub const STABLE: Key = Key(1916);
				pub const BETA: Key = Key(1917);
			}
		}
		pub mod getting_started {
			use crate::strings::Key;
			pub const LABEL: Key = Key(1922);
			pub mod import_from_claude_code {
				use crate::strings::Key;
				pub const LABEL: Key = Key(1923);
				pub const DESCRIPTION: Key = Key(1924);
				pub const NOTHING_TO_IMPORT: Key = Key(1925);
			}
			pub mod replay_onboarding {
				use crate::strings::Key;
				pub const LABEL: Key = Key(1926);
				pub const DESCRIPTION: Key = Key(1927);
			}
		}
		pub mod kiroshi {
			use crate::strings::Key;
			pub const LABEL: Key = Key(1928);
			pub const WHATS_NEW: Key = Key(1929);
			pub const RELEASE_NOTES: Key = Key(1930);
			pub const RELEASE_NOTES_NAME: Key = Key(1931);
		}
		pub mod status {
			use crate::strings::Key;
			pub const UP_TO_DATE: Key = Key(1900);
			pub const CHECKING: Key = Key(1901);
			pub const AVAILABLE: Key = Key(1902);
			pub const DOWNLOADING: Key = Key(1903);
			pub const READY: Key = Key(1904);
			pub const READY_HELD: Key = Key(1905);
			pub const RUNNING_ONE: Key = Key(1906);
			pub const RUNNING_OTHER: Key = Key(1907);
			pub const FAILED: Key = Key(1908);
			pub const FAILED_HINT: Key = Key(1909);
			pub const RUNNING_MANY: Key = Key(2119);
		}
		pub mod updates {
			use crate::strings::Key;
			pub const LABEL: Key = Key(1898);
		}
		pub mod whats_new {
			use crate::strings::Key;
			pub const LABEL: Key = Key(1920);
			pub const DESCRIPTION: Key = Key(1921);
		}
	}
	pub mod account {
		use crate::strings::Key;
		pub const READ_FAILED: Key = Key(1850);
		pub const SIGN_IN_FAILED: Key = Key(1851);
		pub const CANCEL_FAILED: Key = Key(1852);
		pub const SIGN_IN_LINK_COPIED: Key = Key(1853);
		pub const COPY_SIGN_IN_LINK_FAILED: Key = Key(1854);
		pub const MANAGE_ACCOUNT_FAILED: Key = Key(1855);
		pub const SIGN_OUT_FAILED: Key = Key(1856);
		pub mod device_revoked {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1843);
			pub const DESCRIPTION: Key = Key(1844);
		}
		pub mod devices {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1857);
			pub const THIS_DEVICE: Key = Key(1858);
			pub const ACTIVE_NOW: Key = Key(1859);
			pub const OTHER_DEVICES: Key = Key(1860);
			pub const REMOVE: Key = Key(1861);
			pub const EMPTY: Key = Key(1862);
			pub mod confirm {
				use crate::strings::Key;
				pub const TITLE: Key = Key(1863);
				pub const BODY: Key = Key(1864);
				pub const REMOVE: Key = Key(1865);
				pub const REMOVING: Key = Key(1866);
				pub const CANCEL: Key = Key(1867);
				pub const FAILED: Key = Key(1868);
			}
			pub mod removed {
				use crate::strings::Key;
				pub const TITLE: Key = Key(1869);
				pub const DESCRIPTION: Key = Key(1870);
			}
		}
		pub mod failed {
			use crate::strings::Key;
			pub const CANCELLED: Key = Key(1847);
			pub const TIMED_OUT: Key = Key(1848);
			pub const DESCRIPTION: Key = Key(1849);
		}
		pub mod onboarding {
			use crate::strings::Key;
			pub const BODY: Key = Key(1836);
			pub const SKIP: Key = Key(1837);
			pub mod signed_in {
				use crate::strings::Key;
				pub const TITLE: Key = Key(1838);
				pub const BODY: Key = Key(1839);
				pub const CONTINUE: Key = Key(1840);
			}
		}
		pub mod signed_in {
			use crate::strings::Key;
			pub const MANAGE: Key = Key(1834);
			pub const SIGN_OUT: Key = Key(1835);
			pub mod plan {
				use crate::strings::Key;
				pub const BETA: Key = Key(1831);
				pub const PRO: Key = Key(1832);
				pub const FREE: Key = Key(1833);
			}
		}
		pub mod signed_out {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1822);
			pub const BODY: Key = Key(1823);
			pub const SIGN_IN: Key = Key(1824);
			pub const CAPTION: Key = Key(1825);
		}
		pub mod signed_out_from_the_site {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1841);
			pub const DESCRIPTION: Key = Key(1842);
		}
		pub mod unreachable {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1845);
			pub const DESCRIPTION: Key = Key(1846);
		}
		pub mod waiting {
			use crate::strings::Key;
			pub const LABEL: Key = Key(1826);
			pub const CANCEL: Key = Key(1827);
			pub const CAPTION: Key = Key(1828);
			pub const BROWSER_DID_NOT_OPEN: Key = Key(1829);
			pub const COPY_SIGN_IN_LINK: Key = Key(1830);
		}
	}
	pub mod appearance {
		pub mod scheme {
			use crate::strings::Key;
			pub const LABEL: Key = Key(1884);
			pub mod option {
				use crate::strings::Key;
				pub const LIGHT: Key = Key(1885);
				pub const DARK: Key = Key(1886);
				pub const SYSTEM: Key = Key(1887);
			}
		}
	}
	pub mod breadcrumb {
		use crate::strings::Key;
		pub const TITLE: Key = Key(1790);
	}
	pub mod diagnostics {
		use crate::strings::Key;
		pub const LABEL: Key = Key(1888);
		pub const DESCRIPTION: Key = Key(1889);
		pub const COPY: Key = Key(1890);
		pub const COPY_FAILED: Key = Key(1891);
		pub const REVEAL: Key = Key(1892);
		pub const REVEAL_FAILED: Key = Key(1893);
		pub mod clear {
			use crate::strings::Key;
			pub const ACTION: Key = Key(1894);
			pub const TITLE: Key = Key(1895);
			pub const DESCRIPTION: Key = Key(1896);
			pub const FAILED: Key = Key(1897);
		}
	}
	pub mod language {
		use crate::strings::Key;
		pub const LABEL: Key = Key(1882);
		pub const MACHINE: Key = Key(1883);
	}
	pub mod notifications {
		use crate::strings::Key;
		pub const LABEL: Key = Key(1872);
		pub mod event {
			pub mod permission {
				use crate::strings::Key;
				pub const LABEL: Key = Key(1875);
				pub const DESCRIPTION: Key = Key(1876);
			}
			pub mod question {
				use crate::strings::Key;
				pub const LABEL: Key = Key(1873);
				pub const DESCRIPTION: Key = Key(1874);
			}
			pub mod turn {
				use crate::strings::Key;
				pub const LABEL: Key = Key(1877);
				pub const DESCRIPTION: Key = Key(1878);
			}
		}
		pub mod sound {
			use crate::strings::Key;
			pub const LABEL: Key = Key(1879);
			pub const SWITCH: Key = Key(1880);
			pub const DESCRIPTION: Key = Key(1881);
		}
	}
	pub mod plugin {
		pub mod author {
			use crate::strings::Key;
			pub const BOT: Key = Key(1871);
		}
	}
	pub mod rail {
		use crate::strings::Key;
		pub const ACCOUNT: Key = Key(1807);
		pub const SPACE: Key = Key(1808);
		pub const MEMBERS: Key = Key(1809);
		pub const AGENTS: Key = Key(1810);
		pub const SECRETS: Key = Key(1811);
		pub const APPEARANCE: Key = Key(1812);
		pub const NOTIFICATIONS: Key = Key(1813);
		pub const LANGUAGE: Key = Key(1814);
		pub const SKILLS: Key = Key(1815);
		pub const APPLICATIONS: Key = Key(1816);
		pub const HISTORY: Key = Key(1817);
		pub const DIAGNOSTICS: Key = Key(1818);
		pub const DANGER: Key = Key(1819);
		pub const ABOUT: Key = Key(1820);
		pub const INVITATION: Key = Key(1821);
	}
	pub mod screen {
		use crate::strings::Key;
		pub const BACK: Key = Key(1791);
		pub const BACK_TO_AGENTS: Key = Key(1792);
		pub const BACK_TO_SETTINGS: Key = Key(1793);
		pub const MENU: Key = Key(1794);
		pub mod group {
			use crate::strings::Key;
			pub const SETTINGS: Key = Key(1800);
			pub const SUBJECT_SETTINGS: Key = Key(1801);
			pub const SPACES: Key = Key(1802);
		}
		pub mod space {
			use crate::strings::Key;
			pub const CURRENT: Key = Key(1803);
			pub const INVITATION: Key = Key(1804);
			pub mod left {
				use crate::strings::Key;
				pub const TITLE: Key = Key(1805);
				pub const DESCRIPTION: Key = Key(1806);
			}
		}
		pub mod subtitle {
			use crate::strings::Key;
			pub const SPACE: Key = Key(1795);
			pub const AGENT: Key = Key(1796);
			pub const CONVERSATION: Key = Key(1797);
			pub const USER: Key = Key(1798);
			pub const INVITATION: Key = Key(1799);
		}
	}
	pub mod space {
		use crate::strings::Key;
		pub const UNTITLED: Key = Key(1932);
		pub const OPEN: Key = Key(1938);
		pub mod agents {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1961);
			pub const CAPTION: Key = Key(1962);
			pub const CREATE: Key = Key(1963);
			pub const EMPTY: Key = Key(1964);
			pub const COUNTS: Key = Key(1965);
			pub const COUNTS_UNREADABLE: Key = Key(1966);
			pub const SKILLS_ZERO: Key = Key(1967);
			pub const SKILLS_ONE: Key = Key(1968);
			pub const SKILLS_OTHER: Key = Key(1969);
			pub const APPLICATIONS_ZERO: Key = Key(1970);
			pub const APPLICATIONS_ONE: Key = Key(1971);
			pub const APPLICATIONS_OTHER: Key = Key(1972);
			pub const SKILLS_MANY: Key = Key(2120);
			pub const APPLICATIONS_MANY: Key = Key(2121);
		}
		pub mod colour {
			use crate::strings::Key;
			pub const LABEL: Key = Key(1946);
			pub const NONE: Key = Key(1947);
			pub const HINT: Key = Key(1948);
		}
		pub mod danger {
			use crate::strings::Key;
			pub const DELETE: Key = Key(2057);
			pub const DESCRIPTION: Key = Key(2058);
			pub const LAST: Key = Key(2059);
			pub mod confirm {
				use crate::strings::Key;
				pub const TITLE: Key = Key(2060);
			}
		}
		pub mod host {
			use crate::strings::Key;
			pub const LABEL: Key = Key(1944);
			pub const HINT: Key = Key(1945);
		}
		pub mod hosting {
			use crate::strings::Key;
			pub const LABEL: Key = Key(2039);
			pub const DESCRIPTION: Key = Key(2040);
			pub const SIGNED_OUT: Key = Key(2041);
			pub const SIGN_IN: Key = Key(2042);
			pub const CONNECTING: Key = Key(2043);
			pub const ONLINE: Key = Key(2044);
			pub mod failed {
				use crate::strings::Key;
				pub const TITLE: Key = Key(2045);
				pub const DESCRIPTION: Key = Key(2046);
				pub mod reasons {
					use crate::strings::Key;
					pub const NOT_OWNER: Key = Key(2047);
					pub const DEVICE_AWAITING_APPROVAL: Key = Key(2048);
					pub const DEVICE_REFUSED: Key = Key(2049);
					pub const KEYS_MISSING: Key = Key(2050);
					pub const INSTANCE_GONE: Key = Key(2051);
					pub const TAKEN_OVER: Key = Key(2052);
					pub const STREAM_CLOSED: Key = Key(2053);
					pub const UNKNOWN: Key = Key(2054);
				}
			}
			pub mod stop_failed {
				use crate::strings::Key;
				pub const TITLE: Key = Key(2055);
				pub const DESCRIPTION: Key = Key(2056);
			}
		}
		pub mod members {
			use crate::strings::Key;
			pub const INVITATIONS: Key = Key(1983);
			pub const LIST: Key = Key(1984);
			pub const PENDING_ONE: Key = Key(1987);
			pub const PENDING_OTHER: Key = Key(1988);
			pub const EXPIRED: Key = Key(1989);
			pub const YOU: Key = Key(1990);
			pub const REMOVE: Key = Key(1991);
			pub const REMOVE_LABEL: Key = Key(1992);
			pub const WITHDRAW_LABEL: Key = Key(1993);
			pub const INVITE_AGAIN_LABEL: Key = Key(1994);
			pub const NEEDS_INVITATION: Key = Key(1995);
			pub const INVITE_MEMBER_AGAIN: Key = Key(1996);
			pub const SENT: Key = Key(2005);
			pub const SENT_DESCRIPTION: Key = Key(2006);
			pub const WITHDRAWN: Key = Key(2007);
			pub const WITHDRAWN_DESCRIPTION: Key = Key(2008);
			pub const PENDING_MANY: Key = Key(2122);
			pub mod confirm {
				use crate::strings::Key;
				pub const TITLE: Key = Key(2003);
				pub const DESCRIPTION: Key = Key(2004);
			}
			pub mod failure {
				pub mod invite {
					use crate::strings::Key;
					pub const NOT_HOSTING: Key = Key(2009);
					pub const LIMIT_REACHED: Key = Key(2010);
					pub const NOT_OWNER: Key = Key(2011);
					pub const NEEDS_SIGN_IN: Key = Key(2012);
					pub const UNREACHABLE: Key = Key(2013);
					pub const OFFLINE: Key = Key(2014);
					pub const TIMED_OUT: Key = Key(2015);
					pub const UNSENT: Key = Key(2016);
					pub const RELAY_STATUS: Key = Key(2017);
					pub const RELAY_CONFLICT: Key = Key(2018);
					pub const UNREADABLE_CONFLICT: Key = Key(2019);
					pub const UNREADABLE_LIST: Key = Key(2020);
					pub const LIST_NOT_READ_BACK: Key = Key(2021);
					pub const GENERIC: Key = Key(2022);
				}
				pub mod remove {
					use crate::strings::Key;
					pub const GONE: Key = Key(2030);
					pub const PENDING: Key = Key(2031);
					pub const HOST: Key = Key(2032);
					pub const HOSTED_BY: Key = Key(2033);
					pub const NOT_HOSTING: Key = Key(2034);
					pub const NOT_OWNER: Key = Key(2035);
					pub const NEEDS_SIGN_IN: Key = Key(2036);
					pub const UNREACHABLE: Key = Key(2037);
					pub const GENERIC: Key = Key(2038);
				}
				pub mod withdraw {
					use crate::strings::Key;
					pub const GONE: Key = Key(2023);
					pub const JOINED: Key = Key(2024);
					pub const NOT_HOSTING: Key = Key(2025);
					pub const NOT_OWNER: Key = Key(2026);
					pub const NEEDS_SIGN_IN: Key = Key(2027);
					pub const UNREACHABLE: Key = Key(2028);
					pub const GENERIC: Key = Key(2029);
				}
			}
			pub mod invite {
				use crate::strings::Key;
				pub const LABEL: Key = Key(1973);
				pub const PLACEHOLDER: Key = Key(1974);
				pub const ACTION: Key = Key(1975);
				pub const HINT: Key = Key(1976);
				pub const NOT_SHARED: Key = Key(1980);
				pub const SIGNED_OUT: Key = Key(1981);
				pub const HOST_OFFLINE: Key = Key(1982);
				pub mod refusal {
					use crate::strings::Key;
					pub const INVITED: Key = Key(1977);
					pub const SELF: Key = Key(1978);
					pub const MALFORMED: Key = Key(1979);
				}
			}
			pub mod invited_again_failure {
				pub mod generic {
					use crate::strings::Key;
					pub const TITLE: Key = Key(2001);
					pub const DESCRIPTION: Key = Key(2002);
				}
				pub mod listed {
					use crate::strings::Key;
					pub const TITLE: Key = Key(1997);
					pub const DESCRIPTION: Key = Key(1998);
				}
				pub mod removed {
					use crate::strings::Key;
					pub const TITLE: Key = Key(1999);
					pub const DESCRIPTION: Key = Key(2000);
				}
			}
			pub mod status {
				use crate::strings::Key;
				pub const HOST: Key = Key(1985);
				pub const EXPIRED: Key = Key(1986);
			}
		}
		pub mod name {
			use crate::strings::Key;
			pub const LABEL: Key = Key(1942);
			pub const PLACEHOLDER: Key = Key(1943);
		}
		pub mod not_shared {
			use crate::strings::Key;
			pub const TITLE: Key = Key(1939);
			pub const DESCRIPTION: Key = Key(1940);
			pub const SHARE: Key = Key(1941);
		}
		pub mod standing {
			use crate::strings::Key;
			pub const YOURS: Key = Key(1933);
			pub const YOURS_SHARED: Key = Key(1934);
			pub const JOINED: Key = Key(1935);
			pub const JOINED_NOT_CONNECTED: Key = Key(1936);
			pub const INVITATION: Key = Key(1937);
		}
		pub mod transfer {
			use crate::strings::Key;
			pub const EXPORT: Key = Key(1949);
			pub const IMPORT: Key = Key(1950);
			pub const EXPORTED: Key = Key(1951);
			pub const IMPORTED: Key = Key(1952);
			pub const EXPORT_FAILED: Key = Key(1953);
			pub const IMPORT_FAILED: Key = Key(1954);
			pub const RETRY: Key = Key(1955);
			pub mod reason {
				use crate::strings::Key;
				pub const UNSUPPORTED_ARCHIVE: Key = Key(1956);
				pub const UNVERSIONED_ARCHIVE: Key = Key(1957);
				pub const UNREADABLE_ARCHIVE: Key = Key(1958);
				pub const UNWRITABLE_ARCHIVE: Key = Key(1959);
				pub const GENERIC: Key = Key(1960);
			}
		}
	}
}
