import type { ImportScreenProps } from "@workspace/ui/components/import-screen"

import {
	type ClaudeImportWorld,
	createClaudeImportController,
} from "./claude-import-controller"
import {
	type ClaudeImportVariant,
	importScreenPropsOf,
	pickedKeysOf,
} from "./claude-import-screen"
import { claudeImportTransport } from "./claude-import-transport"
import { useClaudeInventory } from "./use-claude-inventory"

import { useController } from "../use-controller"

export type ClaudeImportInput = {
	variant: ClaudeImportVariant
	world: ClaudeImportWorld
}

export const useClaudeImport = ({
	variant,
	world,
}: ClaudeImportInput): ImportScreenProps | null => {
	const { inventory, readAgain, readAfterImport } = useClaudeInventory()
	const { state, controller } = useController(() =>
		createClaudeImportController(claudeImportTransport, world),
	)

	if (!inventory) {
		return null
	}

	const importThen = (run: Promise<void>) => void run.then(readAfterImport)

	return importScreenPropsOf(
		{ variant, inventory, session: state },
		{
			onToggle: controller.toggle,
			onImport: () =>
				importThen(controller.importPicked(pickedKeysOf(inventory, state))),
			onRetryFailed: () => importThen(controller.retryFailed()),
			onReadAgain: readAgain,
			onLeave: controller.leave,
		},
	)
}
