import { useCommandShortcut } from "@workspace/ui/hooks/use-command-shortcut"

export type WorkspaceShortcuts = {
	isEnabled: boolean
	onOpenUserSettings: () => void
	onNewConversation: () => void
}

export const useWorkspaceShortcuts = ({
	isEnabled,
	onOpenUserSettings,
	onNewConversation,
}: WorkspaceShortcuts) => {
	useCommandShortcut({
		chordKey: ",",
		isEnabled,
		onPress: onOpenUserSettings,
	})

	useCommandShortcut({
		chordKey: "n",
		isEnabled,
		onPress: onNewConversation,
	})
}
