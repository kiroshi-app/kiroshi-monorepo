import type { InvokeArgs } from "@tauri-apps/api/core"

export type ConversationSource = string | null

type Fields = { [key: string]: unknown }

const SCOPING_ID_KEYS = ["conversationId", "excludedConversationId"]

const SCOPING_ENVELOPES = ["scope", "message", "turn", "draft"]

const ANSWERED_CONVERSATION_ID_KEYS: ReadonlySet<string> = new Set([
	"conversationId",
	"threadConversationId",
	"originConversationId",
])

const HELD_ID_KEYS = [
	"botId",
	"authorBotId",
	"invitedByBotId",
	"botIds",
	"spaceId",
]

export const LOCAL_IDS_COMMAND = "conversation_local_ids"

const PAGE_COMMAND = "conversation_page"

const ANSWERS_NAMING_THEIR_IDS: ReadonlySet<string> = new Set([
	"conversation_main_chat",
	"conversation_create",
	"conversation_list",
	"conversation_update",
	"conversation_add_participant",
	"conversation_remove_participant",
	"conversation_set_lead",
	"conversation_bots",
	"conversation_bots_by_presence",
	"conversation_create_bot",
	"conversation_create_bot_from_draft",
	"conversation_duplicate_bot",
	"space_list",
	"space_create",
	"space_import",
])

const isFields = (value: unknown): value is Fields =>
	typeof value === "object" &&
	value !== null &&
	Object.getPrototypeOf(value) === Object.prototype

const isText = (value: unknown): value is string => typeof value === "string"

const scopingIdsAt = (holder: unknown): string[] =>
	isFields(holder)
		? SCOPING_ID_KEYS.map((key) => holder[key]).filter(isText)
		: []

const scopingHoldersOf = (args?: InvokeArgs): unknown[] =>
	isFields(args)
		? [args, ...SCOPING_ENVELOPES.map((envelope) => args[envelope])]
		: []

const conversationIdsOf = (args?: InvokeArgs): string[] =>
	scopingHoldersOf(args).flatMap(scopingIdsAt)

const heldIdsAt = (holder: unknown): string[] =>
	isFields(holder)
		? HELD_ID_KEYS.flatMap((key) => [holder[key]].flat()).filter(isText)
		: []

const HELD_SCOPE_KINDS: ReadonlySet<unknown> = new Set(["bot", "space"])

const scopedIdsAt = (envelope: unknown): string[] => {
	if (!isFields(envelope)) {
		return []
	}
	if (envelope.kind === "server") {
		return scopedIdsAt(envelope.owner)
	}
	return HELD_SCOPE_KINDS.has(envelope.kind) && isText(envelope.id)
		? [envelope.id]
		: []
}

const heldIdsOf = (args?: InvokeArgs): string[] => {
	if (!isFields(args)) {
		return []
	}
	const holders = [...scopingHoldersOf(args), args.query]
	return [
		...holders.flatMap(heldIdsAt),
		...[args.scope, args.owner].flatMap(scopedIdsAt),
	]
}

const conversationIdsNamedIn = (value: unknown): string[] => {
	if (Array.isArray(value)) {
		return value.flatMap(conversationIdsNamedIn)
	}
	if (!isFields(value)) {
		return []
	}
	return Object.entries(value).flatMap(([key, inner]) =>
		ANSWERED_CONVERSATION_ID_KEYS.has(key) && isText(inner)
			? [inner]
			: conversationIdsNamedIn(inner),
	)
}

const ownIdsOf = (answer: unknown): string[] =>
	[answer]
		.flat()
		.map((conversation) =>
			isFields(conversation) ? conversation.id : undefined,
		)
		.filter(isText)

const listedIdsOf = (answer: unknown): string[] =>
	[answer].flat().filter(isText)

const pagedIdsOf = (answer: unknown): string[] =>
	isFields(answer)
		? [answer.pinned, answer.conversations].flatMap(ownIdsOf)
		: []

const idsAnswered = (command: string, answer: unknown) => [
	...(ANSWERS_NAMING_THEIR_IDS.has(command) ? ownIdsOf(answer) : []),
	...(command === PAGE_COMMAND ? pagedIdsOf(answer) : []),
	...(command === LOCAL_IDS_COMMAND ? listedIdsOf(answer) : []),
	...conversationIdsNamedIn(answer),
]

const WRITE_ID_KEYS = ["id", "turnId", "messageId"]

const WRITE_ENVELOPES = ["turn", "message"]

const COMMANDS_OPENING_A_WRITE: ReadonlySet<string> = new Set([
	"conversation_start_turn",
	"conversation_open_assistant_message",
])

const writeIdsAt = (holder: unknown): string[] =>
	isFields(holder) ? WRITE_ID_KEYS.map((key) => holder[key]).filter(isText) : []

const writeIdsOf = (args?: InvokeArgs): string[] =>
	isFields(args)
		? [args, ...WRITE_ENVELOPES.map((envelope) => args[envelope])].flatMap(
				writeIdsAt,
			)
		: []

const leaveRefusalToCaller = () => undefined

export const createConversationProvenance = () => {
	const sourcesById = new Map<string, Set<ConversationSource>>()

	const learn = (source: ConversationSource, ids: string[]) => {
		for (const id of ids) {
			const sources = sourcesById.get(id) ?? new Set()
			sources.add(source)
			sourcesById.set(id, sources)
		}
	}

	const namesConversation = (args?: InvokeArgs): boolean =>
		conversationIdsOf(args).length > 0

	const sourcesNamedIn = (args?: InvokeArgs): Set<ConversationSource> =>
		new Set(
			[...conversationIdsOf(args), ...writeIdsOf(args)].flatMap((id) => [
				...(sourcesById.get(id) ?? []),
			]),
		)

	const isAnsweredOnlyHere =
		(source: ConversationSource) =>
		(id: string): boolean => {
			const sources = sourcesById.get(id)
			return sources?.has(null) === true && !sources.has(source)
		}

	const heldOnlyHereIn = (
		args: InvokeArgs | undefined,
		source: ConversationSource,
	): string[] => heldIdsOf(args).filter(isAnsweredOnlyHere(source))

	const recordSent = (
		source: ConversationSource,
		command: string,
		args?: InvokeArgs,
	) => {
		if (COMMANDS_OPENING_A_WRITE.has(command)) {
			learn(source, writeIdsOf(args))
		}
	}

	const record = <T>(
		source: ConversationSource,
		command: string,
		answer: Promise<T>,
	): Promise<T> => {
		answer.then(
			(answered) => learn(source, idsAnswered(command, answered)),
			leaveRefusalToCaller,
		)
		return answer
	}

	return {
		namesConversation,
		sourcesNamedIn,
		heldOnlyHereIn,
		recordSent,
		record,
	}
}
