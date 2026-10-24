import {
	BLANK_BOT_PERMISSIONS,
	BLOT_TINTS,
	DEFAULT_BOT_OUTPUT_STYLE,
} from "@workspace/ui/components/bot-settings"

import { createFakeTranscriptPort } from "./fake-transcript-port"
import type {
	AvatarBlot,
	Bot,
	BotChangedFile,
	BotDraft,
	BotHistoryEntry,
	BotIdentity,
	BotMcpServer,
	BotSkill,
	BotSkillDraft,
	BotSkillFront,
	Chat,
	ContextCheckpoint,
	Conversation,
	ConversationDraft,
	ConversationEdit,
	ConversationInPage,
	ConversationPage,
	EnvEntry,
	EnvScope,
	McpServerMark,
	MessagePin,
	MessageReference,
	NewAssistantMessage,
	NewTurn,
	NewUserMessage,
	Participant,
	ParticipantRole,
	PluginScope,
	RosterPin,
	RuntimeSession,
	Section,
	SectionError,
	Space,
	SpaceError,
	SpacePreferences,
	StoredLastWord,
	SuggestedBot,
	TranscriptStoreError,
} from "./store-contract"
import type { TranscriptStore } from "./store-port"
import {
	type TerminalCompletion,
	TRANSCRIPT_PAGE_SIZE,
	type TranscriptCompletion,
	type TranscriptCursor,
	type TranscriptDraft,
	type TranscriptMessage,
} from "./transcript-contract"

import type { AgentCommand } from "@/lib/agent/contract"
import { deniesChanges } from "../bots/bot-settings"
import { UNDONE_TITLE_PREFIX } from "../bots/history-runs"
import { messageUri } from "../links/message-uri"

export type FakeTranscriptStoreOptions = {
	messages?: TranscriptMessage[]
	pageSize?: number
}

const DEFAULT_BOT: Bot = {
	id: "default",
	name: "Claude",
	title: "",
	model: "sonnet",
	avatarBlot: null,
	avatarImagePath: null,
	instructions: "",
	deniedTools: [],
	permissions: BLANK_BOT_PERMISSIONS,
	outputStyle: DEFAULT_BOT_OUTPUT_STYLE,
	effort: null,
	changesNothing: false,
	memory: "",
	createdAt: 0,
	sectionId: null,
	pinPosition: null,
}

const DEFAULT_SPACE: Space = {
	id: "personal",
	name: "Personal",
	colour: "red",
	position: 0,
	createdAt: 0,
}

const chatIdOf = (botId: string, spaceId: string) => `chat-${botId}-${spaceId}`

export const FAKE_CHAT_ID = chatIdOf(DEFAULT_BOT.id, DEFAULT_SPACE.id)

const OPEN: TranscriptCompletion[] = ["pending", "streaming"]

const RECENT_TAIL = 20

const EXCERPT_LIMIT = 280

const excerptOf = (content: string) => {
	const letters = [...content]
	return letters.length <= EXCERPT_LIMIT
		? content
		: `${letters.slice(0, EXCERPT_LIMIT - 1).join("")}\u2026`
}

const SUMMARY_LABEL = "The conversation so far:"
const REPLY_LABEL = "The message this one replies to:"
const RECENT_LABEL = "The most recent messages:"
const PROMPT_LABEL = "The new message:"

const spoken = (message: TranscriptMessage) =>
	`${message.role}: ${message.content}`

type StoredConversation = Omit<Conversation, "participants">

type Seat = {
	botId: string
	role: ParticipantRole
	joinedAt: number
	leftAt: number | null
}

type RankedBot = {
	bot: Bot
	presence: number
}

const isPinned = (conversation: Conversation) =>
	conversation.pinPosition !== null

const byPin = (one: Conversation, other: Conversation) =>
	(one.pinPosition ?? 0) - (other.pinPosition ?? 0)

const latestFirst = (one: ConversationInPage, other: ConversationInPage) =>
	other.lastActivityAt - one.lastActivityAt

const conversationPageOf = (
	rows: ConversationInPage[],
	cursor: string | null,
	limit: number,
): ConversationPage => {
	const start = cursor === null ? 0 : Number(cursor)
	const end = start + limit
	const loose = rows.filter((row) => !isPinned(row)).sort(latestFirst)
	return {
		pinned: cursor === null ? rows.filter(isPinned).sort(byPin) : [],
		conversations: loose.slice(start, end),
		nextCursor: end < loose.length ? String(end) : null,
	}
}

const ascending = (one: string, other: string) =>
	one < other ? -1 : one > other ? 1 : 0

const byPresence = (one: RankedBot, other: RankedBot) =>
	other.presence - one.presence ||
	ascending(one.bot.name, other.bot.name) ||
	ascending(one.bot.id, other.bot.id)

const refuse = (error: TranscriptStoreError | SpaceError | SectionError) =>
	Promise.reject(error)

const SERVERS_PATH = ".mcp.json"

const USER_PLUGIN = "me"

const SPACE_PLUGIN_PREFIX = "space:"

const spacePlugin = (spaceId: string) => `${SPACE_PLUGIN_PREFIX}${spaceId}`

const pluginKey = (scope: PluginScope) => {
	if (scope.kind === "user") {
		return USER_PLUGIN
	}
	return scope.kind === "space" ? spacePlugin(scope.id) : scope.id
}

const isPluginOwner = (owner: string) =>
	owner === USER_PLUGIN || owner.startsWith(SPACE_PLUGIN_PREFIX)

const FAKE_AVATAR_DIR = "/fake/avatars"

const FAKE_AVATAR_LIMIT = 5 * 1024 * 1024

const IMAGE_SIGNATURES = [
	[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
	[0xff, 0xd8, 0xff],
] as const

const isStorableImage = (bytes: Uint8Array) =>
	IMAGE_SIGNATURES.some((signature) =>
		signature.every((byte, index) => bytes[index] === byte),
	) || isWebp(bytes)

const isWebp = (bytes: Uint8Array) => {
	const text = (from: number, to: number) =>
		String.fromCharCode(...bytes.slice(from, to))
	return (
		bytes.byteLength >= 12 && text(0, 4) === "RIFF" && text(8, 12) === "WEBP"
	)
}

const NO_FRONT: BotSkillFront = {
	whenToUse: null,
	argumentHint: null,
	arguments: null,
	disableModelInvocation: null,
	userInvocable: null,
	allowedTools: null,
	disallowedTools: null,
	model: null,
	effort: null,
	context: null,
	agent: null,
	background: null,
	hooks: null,
	paths: null,
	shell: null,
	metadata: null,
	license: null,
	compatibility: null,
}

const learnSkill = (): BotSkill => ({
	...NO_FRONT,
	id: "learn",
	name: "learn",
	description: "How you remember.",
	body: "Your own directory is the plugin root you were given.",
	isPreloaded: true,
	isSystem: true,
	files: [],
})

const scopeKey = (scope: EnvScope): string => {
	if (scope.kind === "user") {
		return scope.kind
	}
	return scope.kind === "server"
		? `server:${scope.name}:${scopeKey(scope.owner)}`
		: `${scope.kind}:${scope.id}`
}

const USER_SCOPE: EnvScope = { kind: "user" }

const scopeChain = (scope: EnvScope): EnvScope[] => {
	if (scope.kind === "user") {
		return [scope]
	}
	if (scope.kind === "space") {
		return [scope, USER_SCOPE]
	}
	if (scope.kind === "bot") {
		return [scope, { kind: "space", id: scope.spaceId }, USER_SCOPE]
	}
	return scope.kind === "server" ? [scope, ...scopeChain(scope.owner)] : [scope]
}

const SUGGESTED_BOTS: SuggestedBot[] = [
	{
		id: "writer",
		name: "Quill",
		job: "a writing partner",
		description:
			"Help me draft, tighten and polish what I write. Keep my voice, cut the filler, and say plainly when a sentence does not work.",
		blurb: "Drafts, edits and keeps your voice.",
	},
	{
		id: "researcher",
		name: "Scout",
		job: "a research assistant",
		description:
			"Dig into the questions I bring. Find sources, weigh them, give me the short answer first and the evidence after. Say so when you are unsure.",
		blurb: "Finds sources and sums them up.",
	},
	{
		id: "coder",
		name: "Byte",
		job: "a coding companion",
		description:
			"Pair with me on code. Read the project before changing it, keep changes small, and lay out the tradeoffs when there is more than one way.",
		blurb: "Reads, writes and reviews code.",
	},
	{
		id: "planner",
		name: "Compass",
		job: "a planning assistant",
		description:
			"Help me turn goals into plans. Break the work into next steps, keep track of what is still open, and nudge me when something slips.",
		blurb: "Turns goals into next steps.",
	},
]

const unworn = <T>(
	declared: readonly T[],
	worn: readonly (T | null)[],
	crowd: number,
) =>
	declared.find((variant) => !worn.includes(variant)) ??
	declared[crowd % declared.length]

export const createFakeTranscriptStore = (
	options: FakeTranscriptStoreOptions = {},
): TranscriptStore => {
	const pageSize = options.pageSize ?? TRANSCRIPT_PAGE_SIZE
	const bots = new Map<string, Bot>([[DEFAULT_BOT.id, DEFAULT_BOT]])
	const spaces = new Map<string, Space>([[DEFAULT_SPACE.id, DEFAULT_SPACE]])
	const archives = new Map<string, Space>()
	const departed = new Map<string, Bot>()
	const spacesOf = new Map<string, Set<string>>([
		[DEFAULT_BOT.id, new Set([DEFAULT_SPACE.id])],
	])
	const sections = new Map<string, Section>()
	const preferences = new Map<string, SpacePreferences>()
	const conversations = new Map<string, StoredConversation>()
	const seats = new Map<string, Seat[]>()
	let mintedConversations = 0
	let mintedSeats = 0
	let minted = 0
	let mintedSpaces = 0
	let mintedSections = 0
	const commands = new Map<string, AgentCommand[]>()
	const skills = new Map<string, BotSkill[]>([[DEFAULT_BOT.id, [learnSkill()]]])
	const skillFiles = new Map<string, Map<string, string>>()
	const history = new Map<string, BotHistoryEntry[]>()
	let committed = 0
	const servers = new Map<string, Map<string, Omit<BotMcpServer, "name">>>()
	const environment = new Map<string, Map<string, string>>()
	const rows = new Map<string, TranscriptMessage>()
	const pins = new Map<string, Map<number, number>>()
	const turns = new Map<string, NewTurn & { seq: number }>()
	const seqs = new Map<string, number>()
	const runs = new Map<string, number>()
	const runRows = new Map<
		string,
		{ participant: string; live: boolean; providerSessionId: string | null }
	>()
	const checkpoints = new Map<
		string,
		{ summary: string; lastMessageSeq: number }
	>()

	const answered = new Map<string, string>()

	const participantKey = (conversationId: string, botId: string) =>
		`${conversationId}/${botId}`

	const handOver = (participant: string, named: string, opened: string) => {
		const row = runRows.get(named)
		if (!row?.live || row.participant !== participant) {
			return
		}
		row.live = false
		const carried = checkpoints.get(named)
		if (!carried) {
			return
		}
		checkpoints.delete(named)
		checkpoints.set(opened, carried)
	}

	const liveSessionOf = (conversationId: string, botId: string | null) => {
		if (!botId) {
			return null
		}
		const participant = participantKey(conversationId, botId)
		for (const [id, row] of runRows) {
			if (row.participant === participant && row.live) {
				return id
			}
		}
		return null
	}

	const ordered = (conversationId: string) =>
		[...rows.values()]
			.filter((row) => row.conversationId === conversationId)
			.sort((left, right) => left.seq - right.seq)

	for (const seeded of [...(options.messages ?? [])].sort(
		(left, right) => left.seq - right.seq,
	)) {
		rows.set(seeded.id, seeded)
		seqs.set(seeded.conversationId, seeded.seq)
	}

	const nextSeq = (conversationId: string): number => {
		const seq = (seqs.get(conversationId) ?? 0) + 1
		seqs.set(conversationId, seq)
		return seq
	}

	const divergingField = (
		stored: TranscriptMessage,
		message: TranscriptDraft,
	): string | null => {
		if (stored.conversationId !== message.conversationId)
			return "conversation_id"
		if (stored.turnId !== message.turnId) return "turn_id"
		if (stored.role !== message.role) return "role"
		if (stored.createdAt !== message.createdAt) return "created_at"
		if (message.role === "user" && stored.content !== message.content)
			return "content"
		return null
	}

	const slugged = (name: string) =>
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "bot"

	const freeSkillId = (held: BotSkill[], name: string) => {
		const base = slugged(name)
		const taken = (id: string) => held.some((skill) => skill.id === id)
		if (!taken(base)) {
			return base
		}
		let next = 2
		while (taken(`${base}-${next}`)) {
			next += 1
		}
		return `${base}-${next}`
	}

	const isPlainObject = (value: unknown) =>
		typeof value === "object" && value !== null && !Array.isArray(value)

	const recorded = (botId: string, title: string, paths: string[]) => {
		committed += 1
		const entry: BotHistoryEntry = {
			id: `commit-${committed}`,
			timestamp: Math.floor(Date.now() / 1000),
			author: "user",
			title,
			body: "",
			paths,
		}
		history.set(botId, [entry, ...(history.get(botId) ?? [])])
	}

	const skillPath = (skillId: string) => `skills/${skillId}/SKILL.md`

	const historyOf = (botId: string) => [...(history.get(botId) ?? [])]

	const filesKey = (owner: string, skillId: string) => `${owner}/${skillId}`

	const heldFiles = (owner: string, skillId: string) =>
		skillFiles.get(filesKey(owner, skillId)) ?? new Map<string, string>()

	const withFiles = (owner: string, skill: BotSkill): BotSkill => ({
		...skill,
		files: [...heldFiles(owner, skill.id).keys()].sort(),
	})

	const readSkillFile = (owner: string, skillId: string, path: string) => {
		const text = heldFiles(owner, skillId).get(path)
		return text === undefined
			? refuse({ kind: "unwritableBundle", detail: "no such file" })
			: Promise.resolve(text)
	}

	const putSkillFile = (
		owner: string,
		skillId: string,
		path: string,
		text: string,
	) =>
		writeSkill(
			owner,
			skillId,
			(skill) => skill,
			`file "${path}" saved from settings`,
			[`skills/${skillId}/${path}`],
		).then((skill) => {
			skillFiles.set(
				filesKey(owner, skillId),
				heldFiles(owner, skillId).set(path, text),
			)
			return withFiles(owner, skill)
		})

	const dropSkillFile = (owner: string, skillId: string, path: string) => {
		if (!heldFiles(owner, skillId).has(path)) {
			return refuse({ kind: "unwritableBundle", detail: "no such file" })
		}
		return writeSkill(
			owner,
			skillId,
			(skill) => skill,
			`file "${path}" taken away`,
			[`skills/${skillId}/${path}`],
		).then(() => {
			heldFiles(owner, skillId).delete(path)
		})
	}

	const listSkills = (owner: string) =>
		Promise.resolve(
			[...(skills.get(owner) ?? [])]
				.sort((left, right) => left.id.localeCompare(right.id))
				.map((skill) => withFiles(owner, skill)),
		)

	const listServers = (owner: string): Promise<BotMcpServer[]> =>
		Promise.resolve(
			[...(servers.get(owner)?.entries() ?? [])]
				.map(([name, held]) => ({ name, ...held }))
				.sort((left, right) => left.name.localeCompare(right.name)),
		)

	const putServer = (
		owner: string,
		name: string,
		config: Record<string, unknown>,
		mark?: McpServerMark,
	) => {
		if (!isPlainObject(config)) {
			return refuse({
				kind: "unwritableBundle",
				detail: "a server configuration must be a JSON object",
			})
		}
		const declared = servers.get(owner) ?? new Map()
		const kept = mark ? { config, ...mark } : { ...declared.get(name), config }
		declared.set(name, kept)
		servers.set(owner, declared)
		recorded(owner, `Server "${name}" saved from settings`, [SERVERS_PATH])
		return Promise.resolve({ name, ...kept })
	}

	const dropServer = (owner: string, name: string) => {
		if (!servers.get(owner)?.delete(name)) {
			return refuse({ kind: "unwritableBundle", detail: "no such server" })
		}
		recorded(owner, `Server "${name}" taken away`, [SERVERS_PATH])
		return Promise.resolve()
	}

	const onKnownOwner = <T>(
		scope: PluginScope,
		run: (owner: string) => Promise<T>,
	): Promise<T> => {
		if (scope.kind === "bot" && !bots.has(scope.id)) {
			return refuse({ kind: "unknownBot", id: scope.id })
		}
		if (scope.kind === "space" && !spaces.has(scope.id)) {
			return refuse({ kind: "unknownSpace", id: scope.id })
		}
		return run(pluginKey(scope))
	}

	const addSkill = (owner: string, draft: BotSkillDraft) => {
		const held = skills.get(owner) ?? []
		const created: BotSkill = {
			...NO_FRONT,
			...draft,
			id: freeSkillId(held, draft.name),
			isPreloaded: false,
			isSystem: false,
			files: [],
		}
		skills.set(owner, [...held, created])
		recorded(owner, `Skill "${created.name}" saved from settings`, [
			skillPath(created.id),
		])
		return Promise.resolve(created)
	}

	const dropSkill = (owner: string, skillId: string) =>
		writeSkill(owner, skillId, (skill) => skill, "taken away").then(() => {
			skills.set(
				owner,
				(skills.get(owner) ?? []).filter((skill) => skill.id !== skillId),
			)
		})

	const undo = (
		owner: string,
		oldestCommitId: string,
		newestCommitId: string,
	) => {
		const run = runOf(owner, oldestCommitId, newestCommitId)
		if (!run) {
			return refuse({ kind: "unwritableBundle", detail: "no such commit" })
		}
		recorded(owner, `${UNDONE_TITLE_PREFIX}${run[0].title}`, touchedPaths(run))
		return Promise.resolve(historyOf(owner))
	}

	const runOf = (
		owner: string,
		oldestCommitId: string,
		newestCommitId: string,
	) => {
		const entries = history.get(owner) ?? []
		const newest = entries.findIndex((entry) => entry.id === newestCommitId)
		const oldest = entries.findIndex((entry) => entry.id === oldestCommitId)
		if (newest < 0 || oldest < newest) {
			return null
		}
		return entries.slice(newest, oldest + 1)
	}

	const touchedPaths = (run: BotHistoryEntry[]) =>
		[...new Set(run.flatMap((entry) => entry.paths))].sort()

	const changedFiles = (
		owner: string,
		oldestCommitId: string,
		newestCommitId: string,
	): Promise<BotChangedFile[]> => {
		const run = runOf(owner, oldestCommitId, newestCommitId)
		if (!run) {
			return refuse({ kind: "unwritableBundle", detail: "no such commit" })
		}
		return Promise.resolve(
			touchedPaths(run).map((path) => ({
				path,
				previousPath: null,
				change: "modified" as const,
				patch: `@@ ${path} @@`,
			})),
		)
	}

	const writeSkill = (
		botId: string,
		skillId: string,
		change: (skill: BotSkill) => BotSkill,
		verb = "saved from settings",
		touched = [skillPath(skillId)],
	): Promise<BotSkill> => {
		if (!isPluginOwner(botId) && !bots.has(botId)) {
			return refuse({ kind: "unknownBot", id: botId })
		}
		const held = skills.get(botId) ?? []
		const stored = held.find((skill) => skill.id === skillId)
		if (!stored) {
			return refuse({ kind: "unwritableBundle", detail: "no such skill" })
		}
		if (stored.isSystem) {
			return refuse({ kind: "systemSkill", id: skillId })
		}
		const written = change(stored)
		skills.set(
			botId,
			held.map((skill) => (skill.id === skillId ? written : skill)),
		)
		recorded(botId, `Skill "${written.name}" ${verb}`, touched)
		return Promise.resolve(withFiles(botId, written))
	}

	const remember = (id: string, target: string | null) => {
		if (target) {
			answered.set(id, target)
		}
	}

	const mint = (fields: Omit<Bot, "id" | "createdAt">, spaceId: string) => {
		if (!spaces.has(spaceId)) {
			return refuse({ kind: "unknownSpace", id: spaceId })
		}
		minted += 1
		const bot: Bot = { ...fields, id: `bot-${minted}`, createdAt: minted }
		bots.set(bot.id, bot)
		spacesOf.set(bot.id, new Set([spaceId]))
		skills.set(bot.id, [learnSkill()])
		return Promise.resolve(bot)
	}

	const firstSpace = () => [...spaces.keys()][0]

	const spacesFor = (botId: string) => spacesOf.get(botId) ?? new Set<string>()

	const isIn = (botId: string, spaceId: string) => spacesFor(botId).has(spaceId)

	const homeOf = (botId: string) => [...spacesFor(botId)][0] ?? firstSpace()

	const participantsOf = (conversationId: string): Participant[] =>
		(seats.get(conversationId) ?? []).flatMap((seat) => {
			const bot = bots.get(seat.botId) ?? departed.get(seat.botId)
			return bot
				? [
						{
							botId: bot.id,
							role: seat.role,
							joinedAt: seat.joinedAt,
							leftAt: seat.leftAt,
							name: bot.name,
							avatarBlot: bot.avatarBlot,
							avatarImagePath: bot.avatarImagePath,
							isDeleted: !bots.has(seat.botId),
						},
					]
				: []
		})

	const isSeated = (seat: Seat) => seat.leftAt === null

	const crowned = (held: Seat[]): Seat[] => {
		if (held.some((seat) => isSeated(seat) && seat.role === "lead")) {
			return held
		}
		const heir = held.find(isSeated)
		return heir
			? held.map((seat) => (seat === heir ? { ...seat, role: "lead" } : seat))
			: held
	}

	const forgetSpace = (spaceId: string) => {
		for (const [botId, held] of spacesOf) {
			held.delete(spaceId)
			if (held.size === 0) {
				bots.delete(botId)
				spacesOf.delete(botId)
			}
		}
		for (const [sectionId, section] of sections) {
			if (section.spaceId === spaceId) {
				sections.delete(sectionId)
			}
		}
		preferences.delete(spaceId)
		for (const [conversationId, stored] of conversations) {
			if (stored.spaceId === spaceId) {
				conversations.delete(conversationId)
				seats.delete(conversationId)
			}
		}
	}

	const drawnConversation = (stored: StoredConversation): Conversation => ({
		...stored,
		participants: participantsOf(stored.id),
	})

	const nextPin = (spaceId: string) =>
		Math.max(
			-1,
			...sectionsOf(spaceId).map((section) => section.position),
			...[...bots.values()]
				.filter((bot) => isIn(bot.id, spaceId))
				.map((bot) => bot.pinPosition ?? -1),
			...[...conversations.values()]
				.filter((stored) => stored.spaceId === spaceId)
				.map((stored) => stored.pinPosition ?? -1),
		) + 1

	const sectionsOf = (spaceId: string) =>
		[...sections.values()]
			.filter((section) => section.spaceId === spaceId)
			.sort((one, other) => one.position - other.position)

	const unsharedName = (wanted: string, spaceId: string) => {
		const carried = new Set(
			[...bots.values()]
				.filter((bot) => isIn(bot.id, spaceId))
				.map((bot) => bot.name),
		)
		if (!carried.has(wanted)) {
			return wanted
		}
		let number = 2
		while (carried.has(`${wanted} ${number}`)) {
			number += 1
		}
		return `${wanted} ${number}`
	}

	const writePin = (
		conversationId: string,
		messageId: string,
		blockIndex: number,
		pinnedAt: number | null,
	) => {
		const stored = rows.get(messageId)
		if (!stored || stored.conversationId !== conversationId) {
			return refuse({
				kind: "storage",
				failure: { kind: "sqlite", detail: "no such message" },
			})
		}
		const held = pins.get(messageId) ?? new Map<number, number>()
		pins.set(messageId, held)
		if (pinnedAt === null) {
			held.delete(blockIndex)
		} else {
			held.set(blockIndex, pinnedAt)
		}
		return Promise.resolve()
	}

	const append = (message: TranscriptDraft): Promise<number> => {
		const stored = rows.get(message.id)
		if (stored) {
			const field = divergingField(stored, message)
			return field
				? refuse({ kind: "conflict", id: message.id, field })
				: Promise.resolve(stored.seq)
		}
		const seq = nextSeq(message.conversationId)
		rows.set(message.id, { ...message, seq })
		return Promise.resolve(seq)
	}

	const lastWordOf = (conversationId: string): StoredLastWord | null => {
		const settled = [...rows.values()]
			.filter(
				(row) =>
					row.conversationId === conversationId &&
					!OPEN.includes(row.completion),
			)
			.sort((one, other) => one.seq - other.seq)
			.at(-1)
		return settled
			? {
					text: settled.content,
					at: settled.createdAt,
					authorBotId: settled.authorBotId,
					authorAccountId: settled.authorAccountId,
					authorName: settled.authorName,
					writtenFrom: settled.writtenFrom,
				}
			: null
	}

	const topicInPage = (conversation: Conversation): ConversationInPage => ({
		...conversation,
		lastActivityAt: conversation.updatedAt,
		lastWord: lastWordOf(conversation.id),
		soloBotId: null,
		activeTurn: null,
		state: "idle",
	})

	const soloChatInPage = (bot: Bot, spaceId: string): ConversationInPage => {
		const id = chatIdOf(bot.id, spaceId)
		const lastWord = lastWordOf(id)
		return {
			id,
			spaceId,
			sectionId: bot.sectionId,
			pinPosition: bot.pinPosition,
			title: "",
			instructions: "",
			icon: null,
			color: null,
			createdAt: 0,
			updatedAt: 0,
			participants: [],
			lastActivityAt: lastWord?.at ?? 0,
			lastWord,
			soloBotId: bot.id,
			activeTurn: null,
			state: "idle",
		}
	}

	const transcriptPort = () =>
		createFakeTranscriptPort({ messages: [...rows.values()], pageSize })

	const startTurn = (turn: NewTurn) => {
		const stored = turns.get(turn.id)
		if (stored) {
			return stored.startedAt === turn.startedAt &&
				stored.conversationId === turn.conversationId
				? Promise.resolve(stored.seq)
				: refuse({ kind: "conflict", id: turn.id, field: "started_at" })
		}
		const seq = turns.size + 1
		turns.set(turn.id, { ...turn, seq })
		return Promise.resolve(seq)
	}

	const appendUserMessage = (message: NewUserMessage) => {
		remember(message.id, message.repliedToMessageId)
		return append({
			...message,
			role: "user",
			completion: "complete",
			authorAccountId: null,
			authorName: null,
			runtimeSessionId: liveSessionOf(
				message.conversationId,
				message.authorBotId,
			),
		})
	}

	return {
		loadPage: (conversationId: string, cursor: TranscriptCursor | null) =>
			transcriptPort().loadPage(conversationId, cursor),

		loadWindow: (conversationId: string, seq: number) =>
			transcriptPort().loadWindow(conversationId, seq),

		spaces: () =>
			Promise.resolve(
				[...spaces.values()].sort(
					(one, other) => one.position - other.position,
				),
			),

		createSpace: (name: string) => {
			mintedSpaces += 1
			const space: Space = {
				id: `space-${mintedSpaces}`,
				name,
				colour: null,
				position: mintedSpaces,
				createdAt: mintedSpaces,
			}
			spaces.set(space.id, space)
			return Promise.resolve(space)
		},

		updateSpace: (id: string, name: string, colour?: AvatarBlot) => {
			const stored = spaces.get(id)
			if (!stored) {
				return refuse({ kind: "unknownSpace", id })
			}
			const written: Space = { ...stored, name, colour: colour ?? null }
			spaces.set(id, written)
			return Promise.resolve(written)
		},

		reorderSpaces: (ids: string[]) => {
			const missing = ids.find((id) => !spaces.has(id))
			if (missing) {
				return refuse({ kind: "unknownSpace", id: missing })
			}
			ids.forEach((id, position) => {
				const stored = spaces.get(id)
				if (stored) {
					spaces.set(id, { ...stored, position })
				}
			})
			return Promise.resolve()
		},

		deleteSpace: (id: string) => {
			if (!spaces.has(id)) {
				return refuse({ kind: "unknownSpace", id })
			}
			if (spaces.size <= 1) {
				return refuse({ kind: "lastSpace" })
			}
			spaces.delete(id)
			forgetSpace(id)
			return Promise.resolve()
		},

		exportSpace: (id: string, path: string) => {
			const stored = spaces.get(id)
			if (!stored) {
				return refuse({ kind: "unknownSpace", id })
			}
			archives.set(path, stored)
			return Promise.resolve()
		},

		importSpace: (path: string) => {
			const archived = archives.get(path)
			if (!archived) {
				return refuse({ kind: "unreadableArchive", detail: path })
			}
			mintedSpaces += 1
			const space: Space = {
				...archived,
				id: `space-${mintedSpaces}`,
				position: mintedSpaces,
				createdAt: mintedSpaces,
			}
			spaces.set(space.id, space)
			return Promise.resolve(space)
		},

		spacePreferences: (spaceId: string) => {
			if (!spaces.has(spaceId)) {
				return refuse({ kind: "unknownSpace", id: spaceId })
			}
			return Promise.resolve(
				preferences.get(spaceId) ?? { collapsedSectionIds: [] },
			)
		},

		setSpacePreferences: (spaceId: string, wanted: SpacePreferences) => {
			if (!spaces.has(spaceId)) {
				return refuse({ kind: "unknownSpace", id: spaceId })
			}
			const stored: SpacePreferences = {
				collapsedSectionIds: (wanted.collapsedSectionIds ?? []).filter(
					(id) => sections.get(id)?.spaceId === spaceId,
				),
			}
			preferences.set(spaceId, stored)
			return Promise.resolve(stored)
		},

		sections: (spaceId: string) => Promise.resolve(sectionsOf(spaceId)),

		createSection: (spaceId: string, name: string) => {
			if (!spaces.has(spaceId)) {
				return refuse({ kind: "unknownSpace", id: spaceId })
			}
			mintedSections += 1
			const section: Section = {
				id: `section-${mintedSections}`,
				spaceId,
				name,
				position: sectionsOf(spaceId).length,
				createdAt: mintedSections,
			}
			sections.set(section.id, section)
			return Promise.resolve(section)
		},

		renameSection: (id: string, name: string) => {
			const stored = sections.get(id)
			if (!stored) {
				return refuse({ kind: "unknownSection", id })
			}
			const written: Section = { ...stored, name }
			sections.set(id, written)
			return Promise.resolve(written)
		},

		pinRoster: (spaceId: string, pins: RosterPin[]) => {
			const stranger = pins.find(
				({ id }) =>
					sections.get(id)?.spaceId !== spaceId &&
					!isIn(id, spaceId) &&
					conversations.get(id)?.spaceId !== spaceId,
			)
			if (stranger) {
				return refuse({ kind: "unknownSection", id: stranger.id })
			}
			for (const [id, bot] of bots) {
				if (isIn(id, spaceId)) {
					bots.set(id, { ...bot, sectionId: null, pinPosition: null })
				}
			}
			for (const [id, stored] of conversations) {
				if (stored.spaceId === spaceId) {
					conversations.set(id, {
						...stored,
						sectionId: null,
						pinPosition: null,
					})
				}
			}
			pins.forEach(({ id, sectionId }, position) => {
				const section = sections.get(id)
				if (section) {
					sections.set(id, { ...section, position })
					return
				}
				const bot = bots.get(id)
				if (bot) {
					bots.set(id, { ...bot, sectionId, pinPosition: position })
					return
				}
				const stored = conversations.get(id)
				if (stored) {
					conversations.set(id, { ...stored, sectionId, pinPosition: position })
				}
			})
			return Promise.resolve()
		},

		deleteSection: (id: string) => {
			if (!sections.delete(id)) {
				return refuse({ kind: "unknownSection", id })
			}
			for (const [botId, bot] of bots) {
				if (bot.sectionId === id) {
					bots.set(botId, { ...bot, sectionId: null })
				}
			}
			for (const [conversationId, stored] of conversations) {
				if (stored.sectionId === id) {
					conversations.set(conversationId, { ...stored, sectionId: null })
				}
			}
			return Promise.resolve()
		},

		moveBotToSection: (botId: string, sectionId: string | null) => {
			const bot = bots.get(botId)
			if (!bot) {
				return refuse({ kind: "unknownBot", id: botId })
			}
			if (sectionId === null) {
				bots.set(botId, { ...bot, sectionId, pinPosition: null })
				return Promise.resolve()
			}
			const section = sections.get(sectionId)
			if (!section) {
				return refuse({ kind: "unknownSection", id: sectionId })
			}
			if (!isIn(botId, section.spaceId)) {
				return refuse({ kind: "foreignSection", id: sectionId })
			}
			bots.set(botId, {
				...bot,
				sectionId,
				pinPosition: nextPin(section.spaceId),
			})
			return Promise.resolve()
		},

		moveBotToSpace: (botId: string, spaceId: string) => {
			const bot = bots.get(botId)
			if (!bot) {
				return refuse({ kind: "unknownBot", id: botId })
			}
			if (!spaces.has(spaceId)) {
				return refuse({ kind: "unknownSpace", id: spaceId })
			}
			const held = spacesFor(botId)
			if (held.size !== 1 || !held.has(spaceId)) {
				bots.set(botId, { ...bot, sectionId: null })
				spacesOf.set(botId, new Set([spaceId]))
			}
			return Promise.resolve()
		},

		addBotToSpace: (
			botId: string,
			spaceId: string,
			sectionId?: string | null,
		) => {
			const bot = bots.get(botId)
			if (!bot) {
				return refuse({ kind: "unknownBot", id: botId })
			}
			if (!spaces.has(spaceId)) {
				return refuse({ kind: "unknownSpace", id: spaceId })
			}
			spacesOf.set(botId, new Set([...spacesFor(botId), spaceId]))
			if (sectionId !== undefined) {
				bots.set(botId, {
					...bot,
					sectionId,
					pinPosition: sectionId === null ? null : nextPin(spaceId),
				})
			}
			return Promise.resolve()
		},

		removeBotFromSpace: (botId: string, spaceId: string) => {
			if (!bots.has(botId)) {
				return refuse({ kind: "unknownBot", id: botId })
			}
			const held = spacesFor(botId)
			if (!held.has(spaceId)) {
				return refuse({ kind: "unknownSpace", id: spaceId })
			}
			if (held.size === 1) {
				return refuse({ kind: "lastSpaceOfBot", id: botId })
			}
			spacesOf.set(botId, new Set([...held].filter((id) => id !== spaceId)))
			return Promise.resolve()
		},

		bots: (spaceId?: string | null) =>
			Promise.resolve(
				[...bots.values()].filter((bot) => !spaceId || isIn(bot.id, spaceId)),
			),

		botsByPresence: (
			spaceId: string,
			excludedConversationId?: string | null,
		) => {
			const presenceOf = (botId: string) =>
				[...conversations.values()].filter(
					(stored) =>
						stored.spaceId === spaceId &&
						stored.id !== excludedConversationId &&
						(seats.get(stored.id) ?? []).some(
							(seat) => seat.botId === botId && isSeated(seat),
						),
				).length
			return Promise.resolve(
				[...bots.values()]
					.filter((bot) => isIn(bot.id, spaceId))
					.map((bot) => ({ bot, presence: presenceOf(bot.id) }))
					.sort(byPresence)
					.map(({ bot }) => bot),
			)
		},

		createBot: (identity: BotIdentity, spaceId?: string | null) =>
			mint(
				{
					...identity,
					permissions: identity.permissions ?? BLANK_BOT_PERMISSIONS,
					outputStyle: identity.outputStyle ?? DEFAULT_BOT_OUTPUT_STYLE,
					effort: identity.effort ?? null,
					changesNothing: deniesChanges(identity.deniedTools),
					memory: "",
					sectionId: null,
					pinPosition: null,
				},
				spaceId ?? firstSpace(),
			),

		createBotFromDraft: (draft: BotDraft, spaceId: string) => {
			const name = draft.name.trim()
			if (!name) {
				return refuse({ kind: "namelessBot" })
			}
			const worn = [...bots.values()].filter((bot) => isIn(bot.id, spaceId))
			return mint(
				{
					name,
					title: draft.job.trim(),
					model: "sonnet",
					avatarBlot: unworn<AvatarBlot>(
						BLOT_TINTS,
						worn.map((bot) => bot.avatarBlot),
						worn.length,
					),
					avatarImagePath: null,
					instructions: draft.description.trim(),
					deniedTools: [],
					permissions: BLANK_BOT_PERMISSIONS,
					outputStyle: DEFAULT_BOT_OUTPUT_STYLE,
					effort: null,
					changesNothing: false,
					memory: "",
					sectionId: null,
					pinPosition: null,
				},
				spaceId,
			)
		},

		suggestedBots: () => Promise.resolve(SUGGESTED_BOTS),

		duplicateBot: (botId: string, spaceId?: string | null) => {
			const source = bots.get(botId)
			if (!source) {
				return refuse({ kind: "unknownBot", id: botId })
			}
			const destination = spaceId ?? homeOf(botId)
			return mint(
				{
					...source,
					name: unsharedName(`${source.name} copy`, destination),
					sectionId: isIn(botId, destination) ? source.sectionId : null,
					pinPosition: null,
				},
				destination,
			)
		},

		updateBot: (id: string, identity: BotIdentity) => {
			const stored = bots.get(id)
			if (!stored) {
				return refuse({ kind: "unknownBot", id })
			}
			const updated: Bot = {
				...stored,
				...identity,
				changesNothing: deniesChanges(identity.deniedTools),
			}
			bots.set(id, updated)
			return Promise.resolve(updated)
		},

		deleteBot: (id: string) => {
			const bot = bots.get(id)
			if (!bot) {
				return refuse({ kind: "unknownBot", id })
			}
			const held = [...spacesFor(id)]
			bots.delete(id)
			departed.set(id, bot)
			spacesOf.delete(id)
			commands.delete(id)
			skills.delete(id)
			servers.delete(id)
			const soloThreadIds = new Set(
				held.map((spaceId) => chatIdOf(id, spaceId)),
			)
			for (const [rowId, row] of rows) {
				if (soloThreadIds.has(row.conversationId)) {
					rows.delete(rowId)
					pins.delete(rowId)
				}
			}
			for (const conversationId of soloThreadIds) {
				seqs.delete(conversationId)
			}
			return Promise.resolve()
		},

		setBotAvatarImage: (id: string, bytes: Uint8Array) => {
			const stored = bots.get(id)
			if (!stored) {
				return refuse({ kind: "unknownBot", id })
			}
			if (bytes.byteLength > FAKE_AVATAR_LIMIT) {
				return refuse({
					kind: "rejectedAvatarImage",
					reason: {
						kind: "tooLarge",
						bytes: bytes.byteLength,
						limit: FAKE_AVATAR_LIMIT,
					},
				})
			}
			if (!isStorableImage(bytes)) {
				return refuse({
					kind: "rejectedAvatarImage",
					reason: { kind: "unknownFormat" },
				})
			}
			minted += 1
			const worn: Bot = {
				...stored,
				avatarImagePath: `${FAKE_AVATAR_DIR}/avatar-${minted}.png`,
			}
			bots.set(id, worn)
			return Promise.resolve(worn)
		},

		setBotMemory: (id: string, memory: string) => {
			const stored = bots.get(id)
			if (!stored) {
				return refuse({ kind: "unknownBot", id })
			}
			const learned: Bot = { ...stored, memory: memory.trim() }
			bots.set(id, learned)
			return Promise.resolve(learned)
		},

		pluginSkills: (scope: PluginScope) => listSkills(pluginKey(scope)),

		createPluginSkill: (scope: PluginScope, draft: BotSkillDraft) =>
			onKnownOwner(scope, (owner) => addSkill(owner, draft)),

		updatePluginSkill: (
			scope: PluginScope,
			skillId: string,
			draft: BotSkillDraft,
		) =>
			writeSkill(pluginKey(scope), skillId, (skill) => ({
				...skill,
				...draft,
			})),

		setPluginSkillPreloaded: (
			scope: PluginScope,
			skillId: string,
			isPreloaded: boolean,
		) =>
			writeSkill(pluginKey(scope), skillId, (skill) => ({
				...skill,
				isPreloaded,
			})),

		deletePluginSkill: (scope: PluginScope, skillId: string) =>
			dropSkill(pluginKey(scope), skillId),

		pluginSkillFile: (scope: PluginScope, skillId: string, path: string) =>
			readSkillFile(pluginKey(scope), skillId, path),

		writePluginSkillFile: (
			scope: PluginScope,
			skillId: string,
			path: string,
			text: string,
		) => putSkillFile(pluginKey(scope), skillId, path, text),

		deletePluginSkillFile: (
			scope: PluginScope,
			skillId: string,
			path: string,
		) => dropSkillFile(pluginKey(scope), skillId, path),

		pluginMcpServers: (scope: PluginScope) => listServers(pluginKey(scope)),

		setPluginMcpServer: (
			scope: PluginScope,
			name: string,
			config: Record<string, unknown>,
			mark?: McpServerMark,
		) => onKnownOwner(scope, (owner) => putServer(owner, name, config, mark)),

		deletePluginMcpServer: (scope: PluginScope, name: string) =>
			onKnownOwner(scope, (owner) => dropServer(owner, name)),

		pluginHistory: (scope: PluginScope) =>
			Promise.resolve(historyOf(pluginKey(scope))),

		pluginHistoryDiff: (
			scope: PluginScope,
			oldestCommitId: string,
			newestCommitId: string,
		) => changedFiles(pluginKey(scope), oldestCommitId, newestCommitId),

		revertPlugin: (
			scope: PluginScope,
			oldestCommitId: string,
			newestCommitId: string,
		) => undo(pluginKey(scope), oldestCommitId, newestCommitId),

		environmentVariables: (scope: EnvScope) => {
			const entries: EnvEntry[] = []
			for (const step of scopeChain(scope)) {
				for (const name of environment.get(scopeKey(step))?.keys() ?? []) {
					const servedFrom =
						entries.find((entry) => entry.name === name)?.servedFrom ?? step
					entries.push({ name, definedIn: step, servedFrom })
				}
			}
			return Promise.resolve(
				entries.sort((left, right) => left.name.localeCompare(right.name)),
			)
		},

		setEnvironmentVariable: (scope: EnvScope, name: string, value: string) => {
			const held = environment.get(scopeKey(scope)) ?? new Map<string, string>()
			held.set(name, value)
			environment.set(scopeKey(scope), held)
			return Promise.resolve()
		},

		deleteEnvironmentVariable: (scope: EnvScope, name: string) => {
			environment.get(scopeKey(scope))?.delete(name)
			return Promise.resolve()
		},

		recordBotCommands: (botId: string, listed: AgentCommand[]) => {
			if (!bots.has(botId)) {
				return refuse({ kind: "unknownBot", id: botId })
			}
			commands.set(botId, [...listed])
			return Promise.resolve()
		},

		botCommands: (botId: string) =>
			Promise.resolve([...(commands.get(botId) ?? [])]),

		mainChat: (botId: string, spaceId?: string | null) => {
			if (spaceId != null && !isIn(botId, spaceId)) {
				return refuse({ kind: "foreignBot", id: botId })
			}
			return Promise.resolve<Chat>({
				id: chatIdOf(botId, spaceId ?? homeOf(botId)),
				createdAt: 0,
				updatedAt: 0,
			})
		},

		conversations: (spaceId: string) =>
			Promise.resolve(
				[...conversations.values()]
					.filter((stored) => stored.spaceId === spaceId)
					.map(drawnConversation),
			),

		conversationPage: (spaceId: string, cursor: string | null, limit: number) =>
			Promise.resolve(
				conversationPageOf(
					[
						...[...bots.values()]
							.filter((bot) => isIn(bot.id, spaceId))
							.map((bot) => soloChatInPage(bot, spaceId)),
						...[...conversations.values()]
							.filter((stored) => stored.spaceId === spaceId)
							.map(drawnConversation)
							.map(topicInPage),
					],
					cursor,
					limit,
				),
			),

		createConversation: (draft: ConversationDraft) => {
			if (!spaces.has(draft.spaceId)) {
				return refuse({ kind: "unknownSpace", id: draft.spaceId })
			}
			const stranger = draft.botIds.find((botId) => !isIn(botId, draft.spaceId))
			if (stranger) {
				return refuse({ kind: "unknownBot", id: stranger })
			}
			mintedConversations += 1
			const stored: StoredConversation = {
				id: `conversation-${mintedConversations}`,
				spaceId: draft.spaceId,
				sectionId: draft.sectionId,
				pinPosition: draft.sectionId === null ? null : nextPin(draft.spaceId),
				title: draft.title,
				instructions: "",
				icon: null,
				color: null,
				createdAt: mintedConversations,
				updatedAt: mintedConversations,
			}
			conversations.set(stored.id, stored)
			seats.set(
				stored.id,
				draft.botIds.map((botId, rank) => ({
					botId,
					role: rank === 0 ? "lead" : "assistant",
					joinedAt: mintedConversations,
					leftAt: null,
				})),
			)
			return Promise.resolve(drawnConversation(stored))
		},

		updateConversation: (conversationId: string, edit: ConversationEdit) => {
			const stored = conversations.get(conversationId)
			if (!stored) {
				return refuse({ kind: "unknownConversation", id: conversationId })
			}
			if (edit.sectionId !== null) {
				const section = sections.get(edit.sectionId)
				if (!section) {
					return refuse({ kind: "unknownSection", id: edit.sectionId })
				}
				if (section.spaceId !== stored.spaceId) {
					return refuse({ kind: "foreignSection", id: edit.sectionId })
				}
			}
			const written: StoredConversation = {
				...stored,
				...edit,
				pinPosition:
					edit.sectionId === null || !stored.spaceId
						? null
						: nextPin(stored.spaceId),
			}
			conversations.set(conversationId, written)
			return Promise.resolve(drawnConversation(written))
		},

		deleteConversation: (conversationId: string) => {
			if (!conversations.delete(conversationId)) {
				return refuse({ kind: "unknownConversation", id: conversationId })
			}
			seats.delete(conversationId)
			return Promise.resolve()
		},

		addConversationParticipant: (conversationId: string, botId: string) => {
			const stored = conversations.get(conversationId)
			if (!stored) {
				return refuse({ kind: "unknownConversation", id: conversationId })
			}
			if (!stored.spaceId || !isIn(botId, stored.spaceId)) {
				return refuse({ kind: "unknownBot", id: botId })
			}
			const held = seats.get(conversationId) ?? []
			mintedSeats += 1
			const taken: Seat = {
				botId,
				role: held.some((seat) => isSeated(seat) && seat.role === "lead")
					? "assistant"
					: "lead",
				joinedAt: mintedSeats,
				leftAt: null,
			}
			seats.set(conversationId, [
				...held.filter((seat) => seat.botId !== botId),
				taken,
			])
			return Promise.resolve(drawnConversation(stored))
		},

		removeConversationParticipant: (conversationId: string, botId: string) => {
			const stored = conversations.get(conversationId)
			if (!stored) {
				return refuse({ kind: "unknownConversation", id: conversationId })
			}
			const held = seats.get(conversationId) ?? []
			if (!held.some((seat) => seat.botId === botId && isSeated(seat))) {
				return refuse({ kind: "unknownBot", id: botId })
			}
			mintedSeats += 1
			seats.set(
				conversationId,
				crowned(
					held.map((seat) =>
						seat.botId === botId
							? { ...seat, role: "assistant", leftAt: mintedSeats }
							: seat,
					),
				),
			)
			return Promise.resolve(drawnConversation(stored))
		},

		setConversationLead: (conversationId: string, botId: string) => {
			const stored = conversations.get(conversationId)
			if (!stored) {
				return refuse({ kind: "unknownConversation", id: conversationId })
			}
			const held = seats.get(conversationId) ?? []
			if (!held.some((seat) => seat.botId === botId && isSeated(seat))) {
				return refuse({ kind: "unknownBot", id: botId })
			}
			seats.set(
				conversationId,
				held.map((seat) => ({
					...seat,
					role: seat.botId === botId ? "lead" : "assistant",
				})),
			)
			return Promise.resolve(drawnConversation(stored))
		},

		openRuntimeSession: (
			conversationId: string,
			botId: string,
			startedAt: number,
			runtimeSessionId: string | null,
			_reason: string | null,
		) => {
			const participant = participantKey(conversationId, botId)
			const seq = (runs.get(participant) ?? 0) + 1
			runs.set(participant, seq)
			const id = `run-${participant}-${seq}`
			if (runtimeSessionId !== null) {
				handOver(participant, runtimeSessionId, id)
			}
			runRows.set(id, { participant, live: true, providerSessionId: null })
			return Promise.resolve<RuntimeSession>({
				id,
				conversationId,
				botId,
				seq,
				startedAt,
			})
		},

		recordProviderSession: (
			conversationId: string,
			botId: string,
			runtimeSessionId: string,
			providerSessionId: string,
		) => {
			const row = runRows.get(runtimeSessionId)
			if (!row || row.participant !== participantKey(conversationId, botId)) {
				return refuse({
					kind: "storage",
					failure: { kind: "sqlite", detail: "no such runtime session" },
				})
			}
			if (row.live && row.providerSessionId === null) {
				row.providerSessionId = providerSessionId
				return Promise.resolve()
			}
			return row.live && row.providerSessionId === providerSessionId
				? Promise.resolve()
				: refuse({ kind: "storage", failure: { kind: "staleWrite" } })
		},

		boundedContext: (
			conversationId: string,
			_botId: string,
			runtimeSessionId: string,
			promptMessageId: string,
		) => {
			const prompt = rows.get(promptMessageId)
			if (!prompt) {
				return refuse({
					kind: "storage",
					failure: { kind: "sqlite", detail: "no such message" },
				})
			}
			const checkpoint = checkpoints.get(runtimeSessionId)
			const baseline = checkpoint?.lastMessageSeq ?? 0
			const recent = ordered(conversationId)
				.filter((row) => row.seq > baseline && row.seq < prompt.seq)
				.slice(-RECENT_TAIL)
			const answeredId = answered.get(prompt.id)
			const target = answeredId ? rows.get(answeredId) : undefined
			const sections: string[] = []
			if (checkpoint) {
				sections.push(`${SUMMARY_LABEL}\n${checkpoint.summary}`)
			}
			if (target && !recent.includes(target)) {
				sections.push(`${REPLY_LABEL}\n${spoken(target)}`)
			}
			if (recent.length > 0) {
				sections.push(`${RECENT_LABEL}\n${recent.map(spoken).join("\n")}`)
			}
			if (sections.length === 0) {
				return Promise.resolve(prompt.content)
			}
			sections.push(`${PROMPT_LABEL}\n${prompt.content}`)
			return Promise.resolve(sections.join("\n\n"))
		},

		messageHeader: (conversationId: string, messageId: string) => {
			const stored = rows.get(messageId)
			if (!stored || stored.conversationId !== conversationId) {
				return refuse({ kind: "unknownMessage", id: messageId })
			}
			return Promise.resolve(`[${stored.role} · ${stored.createdAt}]`)
		},

		captureCheckpoint: (
			conversationId: string,
			botId: string,
			runtimeSessionId: string,
			createdAt: number,
		) => {
			const participant = participantKey(conversationId, botId)
			const previous = checkpoints.get(runtimeSessionId)
			const baseline = previous?.lastMessageSeq ?? 0
			const spokenSoFar = ordered(conversationId)
			const cutoff = (spokenSoFar.at(-1)?.seq ?? 0) - RECENT_TAIL
			if (cutoff <= baseline) {
				return Promise.resolve(null)
			}
			const folded = spokenSoFar
				.filter((row) => row.seq > baseline && row.seq <= cutoff)
				.map(spoken)
			const summary = [previous?.summary, ...folded].filter(Boolean).join("\n")
			checkpoints.set(runtimeSessionId, { summary, lastMessageSeq: cutoff })
			return Promise.resolve<ContextCheckpoint>({
				id: `checkpoint-${participant}-${cutoff}`,
				conversationId,
				botId,
				runtimeSessionId,
				lastMessageSeq: cutoff,
				tokenCount: summary.length,
				createdAt,
			})
		},

		startTurn,

		completeTurn: () => Promise.resolve(),

		messageReference: (conversationId: string, messageId: string) => {
			const stored = rows.get(messageId)
			if (!stored || stored.conversationId !== conversationId) {
				return Promise.resolve(null)
			}
			const providerSessionId = stored.runtimeSessionId
				? (runRows.get(stored.runtimeSessionId)?.providerSessionId ?? null)
				: null
			return Promise.resolve<MessageReference>({
				uri: messageUri(conversationId, messageId),
				conversationId,
				messageId,
				role: stored.role,
				seq: stored.seq,
				createdAt: stored.createdAt,
				excerpt: excerptOf(stored.content),
				runtimeSessionId: stored.runtimeSessionId,
				providerSessionId,
			})
		},

		pinMessage: (
			conversationId: string,
			messageId: string,
			blockIndex: number,
			pinnedAt: number,
		) => writePin(conversationId, messageId, blockIndex, pinnedAt),

		unpinMessage: (
			conversationId: string,
			messageId: string,
			blockIndex: number,
		) => writePin(conversationId, messageId, blockIndex, null),

		pinnedMessages: (conversationId: string) =>
			Promise.resolve<MessagePin[]>(
				ordered(conversationId)
					.reverse()
					.flatMap((message) =>
						[...(pins.get(message.id) ?? [])]
							.sort(([left], [right]) => left - right)
							.map(([blockIndex, pinnedAt]) => ({
								message,
								blockIndex,
								pinnedAt,
							})),
					),
			),

		appendUserMessage,

		sendUserMessage: async (message: NewUserMessage) => {
			await startTurn({
				id: message.turnId,
				conversationId: message.conversationId,
				startedAt: message.createdAt,
			})
			return appendUserMessage(message)
		},

		openAssistantMessage: (message: NewAssistantMessage) => {
			remember(message.id, message.repliedToMessageId)
			return append({
				...message,
				role: "assistant",
				content: "",
				completion: "pending",
				authorAccountId: null,
				authorName: null,
				runtimeSessionId: liveSessionOf(
					message.conversationId,
					message.authorBotId,
				),
			})
		},

		appendText: (id: string, delta: string) => {
			const stored = rows.get(id)
			if (stored && OPEN.includes(stored.completion)) {
				rows.set(id, {
					...stored,
					content: stored.content + delta,
					completion: "streaming",
				})
			}
			return Promise.resolve()
		},

		finalizeMessage: (
			id: string,
			completion: TerminalCompletion,
			settledText?: string,
		) => {
			const stored = rows.get(id)
			if (!stored || stored.completion === completion) {
				return Promise.resolve()
			}
			if (!OPEN.includes(stored.completion)) {
				return refuse({
					kind: "invalidTransition",
					id,
					from: stored.completion,
					to: completion,
				})
			}
			rows.set(id, {
				...stored,
				completion,
				content: settledText ?? stored.content,
			})
			return Promise.resolve()
		},
	}
}
