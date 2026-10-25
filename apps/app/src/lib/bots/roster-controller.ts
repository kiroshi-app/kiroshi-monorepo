import {
	infiniteQueryOptions,
	type QueryClient,
	queryOptions,
} from "@tanstack/react-query"

import type {
	BotOutputStyle,
	BotSettingsValue,
} from "@workspace/ui/components/bot-settings"
import type { ConversationSettingsValue } from "@workspace/ui/components/conversation-settings-dialog"
import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { newBotIdentity, toIdentity, toSettingsValue } from "./bot-settings"
import { type RosterLine, rosterLinesIn, type SoloThreads } from "./roster-line"
import {
	type ConversationHostStates,
	cursorAfter,
	hostStatesIn,
	hostStatesOf,
	lastWordsIn,
	lastWordsOf,
	NO_HOST_STATES,
	NO_LAST_WORDS,
	NO_SOLO_BOT_IDS,
	observedStateOf,
	ROSTER_PAGE_SIZE,
	type RosterPage,
	type RosterPages,
	type RosterRead,
	rosterReadOf,
	type SoloBotIds,
	soloBotIdsIn,
	soloBotIdsOf,
	topicsIn,
	withFreshHead,
	withHeldRead,
	withHostState,
	withPageRow,
} from "./roster-pages"

import { failureReporterIn } from "../failure-report"
import { createQueue } from "../queue"
import { createStore } from "../store"
import { createWriteLoop } from "../write-loop"
import type { ConversationNaming } from "../agent/contract"
import { conversationQueryKeys } from "../conversations/conversation-query-keys"
import {
	isNameless,
	presentParticipants,
	toConversationSettingsValue,
} from "../conversations/roster-conversations"
import type {
	Bot,
	BotDraft,
	Chat,
	Conversation,
	ConversationInPage,
	ObservedState,
	Participant,
	RosterPin,
	SpaceError,
} from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"
import type {
	ConversationPreviews,
	LastWord,
} from "../conversations/transcript-state"
import { memoizedOn, subscribeWithQueries } from "../query/cache-view"
import type { FailureMeta } from "../query/query-client"
import { runMutation } from "../query/run-mutation"
import {
	isJoinedRowId,
	joinedRowIdOf,
} from "../spaces/joined-spaces-controller"

type SpaceOnHost = { hostId: string | null; spaceId: string | null }

export type ConversationStateChange = ObservedState & {
	conversationId: string
}

export type BotPreviews = Record<string, LastWord | undefined>

export type RosterState = {
	rosters: Record<string, Bot[]>
	bots: Bot[]
	conversationRosters: Record<string, Conversation[]>
	conversations: Conversation[]
	spaceRowId: string | null
	previews: Record<string, BotPreviews>
	soloThreads: SoloThreads
	hostStates: ConversationHostStates
	conversationPreviews: ConversationPreviews
	selectedBotId: string | null
	selectedConversationId: string | null
	settingsBotId: string | null
	settingsConversationId: string | null
	isEditing: boolean
	isShowingDanger: boolean
	isEditingConversation: boolean
	hasLoaded: boolean
	hasFailedToLoad: boolean
	isRosterPending: boolean
}

export type RosterSpace = {
	spaceRowId: string
	spaceId: string
}

type RosterOpening = {
	spaces: RosterSpace[]
	spaceRowId: string | null
	lastRowId: string | null
}

type RosterEntry = RosterSpace & {
	lastRowId: string | null
}

const JOINED_HOST_ANSWER_MS = 10_000

const answeredInTime = (signal: AbortSignal) =>
	AbortSignal.any([signal, AbortSignal.timeout(JOINED_HOST_ANSWER_MS)])

type RosterPageRead = (
	cursor: string | null,
	signal?: AbortSignal,
) => Promise<RosterPage>

const rosterQueryOf = (space: RosterSpace, read: RosterPageRead) =>
	infiniteQueryOptions({
		queryKey: conversationQueryKeys.roster(space.spaceRowId, space.spaceId),
		queryFn: isJoined(space)
			? ({ pageParam, signal }) => read(pageParam, answeredInTime(signal))
			: ({ pageParam, signal }) => read(pageParam, signal),
		initialPageParam: null as string | null,
		getNextPageParam: cursorAfter,
		meta: { rendersErrorInline: true, rereadsItselfOnReconnect: true },
	})

const PREVIEW_FAILURE: FailureMeta = {
	failureNotice: () => ({ title: i18n.t("bots:roster.previewUnreadable") }),
	raisedIn: "use-roster",
}

const CONVERSATION_WRITE_FAILURE: FailureMeta = {
	failureNotice: () => ({ title: i18n.t("bots:roster.conversationUnsaved") }),
	raisedIn: "roster-controller",
}

const ROSTER_REREAD_DELAY_MS = 250

const soloThreadQueryOf = (
	line: RosterLine,
	spaceId: string,
	read: (signal: AbortSignal) => Promise<Chat>,
) =>
	queryOptions({
		queryKey: conversationQueryKeys.soloThread(
			line.spaceId,
			spaceId,
			line.botId,
		),
		queryFn: ({ signal }) => read(signal),
		gcTime: Number.POSITIVE_INFINITY,
		meta: { ...PREVIEW_FAILURE, rereadsItselfOnReconnect: true },
	})

type RosterQuery = ReturnType<typeof rosterQueryOf>
type SoloThreadQuery = ReturnType<typeof soloThreadQueryOf>

type ConversationStyle = Partial<Pick<Conversation, "icon" | "color">>

export type RosterController = {
	getState: () => RosterState
	subscribe: (listener: () => void) => () => void
	rosterQuery: (spaceRowId: string) => RosterQuery
	soloThreadQuery: (line: RosterLine) => SoloThreadQuery
	load: (opening: RosterOpening) => Promise<void>
	retryLoad: () => Promise<void>
	reload: () => Promise<void>
	holdPageRow: (origin: SpaceOnHost, row: ConversationInPage) => void
	holdHostState: (origin: SpaceOnHost, changed: ConversationStateChange) => void
	rereadSpaceSoon: (origin: SpaceOnHost) => void
	rereadSpacesOfBotSoon: (botId: string) => void
	catchUpWithHost: (hostId: string) => void
	rereadConversationRow: (conversationId: string) => void
	forgetConversation: (conversationId: string) => void
	hostSpaceIdOf: (spaceRowId: string) => string
	spacesOfBot: (botId: string) => string[]
	spaceOfConversation: (conversationId: string) => string | undefined
	enter: (entry: RosterEntry) => void
	select: (id: string) => void
	selectConversation: (id: string) => void
	create: () => Promise<void>
	createFromDraft: (draft: BotDraft) => Promise<Bot>
	createConversation: (botIds?: string[]) => Promise<Conversation | null>
	duplicate: (id: string, spaceRowId?: string) => Promise<Bot | null>
	edit: (id: string) => void
	setEditing: (isEditing: boolean) => void
	describe: (id: string, value: BotSettingsValue) => void
	restyle: (id: string, outputStyle: BotOutputStyle) => void
	uploadAvatar: (id: string, file: File) => Promise<void>
	remember: (id: string, memory: string) => Promise<void>
	moveToSection: (botId: string, sectionId: string | null) => void
	pin: (pins: RosterPin[]) => void
	moveToSpace: (botId: string, spaceRowId: string) => Promise<Bot | null>
	addToSpace: (botId: string, spaceRowId: string) => Promise<void>
	removeFromSpace: (botId: string, spaceRowId: string) => Promise<void>
	clearSection: (sectionId: string) => void
	askToDelete: (id: string) => void
	remove: (id: string) => Promise<void>
	moveConversationToSection: (
		conversationId: string,
		sectionId: string | null,
	) => Promise<void>
	editConversation: (id: string) => void
	setConversationEditing: (isEditing: boolean) => void
	describeConversation: (id: string, value: ConversationSettingsValue) => void
	styleConversation: (id: string, style: ConversationStyle) => void
	nameConversation: (id: string, naming: ConversationNaming) => void
	setConversationLead: (
		conversationId: string,
		botId: string,
	) => Promise<boolean>
	recruitToConversation: (
		conversationId: string,
		botId: string,
	) => Promise<Conversation | null>
	dismissFromConversation: (
		conversationId: string,
		botId: string,
	) => Promise<boolean>
	botsByPresence: (conversationId: string) => Promise<Bot[]>
	removeConversation: (id: string) => Promise<void>
}

type RosterChoice = {
	spaces: RosterSpace[]
	spaceRowId: string | null
	lastRowId: string | null
	chosenBotId: string | null
	chosenConversationId: string | null
	settingsBotId: string | null
	settingsConversationId: string | null
	isEditing: boolean
	isShowingDanger: boolean
	isEditingConversation: boolean
	hasLoaded: boolean
}

const initialRosterChoice: RosterChoice = {
	spaces: [],
	spaceRowId: null,
	lastRowId: null,
	chosenBotId: null,
	chosenConversationId: null,
	settingsBotId: null,
	settingsConversationId: null,
	isEditing: false,
	isShowingDanger: false,
	isEditingConversation: false,
	hasLoaded: false,
}

const LOOSE = { sectionId: null, pinPosition: null }

type Placement = { sectionId: string | null; pinPosition: number }

const relocated = <Row extends { id: string }>(
	rows: Row[],
	placed: Map<string, Placement>,
) => rows.map((row) => ({ ...row, ...(placed.get(row.id) ?? LOOSE) }))

const LAST_PIN = Number.MAX_SAFE_INTEGER

const pinnedLast = (sectionId: string | null) =>
	sectionId === null ? null : LAST_PIN

type Landing = {
	selectedBotId: string | null
	selectedConversationId: string | null
}

const landingOn = (
	bots: Bot[],
	conversations: Conversation[],
	id: string | null,
): Landing | null => {
	if (id === null) {
		return null
	}
	if (bots.some((bot) => bot.id === id)) {
		return { selectedBotId: id, selectedConversationId: null }
	}
	if (conversations.some((conversation) => conversation.id === id)) {
		return { selectedBotId: null, selectedConversationId: id }
	}
	return null
}

const withSeatsOf = (
	conversations: Conversation[],
	botId: string,
	worn: Partial<Participant>,
): Conversation[] =>
	conversations.map((conversation) => ({
		...conversation,
		participants: conversation.participants.map((participant) =>
			participant.botId === botId ? { ...participant, ...worn } : participant,
		),
	}))

const faceOf = (bot: Bot): Partial<Participant> => ({
	name: bot.name,
	avatarBlot: bot.avatarBlot,
	avatarImagePath: bot.avatarImagePath,
})

const seats = (conversation: Conversation, botId: string) =>
	presentParticipants(conversation).some(
		(participant) => participant.botId === botId,
	)

const firstRowId = (bots: Bot[], conversations: Conversation[]) =>
	bots[0]?.id ?? conversations[0]?.id ?? null

const NOTHING_SELECTED: Landing = {
	selectedBotId: null,
	selectedConversationId: null,
}

const NO_SETTINGS = {
	settingsBotId: null,
	settingsConversationId: null,
	isEditing: false,
	isShowingDanger: false,
	isEditingConversation: false,
}

type BotSettingsOpening = { id: string; isShowingDanger: boolean }

const NO_SPACE = { kind: "unknownSpace", id: "" } satisfies SpaceError

const NO_TITLE = ""

const NOBODY_SEATED: string[] = []

const NO_BOTS: Bot[] = []

const NO_CONVERSATIONS: Conversation[] = []

const namesTheLastSpace = (reason: unknown): boolean =>
	typeof reason === "object" &&
	reason !== null &&
	"kind" in reason &&
	reason.kind === "lastSpaceOfBot"

const rosterIn = <Row>(
	rosters: Record<string, Row[]>,
	spaceRowId: string | null,
) => (spaceRowId === null ? [] : (rosters[spaceRowId] ?? []))

const isJoined = ({ spaceRowId }: RosterSpace) => isJoinedRowId(spaceRowId)

const isLocal = (space: RosterSpace) => !isJoined(space)

const isRowOfHost = (spaceRowId: string, hostId: string | null) =>
	hostId === null
		? !isJoinedRowId(spaceRowId)
		: spaceRowId === joinedRowIdOf(hostId)

const heldSpaceRowIdsOf = ({ spaces, spaceRowId }: RosterChoice) => {
	const listed = spaces.map((space) => space.spaceRowId)
	return spaceRowId === null || listed.includes(spaceRowId)
		? listed
		: [...listed, spaceRowId]
}

const choiceOf = ({
	selectedBotId,
	selectedConversationId,
}: Landing): Partial<RosterChoice> => ({
	chosenBotId: selectedBotId,
	chosenConversationId: selectedConversationId,
})

const chosenLandingOf = ({
	chosenBotId,
	chosenConversationId,
}: RosterChoice): Landing => ({
	selectedBotId: chosenBotId,
	selectedConversationId: chosenConversationId,
})

const isHeldIn = (
	rosters: Record<string, { id: string }[]>,
	id: string | null,
) => Object.values(rosters).some((rows) => rows.some((row) => row.id === id))

const landingIn = (
	choice: RosterChoice,
	rosters: Record<string, Bot[]>,
	conversationRosters: Record<string, Conversation[]>,
): Landing => {
	const bots = rosterIn(rosters, choice.spaceRowId)
	const conversations = rosterIn(conversationRosters, choice.spaceRowId)
	const chosenRowId = choice.chosenBotId ?? choice.chosenConversationId
	const isChosenElsewhere =
		isHeldIn(rosters, chosenRowId) || isHeldIn(conversationRosters, chosenRowId)
	return (
		landingOn(bots, conversations, chosenRowId) ??
		(isChosenElsewhere ? chosenLandingOf(choice) : null) ??
		landingOn(bots, conversations, choice.lastRowId) ??
		landingOn(bots, conversations, firstRowId(bots, conversations)) ??
		NOTHING_SELECTED
	)
}

const settingsStandingIn = (
	choice: RosterChoice,
	bots: Bot[],
	conversations: Conversation[],
) => {
	const holdsBot = bots.some((bot) => bot.id === choice.settingsBotId)
	const holdsConversation = conversations.some(
		(conversation) => conversation.id === choice.settingsConversationId,
	)
	return {
		settingsBotId: holdsBot ? choice.settingsBotId : null,
		settingsConversationId: holdsConversation
			? choice.settingsConversationId
			: null,
		isEditing: choice.isEditing && holdsBot,
		isShowingDanger: choice.isShowingDanger && holdsBot,
		isEditingConversation: choice.isEditingConversation && holdsConversation,
	}
}

const previewsOf = (
	rows: { id: string }[],
	words: Record<string, LastWord>,
): Record<string, LastWord> =>
	Object.fromEntries(
		rows.flatMap(({ id }) => (words[id] ? [[id, words[id]]] : [])),
	)

const pagedSoloThreadsIn = (
	spaceRowId: string,
	bots: Bot[],
	soloBotIds: SoloBotIds,
): SoloThreads =>
	Object.fromEntries(
		Object.entries(soloBotIds).flatMap(([conversationId, botId]) =>
			bots.some(({ id }) => id === botId)
				? [[conversationId, { spaceId: spaceRowId, botId }]]
				: [],
		),
	)

const rosterBaseOf = (
	choice: RosterChoice,
	paged: (RosterPages | undefined)[],
	failures: boolean[],
	pendings: boolean[],
): RosterState => {
	const spaceRowIds = heldSpaceRowIdsOf(choice)
	const reads = paged.map((pages) => pages && rosterReadOf(pages))
	const words = paged.map((pages) =>
		pages ? lastWordsOf(pages) : NO_LAST_WORDS,
	)
	const chosenIndex = choice.spaceRowId
		? spaceRowIds.indexOf(choice.spaceRowId)
		: -1
	const rosters = Object.fromEntries(
		spaceRowIds.map((id, index) => [id, reads[index]?.bots ?? NO_BOTS]),
	)
	const conversationRosters = Object.fromEntries(
		spaceRowIds.map((id, index) => [
			id,
			reads[index]?.conversations ?? NO_CONVERSATIONS,
		]),
	)
	const previews = Object.fromEntries(
		spaceRowIds.map((id, index) => [
			id,
			previewsOf(rosters[id], words[index].companions),
		]),
	)
	const conversationPreviews = Object.assign(
		{},
		...spaceRowIds.map((id, index) =>
			previewsOf(conversationRosters[id], words[index].conversations),
		),
	)
	const soloThreads: SoloThreads = Object.assign(
		{},
		...spaceRowIds.map((id, index) =>
			pagedSoloThreadsIn(
				id,
				rosters[id],
				paged[index] ? soloBotIdsOf(paged[index]) : NO_SOLO_BOT_IDS,
			),
		),
	)
	const hostStates: ConversationHostStates = Object.assign(
		{},
		...paged.map((pages) => (pages ? hostStatesOf(pages) : NO_HOST_STATES)),
	)
	const bots = rosterIn(rosters, choice.spaceRowId)
	const conversations = rosterIn(conversationRosters, choice.spaceRowId)
	return {
		rosters,
		bots,
		conversationRosters,
		conversations,
		previews,
		soloThreads,
		hostStates,
		conversationPreviews,
		spaceRowId: choice.spaceRowId,
		...landingIn(choice, rosters, conversationRosters),
		...settingsStandingIn(choice, bots, conversations),
		hasLoaded: choice.hasLoaded,
		hasFailedToLoad: failures.includes(true),
		isRosterPending: pendings[chosenIndex] ?? false,
	}
}

const hostStatesOfChat = (chat: Chat): ConversationHostStates =>
	chat.state === undefined
		? NO_HOST_STATES
		: { [chat.id]: observedStateOf({ ...chat, state: chat.state }) }

const rosterStateOf = (
	base: RosterState,
	soloChats: (Chat | undefined)[],
): RosterState => {
	const soloThreads: SoloThreads = { ...base.soloThreads }
	const chatStates: ConversationHostStates[] = []
	rosterLinesIn(base.rosters).forEach((line, index) => {
		const chat = soloChats[index]
		if (chat !== undefined) {
			soloThreads[chat.id] = line
			chatStates.push(hostStatesOfChat(chat))
		}
	})
	const hostStates = Object.assign({}, ...chatStates, base.hostStates)
	return { ...base, soloThreads, hostStates }
}

export type RosterControllerOptions = {
	queryClient: QueryClient
	reportFailure?: (notice: NoticeMessage) => void
}

export const createRosterController = (
	store: TranscriptStore,
	{
		queryClient,
		reportFailure = failureReporterIn("roster-controller"),
	}: RosterControllerOptions,
): RosterController => {
	const choiceStore = createStore(initialRosterChoice)
	const chosen = choiceStore.getState
	const hostSpaceIds = new Map<string, string>()

	const hostSpaceIdOf = (spaceRowId: string) =>
		hostSpaceIds.get(spaceRowId) ?? spaceRowId

	const hostSpaceIdIn = (spaceRowId: string | null) =>
		spaceRowId === null ? null : hostSpaceIdOf(spaceRowId)

	const learn = ({ spaceRowId, spaceId }: RosterSpace) => {
		hostSpaceIds.set(spaceRowId, spaceId)
	}

	const enqueue = createQueue()

	const commit = <Result>(write: () => Promise<Result>) =>
		enqueue(() => runMutation(queryClient, write))

	const readBotsAt = (
		spaceId: string,
		cursor: string | null,
		signal?: AbortSignal,
	) =>
		cursor === null ? store.bots(spaceId, signal) : Promise.resolve(NO_BOTS)

	const readRosterPageIn = async (
		spaceId: string,
		cursor: string | null,
		signal?: AbortSignal,
	): Promise<RosterPage> => {
		const [bots, page] = await Promise.all([
			readBotsAt(spaceId, cursor, signal),
			store.conversationPage(spaceId, cursor, ROSTER_PAGE_SIZE, signal),
		])
		return {
			bots,
			conversations: topicsIn(page),
			lastWords: lastWordsIn(page),
			soloBotIds: soloBotIdsIn(page),
			hostStates: hostStatesIn(page),
			nextCursor: page.nextCursor,
		}
	}

	const rosterQuery = (spaceRowId: string) => {
		const spaceId = hostSpaceIdOf(spaceRowId)
		return rosterQueryOf({ spaceRowId, spaceId }, (cursor, signal) =>
			readRosterPageIn(spaceId, cursor, signal),
		)
	}

	const soloThreadQuery = (line: RosterLine) => {
		const spaceId = hostSpaceIdOf(line.spaceId)
		return soloThreadQueryOf(line, spaceId, (signal) =>
			store.mainChat(line.botId, spaceId, signal),
		)
	}

	const rosterReadIn = (spaceRowId: string) =>
		queryClient.getQueryData(rosterQuery(spaceRowId).queryKey)

	const hasRosterFailedIn = (spaceRowId: string) =>
		queryClient.getQueryState(rosterQuery(spaceRowId).queryKey)?.status ===
		"error"

	const isRosterPendingIn = (spaceRowId: string) => {
		const read = queryClient.getQueryState(rosterQuery(spaceRowId).queryKey)
		return (
			read?.fetchStatus === "fetching" &&
			read.data === undefined &&
			read.errorUpdatedAt === 0
		)
	}

	const soloChatOf = (line: RosterLine) =>
		queryClient.getQueryData(soloThreadQuery(line).queryKey)

	const base = memoizedOn(() => {
		const spaceRowIds = heldSpaceRowIdsOf(chosen())
		return [
			chosen(),
			spaceRowIds.map(rosterReadIn),
			spaceRowIds.map(hasRosterFailedIn),
			spaceRowIds.map(isRosterPendingIn),
		]
	}, rosterBaseOf)

	const current = memoizedOn(() => {
		const held = base()
		return [held, rosterLinesIn(held.rosters).map(soloChatOf)]
	}, rosterStateOf)

	const choose = (fields: Partial<RosterChoice>) =>
		choiceStore.setState({ ...chosen(), ...fields })

	const holdRoster = (
		spaceRowId: string | null,
		update: (held: RosterRead) => RosterRead,
	) => {
		if (spaceRowId === null) {
			return
		}
		queryClient.setQueryData(rosterQuery(spaceRowId).queryKey, (paged) =>
			withHeldRead(
				paged,
				update(
					paged
						? rosterReadOf(paged)
						: { bots: NO_BOTS, conversations: NO_CONVERSATIONS },
				),
			),
		)
	}

	const holdBots = (spaceRowId: string | null, bots: Bot[]) =>
		holdRoster(spaceRowId, (held) => ({ ...held, bots }))

	const holdConversations = (
		spaceRowId: string | null,
		conversations: Conversation[],
	) => holdRoster(spaceRowId, (held) => ({ ...held, conversations }))

	const held = (id: string) => current().bots.find((bot) => bot.id === id)

	const heldConversation = (id: string) =>
		current().conversations.find((conversation) => conversation.id === id)

	const spacesOfBot = (botId: string) => {
		const { rosters } = current()
		return Object.keys(rosters).filter((spaceRowId) =>
			rosterIn(rosters, spaceRowId).some((bot) => bot.id === botId),
		)
	}

	const spaceOfConversation = (conversationId: string) => {
		const { conversationRosters, soloThreads } = current()
		return (
			Object.keys(conversationRosters).find((spaceRowId) =>
				rosterIn(conversationRosters, spaceRowId).some(
					(conversation) => conversation.id === conversationId,
				),
			) ?? soloThreads[conversationId]?.spaceId
		)
	}

	const landOn = (
		bots: Bot[],
		conversations: Conversation[],
		lastRowId: string | null,
	) => {
		const { selectedBotId, selectedConversationId } = current()
		const selectedRowId = selectedBotId ?? selectedConversationId
		return (
			landingOn(bots, conversations, selectedRowId) ??
			landingOn(bots, conversations, lastRowId) ??
			landingOn(bots, conversations, firstRowId(bots, conversations)) ??
			NOTHING_SELECTED
		)
	}

	const admit = (written: Bot, spaceRowId: string | null) => {
		holdBots(spaceRowId, [...rosterIn(current().rosters, spaceRowId), written])
		choose({
			spaceRowId,
			chosenBotId: written.id,
			chosenConversationId: null,
		})
	}

	const enrol = (written: Bot, spaceRowId: string) =>
		holdBots(spaceRowId, [...rosterIn(current().rosters, spaceRowId), written])

	const admitConversation = (written: Conversation, spaceRowId: string) => {
		holdConversations(spaceRowId, [
			...rosterIn(current().conversationRosters, spaceRowId),
			written,
		])
		choose({
			spaceRowId,
			chosenBotId: null,
			chosenConversationId: written.id,
		})
	}

	const applyConversation = (written: Conversation) => {
		const { spaceRowId, conversations } = current()
		holdConversations(
			spaceRowId,
			conversations.map((conversation) =>
				conversation.id === written.id ? written : conversation,
			),
		)
	}

	const apply = (written: Bot) => {
		const { spaceRowId, bots, conversations } = current()
		holdRoster(spaceRowId, () => ({
			bots: bots.map((bot) => (bot.id === written.id ? written : bot)),
			conversations: withSeatsOf(conversations, written.id, faceOf(written)),
		}))
	}

	const preview = (id: string, value: BotSettingsValue) => {
		const bot = held(id)
		if (!bot) {
			return
		}
		apply({ ...bot, ...toIdentity(value, bot) })
	}

	const refuseMembership = (reason: unknown) => {
		reportFailure({
			title: namesTheLastSpace(reason)
				? i18n.t("bots:spaces.remove.lastSpace")
				: i18n.t("bots:spaces.remove.failed"),
		})
	}

	const reload = () =>
		queryClient.invalidateQueries({ queryKey: conversationQueryKeys.rosters() })

	const rereadInFull = (spaceRowId: string) =>
		queryClient.invalidateQueries({
			queryKey: rosterQuery(spaceRowId).queryKey,
			exact: true,
		})

	const rereadHeadIn = async (spaceRowId: string) => {
		const { queryKey } = rosterQuery(spaceRowId)
		const head = await readRosterPageIn(hostSpaceIdOf(spaceRowId), null)
		await queryClient.cancelQueries({ queryKey, exact: true })
		queryClient.setQueryData(
			queryKey,
			(paged) => paged && withFreshHead(paged, head),
		)
	}

	const rereadRosterIn = (spaceRowId: string) =>
		rosterReadIn(spaceRowId) === undefined
			? rereadInFull(spaceRowId)
			: rereadHeadIn(spaceRowId).catch(() => rereadInFull(spaceRowId))

	const heldRowIdOf = ({ hostId, spaceId }: SpaceOnHost) =>
		heldSpaceRowIdsOf(chosen()).find(
			(spaceRowId) =>
				isRowOfHost(spaceRowId, hostId) &&
				hostSpaceIdOf(spaceRowId) === spaceId,
		)

	const holdPageRow = (origin: SpaceOnHost, row: ConversationInPage) => {
		const spaceRowId = heldRowIdOf(origin)
		if (spaceRowId === undefined) {
			return
		}
		queryClient.setQueryData(
			rosterQuery(spaceRowId).queryKey,
			(paged) => paged && withPageRow(paged, row),
		)
	}

	const holdSoloChatState = (
		conversationId: string,
		observed: ObservedState,
	) => {
		const line = current().soloThreads[conversationId]
		if (line === undefined) {
			return
		}
		queryClient.setQueryData(
			soloThreadQuery(line).queryKey,
			(chat) => chat && { ...chat, ...observed },
		)
	}

	const holdHostState = (
		origin: SpaceOnHost,
		changed: ConversationStateChange,
	) => {
		const spaceRowId = heldRowIdOf(origin)
		if (spaceRowId === undefined) {
			return
		}
		const observed = observedStateOf(changed)
		queryClient.setQueryData(
			rosterQuery(spaceRowId).queryKey,
			(paged) =>
				paged && withHostState(paged, changed.conversationId, observed),
		)
		holdSoloChatState(changed.conversationId, observed)
	}

	const pendingRereads = new Map<string, ReturnType<typeof setTimeout>>()

	const rereadSoon = (spaceRowId: string) => {
		clearTimeout(pendingRereads.get(spaceRowId))
		pendingRereads.set(
			spaceRowId,
			setTimeout(() => {
				void rereadInFull(spaceRowId)
			}, ROSTER_REREAD_DELAY_MS),
		)
	}

	const rereadSpaceSoon = (origin: SpaceOnHost) => {
		const spaceRowId = heldRowIdOf(origin)
		if (spaceRowId !== undefined) {
			rereadSoon(spaceRowId)
		}
	}

	const rereadSpacesOfBotSoon = (botId: string) => {
		const { spaceRowId } = chosen()
		const seatedIn = spacesOfBot(botId)
		const spaceRowIds =
			seatedIn.length === 0 && spaceRowId !== null ? [spaceRowId] : seatedIn
		spaceRowIds.forEach(rereadSoon)
	}

	const catchUpWithHost = (hostId: string) => {
		const spaceRowId = joinedRowIdOf(hostId)
		if (!heldSpaceRowIdsOf(chosen()).includes(spaceRowId)) {
			return
		}
		void rereadRosterIn(spaceRowId)
		void queryClient.invalidateQueries({
			queryKey: conversationQueryKeys.soloThreadsIn(spaceRowId),
			refetchType: "none",
		})
	}

	const rereadConversationRow = (conversationId: string) => {
		const spaceRowId = spaceOfConversation(conversationId)
		if (spaceRowId !== undefined) {
			void rereadRosterIn(spaceRowId)
		}
	}

	const reviseRostersHolding = (
		conversationId: string,
		revise: (conversations: Conversation[]) => Conversation[],
	) => {
		const { conversationRosters } = current()
		for (const [spaceRowId, conversations] of Object.entries(
			conversationRosters,
		)) {
			if (conversations.some(({ id }) => id === conversationId)) {
				holdConversations(spaceRowId, revise(conversations))
			}
		}
	}

	const reloadAndYield = async () => {
		await reload()
		return null
	}

	const emptySeatsIn = async (spaceRowId: string, botId: string) => {
		const seated = rosterIn(current().conversationRosters, spaceRowId)
		const emptied = await Promise.all(
			seated.map((conversation) =>
				seats(conversation, botId)
					? store.removeConversationParticipant(conversation.id, botId)
					: Promise.resolve(conversation),
			),
		)
		holdConversations(spaceRowId, emptied)
	}

	const catchUpOnLeftConversation = () => {
		const { spaceRowId, selectedConversationId: left } = current()
		if (spaceRowId !== null && left !== null) {
			void rereadRosterIn(spaceRowId)
		}
	}

	const writes = createWriteLoop<BotSettingsValue, Bot>({
		enqueue,
		write: (id, value) => {
			const bot = held(id)
			return bot
				? runMutation(queryClient, () =>
						store.updateBot(id, toIdentity(value, bot)),
					)
				: Promise.resolve(null)
		},
		apply: (_id, written) => apply(written),
		onRefused: () => {
			void reload()
		},
	})

	const refuseSeatMove = async (title: string) => {
		reportFailure({ title })
		return reloadAndYield()
	}

	const seatedBy = (
		move: (conversationId: string, botId: string) => Promise<Conversation>,
		conversationId: string,
		botId: string,
		refusal: string,
	) =>
		commit(async () => {
			const seated = await move(conversationId, botId)
			applyConversation(seated)
			return seated
		}).catch(() => refuseSeatMove(refusal))

	const seatMove =
		(move: (conversationId: string, botId: string) => Promise<Conversation>) =>
		(conversationId: string, botId: string) =>
			seatedBy(
				move,
				conversationId,
				botId,
				i18n.t("chat:conversationSeating.failed"),
			).then((seated) => seated !== null)

	const refusedRecruitment = (botId: string) => {
		const name = held(botId)?.name
		return name
			? i18n.t("chat:conversationSeating.refused", { name })
			: i18n.t("chat:conversationSeating.failed")
	}

	const conversationWrites = createWriteLoop<
		ConversationSettingsValue,
		Conversation
	>({
		enqueue,
		write: (id, value) => {
			const conversation = heldConversation(id)
			return conversation
				? runMutation(
						queryClient,
						() =>
							store.updateConversation(id, {
								title: value.name,
								instructions: value.instructions,
								sectionId: conversation.sectionId,
								icon: conversation.icon,
								color: conversation.color,
							}),
						CONVERSATION_WRITE_FAILURE,
					)
				: Promise.resolve(null)
		},
		apply: (_id, written) => applyConversation(written),
		onRefused: () => {
			void reload()
		},
	})

	const isReadyToOpen = (space: RosterSpace) =>
		isJoined(space) || rosterReadIn(space.spaceRowId) !== undefined

	const readRosterOf = ({ spaceRowId }: RosterSpace) =>
		queryClient.prefetchInfiniteQuery(rosterQuery(spaceRowId))

	const load = async ({ spaces, spaceRowId, lastRowId }: RosterOpening) => {
		spaces.forEach(learn)
		choose({ spaces, spaceRowId, lastRowId })
		const joinedReads = Promise.all(spaces.filter(isJoined).map(readRosterOf))
		await Promise.all(spaces.filter(isLocal).map(readRosterOf))
		if (spaces.every(isReadyToOpen)) {
			choose({ hasLoaded: true })
		}
		await joinedReads
	}

	const openBotSettings = ({ id, isShowingDanger }: BotSettingsOpening) =>
		choose({
			settingsBotId: id,
			isEditing: true,
			isShowingDanger,
			isEditingConversation: false,
		})

	return {
		getState: current,

		subscribe: subscribeWithQueries(
			choiceStore,
			queryClient,
			conversationQueryKeys.all,
		),

		rosterQuery,

		soloThreadQuery,

		load,

		retryLoad: () => load(chosen()),

		reload,

		holdPageRow,
		holdHostState,

		rereadSpaceSoon,

		rereadSpacesOfBotSoon,

		catchUpWithHost,

		forgetConversation: (conversationId: string) =>
			reviseRostersHolding(conversationId, (conversations) =>
				conversations.filter(({ id }) => id !== conversationId),
			),

		hostSpaceIdOf,

		spacesOfBot,

		spaceOfConversation,
		rereadConversationRow,

		enter: ({ lastRowId, ...space }: RosterEntry) => {
			learn(space)
			const { spaceRowId } = space
			const { rosters, conversationRosters } = current()
			const landing = landOn(
				rosterIn(rosters, spaceRowId),
				rosterIn(conversationRosters, spaceRowId),
				lastRowId,
			)
			choose({ spaceRowId, lastRowId, ...choiceOf(landing), ...NO_SETTINGS })
			if (rosterReadIn(spaceRowId) !== undefined) {
				void rereadRosterIn(spaceRowId)
			}
		},

		select: (id: string) => {
			if (id !== current().selectedBotId) {
				catchUpOnLeftConversation()
				choose({ chosenBotId: id, chosenConversationId: null })
			}
		},

		selectConversation: (id: string) => {
			if (id !== current().selectedConversationId) {
				catchUpOnLeftConversation()
				choose({ chosenBotId: null, chosenConversationId: id })
			}
		},

		create: () =>
			commit(async () => {
				const { bots, spaceRowId } = current()
				const written = await store.createBot(
					newBotIdentity(bots),
					hostSpaceIdIn(spaceRowId),
				)
				admit(written, current().spaceRowId)
			}).catch(reload),

		createFromDraft: (draft: BotDraft) =>
			commit(async () => {
				const spaceRowId = current().spaceRowId
				if (!spaceRowId) {
					throw NO_SPACE
				}
				const written = await store.createBotFromDraft(
					draft,
					hostSpaceIdOf(spaceRowId),
				)
				enrol(written, spaceRowId)
				return written
			}),

		createConversation: (botIds = NOBODY_SEATED) =>
			commit(async () => {
				const spaceRowId = current().spaceRowId
				if (spaceRowId === null) {
					return null
				}
				const created = await store.createConversation({
					spaceId: hostSpaceIdOf(spaceRowId),
					sectionId: null,
					title: NO_TITLE,
					botIds,
				})
				admitConversation(created, spaceRowId)
				return created
			}).catch(reloadAndYield),

		duplicate: (id: string, spaceRowId?: string) =>
			commit(async () => {
				const destination = spaceRowId ?? current().spaceRowId
				const written = await store.duplicateBot(id, hostSpaceIdIn(destination))
				admit(written, destination)
				return written
			}).catch(reloadAndYield),

		edit: (id: string) => openBotSettings({ id, isShowingDanger: false }),

		setEditing: (isEditing: boolean) =>
			choose({
				isEditing,
				isShowingDanger: isEditing && chosen().isShowingDanger,
			}),

		describe: (id: string, value: BotSettingsValue) => {
			preview(id, value)
			writes.push(id, value)
		},

		restyle: (id: string, outputStyle: BotOutputStyle) => {
			const bot = held(id)
			if (!bot) {
				return
			}
			const styled = { ...bot, outputStyle }
			apply(styled)
			writes.push(id, toSettingsValue(styled))
		},

		uploadAvatar: (id: string, file: File) =>
			commit(async () => {
				const bytes = new Uint8Array(await file.arrayBuffer())
				apply(await store.setBotAvatarImage(id, bytes))
			}).catch(reload),

		remember: (id: string, memory: string) =>
			commit(async () => {
				apply(await store.setBotMemory(id, memory))
			}).catch(reload),

		moveToSpace: (botId: string, spaceRowId: string) =>
			commit(async () => {
				const [home] = spacesOfBot(botId)
				const moved = home
					? rosterIn(current().rosters, home).find((bot) => bot.id === botId)
					: undefined
				if (!home || !moved || home === spaceRowId) {
					return null
				}
				await emptySeatsIn(home, botId)
				await store.moveBotToSpace(botId, hostSpaceIdOf(spaceRowId))
				holdBots(
					home,
					rosterIn(current().rosters, home).filter((bot) => bot.id !== botId),
				)
				admit({ ...moved, sectionId: null }, spaceRowId)
				return moved
			}).catch(reloadAndYield),

		addToSpace: (botId: string, spaceRowId: string) =>
			commit(async () => {
				const memberships = spacesOfBot(botId)
				const joined = rosterIn(current().rosters, memberships[0] ?? null).find(
					(bot) => bot.id === botId,
				)
				if (!joined || memberships.includes(spaceRowId)) {
					return
				}
				await store.addBotToSpace(botId, hostSpaceIdOf(spaceRowId))
				holdBots(spaceRowId, [
					...rosterIn(current().rosters, spaceRowId),
					{ ...joined, sectionId: null, pinPosition: null },
				])
			}).catch(reload),

		removeFromSpace: (botId: string, spaceRowId: string) =>
			commit(async () => {
				await store.removeBotFromSpace(botId, hostSpaceIdOf(spaceRowId))
				const state = current()
				const bots = rosterIn(state.rosters, spaceRowId).filter(
					(bot) => bot.id !== botId,
				)
				if (spaceRowId === state.spaceRowId) {
					choose(choiceOf(landOn(bots, state.conversations, null)))
				}
				holdBots(spaceRowId, bots)
			}).catch(refuseMembership),

		moveToSection: (botId: string, sectionId: string | null) => {
			const bot = held(botId)
			if (bot) {
				apply({ ...bot, sectionId, pinPosition: pinnedLast(sectionId) })
			}
		},

		pin: (pins: RosterPin[]) => {
			const placed = new Map(
				pins.map((pin, pinPosition) => [
					pin.id,
					{ sectionId: pin.sectionId, pinPosition },
				]),
			)
			const { spaceRowId, bots, conversations } = current()
			holdRoster(spaceRowId, () => ({
				bots: relocated(bots, placed),
				conversations: relocated(conversations, placed),
			}))
		},

		clearSection: (sectionId: string) => {
			const { spaceRowId, bots, conversations } = current()
			holdRoster(spaceRowId, () => ({
				bots: bots.map((bot) =>
					bot.sectionId === sectionId ? { ...bot, sectionId: null } : bot,
				),
				conversations: conversations.map((conversation) =>
					conversation.sectionId === sectionId
						? { ...conversation, sectionId: null }
						: conversation,
				),
			}))
		},

		askToDelete: (id: string) => openBotSettings({ id, isShowingDanger: true }),

		remove: (id: string) =>
			commit(async () => {
				await store.deleteBot(id)
				writes.drop(id)
				const state = current()
				const bots = state.bots.filter((bot) => bot.id !== id)
				const conversations = withSeatsOf(state.conversations, id, {
					isDeleted: true,
				})
				choose(choiceOf(landOn(bots, conversations, null)))
				holdRoster(state.spaceRowId, () => ({ bots, conversations }))
			}).catch(reload),

		moveConversationToSection: (
			conversationId: string,
			sectionId: string | null,
		) =>
			commit(async () => {
				const moved = heldConversation(conversationId)
				if (!moved) {
					return
				}
				applyConversation({
					...moved,
					sectionId,
					pinPosition: pinnedLast(sectionId),
				})
				await store.updateConversation(conversationId, {
					title: moved.title,
					instructions: moved.instructions,
					sectionId,
					icon: moved.icon,
					color: moved.color,
				})
			}).catch(reload),

		editConversation: (id: string) =>
			choose({
				settingsConversationId: id,
				isEditing: false,
				isShowingDanger: false,
				isEditingConversation: true,
			}),

		setConversationEditing: (isEditingConversation: boolean) =>
			choose({ isEditingConversation }),

		describeConversation: (id: string, value: ConversationSettingsValue) => {
			const conversation = heldConversation(id)
			if (!conversation) {
				return
			}
			applyConversation({
				...conversation,
				title: value.name,
				instructions: value.instructions,
			})
			conversationWrites.push(id, value)
		},

		styleConversation: (id: string, style: ConversationStyle) => {
			const conversation = heldConversation(id)
			if (!conversation) {
				return
			}
			applyConversation({ ...conversation, ...style })
			conversationWrites.push(id, toConversationSettingsValue(conversation))
		},

		nameConversation: (id: string, { title, icon }: ConversationNaming) => {
			const conversation = heldConversation(id)
			if (!conversation || !isNameless(conversation)) {
				return
			}
			applyConversation({
				...conversation,
				title,
				icon: conversation.icon ?? icon,
			})
			conversationWrites.push(id, {
				name: title,
				instructions: conversation.instructions,
			})
		},

		setConversationLead: seatMove(store.setConversationLead),

		recruitToConversation: (conversationId: string, botId: string) =>
			seatedBy(
				store.addConversationParticipant,
				conversationId,
				botId,
				refusedRecruitment(botId),
			),

		botsByPresence: (conversationId: string) => {
			const spaceRowId = current().spaceRowId
			return spaceRowId === null
				? Promise.resolve(NO_BOTS)
				: store.botsByPresence(hostSpaceIdOf(spaceRowId), conversationId)
		},

		dismissFromConversation: seatMove(store.removeConversationParticipant),

		removeConversation: (id: string) =>
			commit(async () => {
				await store.deleteConversation(id)
				conversationWrites.drop(id)
				const state = current()
				const conversations = state.conversations.filter(
					(conversation) => conversation.id !== id,
				)
				choose(choiceOf(landOn(state.bots, conversations, null)))
				holdConversations(state.spaceRowId, conversations)
			}).catch(reload),
	}
}
