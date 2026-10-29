import type { ClaudeImportPort } from "./claude-import-controller"

import { invoke, listenOnThisComputer } from "../host"
import {
	CLAUDE_IMPORT_PROGRESS_EVENT,
	type ClaudeImportOutcome,
	type ClaudeImportProgress,
	type ClaudeInventory,
} from "@/lib/bindings"

export const readClaudeInventory = () =>
	invoke<ClaudeInventory>("claude_import_inventory")

export const claudeImportTransport: ClaudeImportPort = {
	run: (selection, spaceId) =>
		invoke<ClaudeImportOutcome[]>("claude_import_run", { selection, spaceId }),

	onProgress: (onProgress) =>
		listenOnThisComputer<ClaudeImportProgress>(
			CLAUDE_IMPORT_PROGRESS_EVENT,
			({ payload }) => onProgress(payload),
		),
}
