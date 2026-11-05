import { useEffect, useState } from "react"

import type { BoardTool } from "@workspace/ui/components/board/board-dock"
import { isTypingTarget } from "@workspace/ui/lib/typing-target"

import { usesCommandKey } from "../host"

type LibraryBoardHistory = {
	undo: () => void
	redo: () => void
}

type CommandModifier = "metaKey" | "ctrlKey"

const BOARD_SELECTOR = '[data-slot="board-canvas"]'

const HAND_KEY = " "

const isOnBoard = (target: EventTarget | null): target is HTMLElement =>
	target instanceof HTMLElement &&
	target.closest(BOARD_SELECTOR) !== null &&
	!isTypingTarget(target)

const isOnControl = (target: HTMLElement) => target.closest("button") !== null

const historyStepOf = (
	event: KeyboardEvent,
	modifier: CommandModifier,
	{ undo, redo }: LibraryBoardHistory,
) => {
	const otherModifier = modifier === "metaKey" ? "ctrlKey" : "metaKey"
	const isUndoChord =
		event[modifier] &&
		!event[otherModifier] &&
		!event.altKey &&
		event.key.toLowerCase() === "z"
	if (!isUndoChord) {
		return null
	}
	return event.shiftKey ? redo : undo
}

export const useLibraryBoardKeys = ({ undo, redo }: LibraryBoardHistory) => {
	const [pickedTool, pickTool] = useState<BoardTool>("select")
	const [isHandHeld, setIsHandHeld] = useState(false)

	useEffect(() => {
		const modifier: CommandModifier = usesCommandKey() ? "metaKey" : "ctrlKey"

		const press = (event: KeyboardEvent) => {
			const { target } = event
			if (event.isComposing || !isOnBoard(target)) {
				return
			}
			if (event.key === HAND_KEY) {
				if (!isOnControl(target)) {
					event.preventDefault()
					setIsHandHeld(true)
				}
				return
			}
			const step = historyStepOf(event, modifier, { undo, redo })
			if (!step) {
				return
			}
			event.preventDefault()
			step()
		}

		const release = (event: KeyboardEvent) => {
			if (event.key === HAND_KEY) {
				setIsHandHeld(false)
			}
		}

		window.addEventListener("keydown", press)
		window.addEventListener("keyup", release)
		return () => {
			window.removeEventListener("keydown", press)
			window.removeEventListener("keyup", release)
		}
	}, [undo, redo])

	return { tool: isHandHeld ? "hand" : pickedTool, pickTool }
}
