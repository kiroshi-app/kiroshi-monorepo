import { type ChatState, isTurnBusy } from "./chat-state"

export type BotBadge = "done" | "failed" | "none"

export type BotBadgeInput = {
	held: BotBadge
	before: ChatState | undefined
	after: ChatState
	isSelected: boolean
	hasFocus: boolean
}

const hasTurnEnded = (before: ChatState, after: ChatState): boolean =>
	isTurnBusy(before.turn) &&
	before.turn !== "stopping" &&
	!isTurnBusy(after.turn)

export const badgeAfter = ({
	held,
	before,
	after,
	isSelected,
	hasFocus,
}: BotBadgeInput): BotBadge => {
	if (isSelected && hasFocus) {
		return "none"
	}
	if (isTurnBusy(after.turn)) {
		return "none"
	}
	if (before && hasTurnEnded(before, after)) {
		return after.turn === "failed" ? "failed" : "done"
	}
	return held
}
