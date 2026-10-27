import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type {
	BotSkillDraft,
	EnvScope,
	NewAssistantMessage,
	NewTurn,
	NewUserMessage,
	PluginScope,
	TranscriptStoreError,
} from "./store-contract"
import {
	arrivalsTransport,
	conversationStore,
	reportTurnWritesOn,
} from "./store-transport"
import {
	COMPANION_ARRIVED_EVENT,
	COMPANION_SPOKE_EVENT,
	type CompanionArrival,
	type CompanionSpoke,
	type TerminalCompletion,
	TRANSCRIPT_PAGE_SIZE,
	type TranscriptPage,
} from "./transcript-contract"
import {
	botIdentity,
	CONVERSATION,
	message,
	named,
} from "./transcript-fixtures"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }))

const hostInvoke = vi.mocked(invoke)
const hostListen = vi.mocked(listen)

const PAGE: TranscriptPage = {
	conversationId: CONVERSATION,
	messages: [
		message({ id: "m-1", seq: 1 }),
		message({ id: "m-2", seq: 2 }),
		message({ id: "m-3", seq: 3 }),
	],
	arrivals: [],
	hasMore: true,
}

const TURN: NewTurn = {
	id: "t-1",
	conversationId: CONVERSATION,
	startedAt: 1,
}

const USER_MESSAGE: NewUserMessage = {
	id: "m-1",
	conversationId: CONVERSATION,
	turnId: "t-1",
	authorBotId: null,
	repliedToMessageId: null,
	content: "hello",
	createdAt: 2,
}

const ASSISTANT_MESSAGE: NewAssistantMessage = {
	id: "m-2",
	conversationId: CONVERSATION,
	turnId: "t-1",
	authorBotId: "b-1",
	repliedToMessageId: "m-1",
	createdAt: 3,
}

type WriteCase = {
	member: string
	write: () => Promise<unknown>
	call: [
		command: string,
		args?: Record<string, unknown>,
		options?: { signal?: AbortSignal },
	]
}

const IDENTITY = botIdentity()

const SKILL_DRAFT: BotSkillDraft = {
	name: "Baking",
	description: "How to bake.",
	body: "Bake at 220 degrees.",
	allowedTools: ["Read", "Write"],
	userInvocable: true,
	metadata: { author: "someone" },
}

const SERVER = { command: "atlas-mcp", args: ["--stdio"] }

const BOT_SCOPE: EnvScope = { kind: "bot", id: "b-1", spaceId: "s-1" }

const BOT_PLUGIN: PluginScope = { kind: "bot", id: "b-1" }

const SPACE_PLUGIN: PluginScope = { kind: "space", id: "s-1" }

const USER_PLUGIN: PluginScope = { kind: "user" }

const WRITES: WriteCase[] = [
	{
		member: "spaces",
		write: () => conversationStore.spaces(),
		call: ["space_list"],
	},
	{
		member: "createSpace",
		write: () => conversationStore.createSpace("Vocca"),
		call: ["space_create", { name: "Vocca" }],
	},
	{
		member: "updateSpace",
		write: () => conversationStore.updateSpace("s-1", "Work", 186),
		call: ["space_update", { id: "s-1", name: "Work", colour: 186 }],
	},
	{
		member: "updateSpace",
		write: () => conversationStore.updateSpace("s-1", "Work"),
		call: ["space_update", { id: "s-1", name: "Work", colour: null }],
	},
	{
		member: "reorderSpaces",
		write: () => conversationStore.reorderSpaces(["s-2", "s-1"]),
		call: ["space_reorder", { ids: ["s-2", "s-1"] }],
	},
	{
		member: "deleteSpace",
		write: () => conversationStore.deleteSpace("s-1"),
		call: ["space_delete", { id: "s-1" }],
	},
	{
		member: "conversations",
		write: () => conversationStore.conversations("s-1"),
		call: ["conversation_list", { spaceId: "s-1" }],
	},
	{
		member: "createConversation",
		write: () =>
			conversationStore.createConversation({
				spaceId: "s-1",
				sectionId: "n-1",
				title: "Launch",
				botIds: ["b-1", "b-2"],
			}),
		call: [
			"conversation_create",
			{
				spaceId: "s-1",
				sectionId: "n-1",
				title: "Launch",
				botIds: ["b-1", "b-2"],
			},
		],
	},
	{
		member: "updateConversation",
		write: () =>
			conversationStore.updateConversation("c-1", {
				title: "Launch",
				instructions: "Stay short.",
				sectionId: null,
				icon: "Message",
				color: 186,
			}),
		call: [
			"conversation_update",
			{
				conversationId: "c-1",
				title: "Launch",
				instructions: "Stay short.",
				sectionId: null,
				icon: "Message",
				color: 186,
			},
		],
	},
	{
		member: "deleteConversation",
		write: () => conversationStore.deleteConversation("c-1"),
		call: ["conversation_delete", { conversationId: "c-1" }],
	},
	{
		member: "addConversationParticipant",
		write: () => conversationStore.addConversationParticipant("c-1", "b-1"),
		call: [
			"conversation_add_participant",
			{ conversationId: "c-1", botId: "b-1", invitedByBotId: null },
		],
	},
	{
		member: "removeConversationParticipant",
		write: () => conversationStore.removeConversationParticipant("c-1", "b-1"),
		call: [
			"conversation_remove_participant",
			{ conversationId: "c-1", botId: "b-1" },
		],
	},
	{
		member: "setConversationLead",
		write: () => conversationStore.setConversationLead("c-1", "b-1"),
		call: ["conversation_set_lead", { conversationId: "c-1", botId: "b-1" }],
	},
	{
		member: "sections",
		write: () => conversationStore.sections("s-1"),
		call: ["section_list", { spaceId: "s-1" }],
	},
	{
		member: "createSection",
		write: () => conversationStore.createSection("s-1", "Writers"),
		call: ["section_create", { spaceId: "s-1", name: "Writers" }],
	},
	{
		member: "renameSection",
		write: () => conversationStore.renameSection("n-1", "Readers"),
		call: ["section_rename", { id: "n-1", name: "Readers" }],
	},
	{
		member: "pinRoster",
		write: () =>
			conversationStore.pinRoster("s-1", [{ id: "n-2", sectionId: null }]),
		call: [
			"roster_pin",
			{ spaceId: "s-1", pins: [{ id: "n-2", sectionId: null }] },
		],
	},
	{
		member: "deleteSection",
		write: () => conversationStore.deleteSection("n-1"),
		call: ["section_delete", { id: "n-1" }],
	},
	{
		member: "moveBotToSection",
		write: () => conversationStore.moveBotToSection("b-1", "n-1"),
		call: ["bot_move_to_section", { botId: "b-1", sectionId: "n-1" }],
	},
	{
		member: "moveBotToSection out of every section",
		write: () => conversationStore.moveBotToSection("b-1", null),
		call: ["bot_move_to_section", { botId: "b-1", sectionId: null }],
	},
	{
		member: "moveBotToSpace",
		write: () => conversationStore.moveBotToSpace("b-1", "s-2"),
		call: ["bot_move_to_space", { botId: "b-1", spaceId: "s-2" }],
	},
	{
		member: "addBotToSpace",
		write: () => conversationStore.addBotToSpace("b-1", "s-2"),
		call: [
			"bot_add_to_space",
			{ botId: "b-1", spaceId: "s-2", sectionId: null },
		],
	},
	{
		member: "removeBotFromSpace",
		write: () => conversationStore.removeBotFromSpace("b-1", "s-2"),
		call: ["bot_remove_from_space", { botId: "b-1", spaceId: "s-2" }],
	},
	{
		member: "bots",
		write: () => conversationStore.bots("s-1"),
		call: ["conversation_bots", { spaceId: "s-1" }, { signal: undefined }],
	},
	{
		member: "botsByPresence",
		write: () => conversationStore.botsByPresence("s-1", "c-1"),
		call: [
			"conversation_bots_by_presence",
			{ spaceId: "s-1", excludedConversationId: "c-1" },
		],
	},
	{
		member: "createBot",
		write: () => conversationStore.createBot(IDENTITY, "s-1"),
		call: ["conversation_create_bot", { identity: IDENTITY, spaceId: "s-1" }],
	},
	{
		member: "createBotFromDraft",
		write: () =>
			conversationStore.createBotFromDraft(
				{ name: "Quill", job: "a writer", description: "Write." },
				"s-1",
			),
		call: [
			"conversation_create_bot_from_draft",
			{
				draft: { name: "Quill", job: "a writer", description: "Write." },
				spaceId: "s-1",
			},
		],
	},
	{
		member: "suggestedBots",
		write: () => conversationStore.suggestedBots(),
		call: ["conversation_suggested_bots"],
	},
	{
		member: "duplicateBot",
		write: () => conversationStore.duplicateBot("b-1"),
		call: ["conversation_duplicate_bot", { botId: "b-1", spaceId: null }],
	},
	{
		member: "updateBot",
		write: () => conversationStore.updateBot("b-1", IDENTITY),
		call: ["conversation_update_bot", { id: "b-1", identity: IDENTITY }],
	},
	{
		member: "deleteBot",
		write: () => conversationStore.deleteBot("b-1"),
		call: ["conversation_delete_bot", { id: "b-1" }],
	},
	{
		member: "pluginSkills",
		write: () => conversationStore.pluginSkills(BOT_PLUGIN),
		call: ["plugin_skills", { scope: BOT_PLUGIN }],
	},
	{
		member: "createPluginSkill",
		write: () => conversationStore.createPluginSkill(SPACE_PLUGIN, SKILL_DRAFT),
		call: ["plugin_create_skill", { scope: SPACE_PLUGIN, draft: SKILL_DRAFT }],
	},
	{
		member: "updatePluginSkill",
		write: () =>
			conversationStore.updatePluginSkill(USER_PLUGIN, "baking", SKILL_DRAFT),
		call: [
			"plugin_update_skill",
			{ scope: USER_PLUGIN, skillId: "baking", draft: SKILL_DRAFT },
		],
	},
	{
		member: "setPluginSkillPreloaded",
		write: () =>
			conversationStore.setPluginSkillPreloaded(BOT_PLUGIN, "baking", true),
		call: [
			"plugin_set_skill_preloaded",
			{ scope: BOT_PLUGIN, skillId: "baking", isPreloaded: true },
		],
	},
	{
		member: "deletePluginSkill",
		write: () => conversationStore.deletePluginSkill(BOT_PLUGIN, "baking"),
		call: ["plugin_delete_skill", { scope: BOT_PLUGIN, skillId: "baking" }],
	},
	{
		member: "pluginSkillFile",
		write: () =>
			conversationStore.pluginSkillFile(BOT_PLUGIN, "baking", "notes.md"),
		call: [
			"plugin_skill_file",
			{ scope: BOT_PLUGIN, skillId: "baking", path: "notes.md" },
		],
	},
	{
		member: "writePluginSkillFile",
		write: () =>
			conversationStore.writePluginSkillFile(
				BOT_PLUGIN,
				"baking",
				"notes.md",
				"One line",
			),
		call: [
			"plugin_write_skill_file",
			{
				scope: BOT_PLUGIN,
				skillId: "baking",
				path: "notes.md",
				text: "One line",
			},
		],
	},
	{
		member: "deletePluginSkillFile",
		write: () =>
			conversationStore.deletePluginSkillFile(BOT_PLUGIN, "baking", "notes.md"),
		call: [
			"plugin_delete_skill_file",
			{ scope: BOT_PLUGIN, skillId: "baking", path: "notes.md" },
		],
	},
	{
		member: "pluginMcpServers",
		write: () => conversationStore.pluginMcpServers(SPACE_PLUGIN),
		call: ["plugin_mcp_servers", { scope: SPACE_PLUGIN }],
	},
	{
		member: "setPluginMcpServer",
		write: () =>
			conversationStore.setPluginMcpServer(BOT_PLUGIN, "atlas", SERVER),
		call: [
			"plugin_set_mcp_server",
			{ scope: BOT_PLUGIN, name: "atlas", config: SERVER },
		],
	},
	{
		member: "deletePluginMcpServer",
		write: () => conversationStore.deletePluginMcpServer(USER_PLUGIN, "atlas"),
		call: ["plugin_delete_mcp_server", { scope: USER_PLUGIN, name: "atlas" }],
	},
	{
		member: "pluginHistory",
		write: () => conversationStore.pluginHistory(BOT_PLUGIN),
		call: ["plugin_history", { scope: BOT_PLUGIN }],
	},
	{
		member: "pluginHistoryDiff",
		write: () => conversationStore.pluginHistoryDiff(BOT_PLUGIN, "c-1", "c-2"),
		call: [
			"plugin_history_diff",
			{ scope: BOT_PLUGIN, oldestCommitId: "c-1", newestCommitId: "c-2" },
		],
	},
	{
		member: "revertPlugin",
		write: () => conversationStore.revertPlugin(SPACE_PLUGIN, "c-1", "c-2"),
		call: [
			"plugin_revert",
			{ scope: SPACE_PLUGIN, oldestCommitId: "c-1", newestCommitId: "c-2" },
		],
	},
	{
		member: "environmentVariables",
		write: () => conversationStore.environmentVariables(BOT_SCOPE),
		call: ["env_list", { scope: BOT_SCOPE }],
	},
	{
		member: "setEnvironmentVariable",
		write: () =>
			conversationStore.setEnvironmentVariable(
				BOT_SCOPE,
				"ATLAS_TOKEN",
				"sk-1",
			),
		call: ["env_set", { scope: BOT_SCOPE, name: "ATLAS_TOKEN", value: "sk-1" }],
	},
	{
		member: "deleteEnvironmentVariable",
		write: () =>
			conversationStore.deleteEnvironmentVariable(BOT_SCOPE, "ATLAS_TOKEN"),
		call: ["env_delete", { scope: BOT_SCOPE, name: "ATLAS_TOKEN" }],
	},
	{
		member: "recordBotCommands",
		write: () => conversationStore.recordBotCommands("b-1", named("review")),
		call: [
			"conversation_record_bot_commands",
			{ botId: "b-1", commands: named("review") },
		],
	},
	{
		member: "botCommands",
		write: () => conversationStore.botCommands("b-1"),
		call: ["conversation_bot_commands", { botId: "b-1" }],
	},
	{
		member: "mainChat",
		write: () => conversationStore.mainChat("b-1", "s-1"),
		call: [
			"conversation_main_chat",
			{ botId: "b-1", spaceId: "s-1" },
			{ signal: undefined },
		],
	},
	{
		member: "recordProviderSession",
		write: () =>
			conversationStore.recordProviderSession(
				CONVERSATION,
				"b-1",
				"run-1",
				"claude-9f3c",
			),
		call: [
			"conversation_record_provider_session",
			{
				conversationId: CONVERSATION,
				botId: "b-1",
				runtimeSessionId: "run-1",
				providerSessionId: "claude-9f3c",
			},
		],
	},
	{
		member: "startTurn",
		write: () => conversationStore.startTurn(TURN),
		call: ["conversation_start_turn", { turn: TURN }],
	},
	{
		member: "completeTurn",
		write: () => conversationStore.completeTurn("t-1", 9),
		call: ["conversation_complete_turn", { id: "t-1", completedAt: 9 }],
	},
	{
		member: "appendUserMessage",
		write: () => conversationStore.appendUserMessage(USER_MESSAGE),
		call: ["conversation_append_user_message", { message: USER_MESSAGE }],
	},
	{
		member: "openAssistantMessage",
		write: () => conversationStore.openAssistantMessage(ASSISTANT_MESSAGE),
		call: [
			"conversation_open_assistant_message",
			{ message: ASSISTANT_MESSAGE },
		],
	},
	{
		member: "appendText",
		write: () => conversationStore.appendText("m-2", "Hello"),
		call: ["conversation_append_text", { id: "m-2", delta: "Hello" }],
	},
	{
		member: "finalizeMessage",
		write: () => conversationStore.finalizeMessage("m-2", "complete"),
		call: [
			"conversation_finalize_message",
			{ id: "m-2", completion: "complete" },
		],
	},
]

const ENDINGS: TerminalCompletion[] = [
	"complete",
	"cancelled",
	"failed",
	"interrupted",
]

const FAILURES: TranscriptStoreError[] = [
	{ kind: "conflict", id: "m1", field: "content" },
	{ kind: "unavailable", failure: { kind: "appDataDir" } },
	{ kind: "unknownBot", id: "b-1" },
]

beforeEach(() => {
	hostInvoke.mockReset()
	hostInvoke.mockResolvedValue(undefined)
})

describe("conversationStore reads", () => {
	it("asks for the tail with a null cursor and the default page size", async () => {
		hostInvoke.mockResolvedValue(PAGE)

		const loaded = await conversationStore.loadPage(CONVERSATION, null)

		expect(hostInvoke).toHaveBeenCalledWith("conversation_message_page", {
			conversationId: CONVERSATION,
			beforeSeq: null,
			limit: TRANSCRIPT_PAGE_SIZE,
		})
		expect(loaded).toEqual(PAGE)
		expect(loaded.messages.map((entry) => entry.id)).toEqual([
			"m-1",
			"m-2",
			"m-3",
		])
	})

	it("asks for what precedes the cursor, never the cursor itself", async () => {
		hostInvoke.mockResolvedValue(PAGE)

		await conversationStore.loadPage(CONVERSATION, { beforeSeq: 7 })

		expect(hostInvoke).toHaveBeenCalledWith("conversation_message_page", {
			conversationId: CONVERSATION,
			beforeSeq: 7,
			limit: TRANSCRIPT_PAGE_SIZE,
		})
	})
})

describe("conversationStore writes", () => {
	it.each(WRITES)(
		"sends $member to its command with its argument keys",
		async ({ write, call }) => {
			await write()

			expect(hostInvoke).toHaveBeenCalledWith(...call)
		},
	)

	it.each(ENDINGS)("finalizes a message as %s verbatim", async (completion) => {
		await conversationStore.finalizeMessage("m-2", completion)

		expect(hostInvoke).toHaveBeenCalledWith("conversation_finalize_message", {
			id: "m-2",
			completion,
		})
	})
})

describe("arrivalsTransport", () => {
	it("hands each companion arrival announced by the host to its listener", async () => {
		const arrival: CompanionArrival = {
			id: "a-1",
			conversationId: CONVERSATION,
			botId: "b-2",
			invitedByBotId: null,
			lastMessageSeq: 3,
			createdAt: 9,
		}
		const listener = vi.fn()
		hostListen.mockResolvedValue(() => undefined)

		await arrivalsTransport.onCompanionArrived(listener)
		const [event, handler] = hostListen.mock.calls[0] ?? []
		handler?.({ event: COMPANION_ARRIVED_EVENT, id: 1, payload: arrival })

		expect(event).toBe(COMPANION_ARRIVED_EVENT)
		expect(listener).toHaveBeenCalledWith(arrival)
	})
})

describe("the companion spoke listener", () => {
	it("hands each word heard on this computer to its listener with this computer as its side", async () => {
		const spoken: CompanionSpoke = {
			conversationId: CONVERSATION,
			authorBotId: "b-2",
			text: "Walls are up.",
		}
		const listener = vi.fn()
		hostListen.mockResolvedValue(() => undefined)

		await arrivalsTransport.onCompanionSpoke(listener)
		const [event, handler] = hostListen.mock.calls[0] ?? []
		handler?.({ event: COMPANION_SPOKE_EVENT, id: 1, payload: spoken })

		expect(event).toBe(COMPANION_SPOKE_EVENT)
		expect(listener).toHaveBeenCalledWith(spoken, null)
	})
})

describe("report turn writes pinned to this computer", () => {
	it("names the refused command and the turn it started", async () => {
		const failure: TranscriptStoreError = {
			kind: "storage",
			failure: { kind: "sqlite", detail: "FOREIGN KEY constraint failed" },
		}
		const writes = reportTurnWritesOn(null)
		hostInvoke.mockResolvedValueOnce(1).mockRejectedValueOnce(failure)

		await writes.startTurn(TURN)
		const refused = await writes
			.openAssistantMessage(ASSISTANT_MESSAGE)
			.catch((reason: unknown) => reason)

		expect(refused).toMatchObject({
			command: "conversation_open_assistant_message",
			turn: TURN.id,
			cause: failure,
			message: "storage: FOREIGN KEY constraint failed",
		})
	})
})

describe("conversationStore failures", () => {
	it.each(FAILURES)("rejects a $kind failure unchanged", async (failure) => {
		hostInvoke.mockRejectedValue(failure)

		await expect(conversationStore.loadPage(CONVERSATION, null)).rejects.toBe(
			failure,
		)
		await expect(conversationStore.appendText("m1", "Hello")).rejects.toBe(
			failure,
		)
	})
})
