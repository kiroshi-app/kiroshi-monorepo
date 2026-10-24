import type { RosterState } from "./roster-controller"
import type { RosterLine } from "./roster-line"

import type { Bot, Conversation } from "../conversations/store-contract"

export type RosterFrame = Omit<
	RosterState,
	"previews" | "conversationPreviews" | "hostStates"
>

type Sameness<Value> = (held: Value, next: Value) => boolean

const ACTIVITY_FIELDS = {
	updatedAt: undefined,
	lastActivityAt: undefined,
	lastWord: undefined,
}

const standingOf = (conversation: Conversation) =>
	JSON.stringify({ ...conversation, ...ACTIVITY_FIELDS })

const isSameStanding: Sameness<Conversation> = (held, next) =>
	held === next || standingOf(held) === standingOf(next)

const isSameConversationSet: Sameness<Conversation[]> = (held, next) => {
	if (held === next) {
		return true
	}
	const heldById = new Map(
		held.map((conversation) => [conversation.id, conversation]),
	)
	return (
		held.length === next.length &&
		next.every((conversation) => {
			const heldConversation = heldById.get(conversation.id)
			return (
				heldConversation !== undefined &&
				isSameStanding(heldConversation, conversation)
			)
		})
	)
}

const isSameBotList: Sameness<Bot[]> = (held, next) =>
	held.length === next.length && held.every((bot, index) => bot === next[index])

const isSameLine: Sameness<RosterLine> = (held, next) =>
	held.spaceId === next.spaceId && held.botId === next.botId

const isSameRecordBy =
	<Value>(isSame: Sameness<Value>): Sameness<Record<string, Value>> =>
	(held, next) => {
		const heldKeys = Object.keys(held)
		return (
			heldKeys.length === Object.keys(next).length &&
			heldKeys.every((key) => key in next && isSame(held[key], next[key]))
		)
	}

const SAMENESS_OF: Partial<{
	[Field in keyof RosterFrame]: Sameness<RosterFrame[Field]>
}> = {
	rosters: isSameRecordBy(isSameBotList),
	bots: isSameBotList,
	conversationRosters: isSameRecordBy(isSameConversationSet),
	conversations: isSameConversationSet,
	soloThreads: isSameRecordBy(isSameLine),
}

const isSameField = <Field extends keyof RosterFrame>(
	field: Field,
	held: RosterFrame,
	next: RosterFrame,
) => {
	const isSame: Sameness<RosterFrame[Field]> = SAMENESS_OF[field] ?? Object.is
	return isSame(held[field], next[field])
}

const isSameFrame = (held: RosterFrame, next: RosterFrame) =>
	(Object.keys(next) as (keyof RosterFrame)[]).every((field) =>
		isSameField(field, held, next),
	)

const frameOf = ({
	previews,
	conversationPreviews,
	hostStates,
	...frame
}: RosterState): RosterFrame => frame

export const rosterFrameReader = (readState: () => RosterState) => {
	let readFrom: RosterState | null = null
	let frame: RosterFrame | null = null
	return (): RosterFrame => {
		const state = readState()
		if (frame !== null && state === readFrom) {
			return frame
		}
		const next = frameOf(state)
		readFrom = state
		frame = frame !== null && isSameFrame(frame, next) ? frame : next
		return frame
	}
}
