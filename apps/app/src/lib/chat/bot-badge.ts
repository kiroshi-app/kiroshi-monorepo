import { type ChatState, isTurnBusy } from "./chat-state"

export type BotBadge = "attention" | "done" | "failed" | "none"

export type BotBadgeInput = {
	held: BotBadge
	before: ChatState | undefined
	after: ChatState
	isSelected: boolean
	hasFocus: boolean
}

const wantsAttention = (state: ChatState): boolean => state.permission !== null

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
	if (wantsAttention(after)) {
		return "attention"
	}
	if (isSelected && hasFocus) {
		return "none"
	}
	if (isTurnBusy(after.turn)) {
		return "none"
	}
	if (before && hasTurnEnded(before, after)) {
		return after.turn === "failed" ? "failed" : "done"
	}
	return held === "attention" ? "none" : held
}
