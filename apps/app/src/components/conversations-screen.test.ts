// @vitest-environment happy-dom

import { RouterProvider } from "@tanstack/react-router"
import { act, cleanup, render, screen } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, expect, it, vi } from "vitest"

import { newBotIdentity } from "@/lib/bots/bot-settings"
import { createFakeChatDriver } from "@/lib/chat/fake-driver"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import type { Conversation } from "@/lib/conversations/store-contract"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import type { Mission } from "@/lib/missions/mission-contract"
import { missionsTransport } from "@/lib/missions/missions-transport"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import type { UserPreferences } from "@/lib/user/preferences-contract"
import { readMirror, writeMirror } from "@/lib/user/preferences-mirror"

type Harness = {
	store: TranscriptStore | null
	preferences: UserPreferences | null
}

const harness = vi.hoisted(
	(): Harness => ({
		store: null,
		preferences: null,
	}),
)

vi.mock("@/lib/conversations/create-store", () => ({
	createTranscriptStore: () => harness.store,
}))

const PREFERENCES_COMMANDS = ["user_preferences", "user_set_preferences"]

vi.mock("@/lib/host/index", async (importOriginal) => {
	const host = await importOriginal<typeof import("@/lib/host/index")>()
	const answerPreferences = (args: unknown) => {
		const written = (args as { preferences?: UserPreferences } | undefined)
			?.preferences
		harness.preferences = written ?? harness.preferences
		return Promise.resolve(harness.preferences)
	}
	return {
		...host,
		isDesktopHost: () => false,
		invoke: (command: string, args?: Record<string, unknown>) =>
			harness.preferences && PREFERENCES_COMMANDS.includes(command)
				? answerPreferences(args)
				: host.invoke(command, args),
	}
})

vi.mock("@/lib/chat/create-driver", async () => {
	const { withFakeHostWrites } = await import(
		"@/lib/conversations/fake-host-writes"
	)
	return {
		createChatDriver: (store: TranscriptStore) =>
			withFakeHostWrites(createFakeChatDriver({ stepMs: 1 }), store),
	}
})

vi.mock("@/lib/missions/missions-transport", async (importOriginal) => {
	const original =
		await importOriginal<typeof import("@/lib/missions/missions-transport")>()
	return {
		...original,
		missionsTransport: { ...original.missionsTransport, detailOn: vi.fn() },
	}
})

const { createWorkspaceRouter } = await import("@/workspace-router")

const SETTLE_MS = 200

const SPACE_ID = "personal"

const STORED_ON_MISSIONS: UserPreferences = {
	displayName: "",
	profilePicturePath: null,
	colorScheme: "system",
	language: null,
	notifyOnQuestion: true,
	notifyOnPermission: true,
	notifyOnFinishedTurn: true,
	notifyWithSound: true,
	sidebarWidth: null,
	sidebarTab: "missions",
	openOn: "newConversation",
	activityPanelOpen: false,
	firstRunDone: true,
	lastSpaceId: null,
	lastBotIdBySpace: {},
}

afterEach(() => {
	cleanup()
	localStorage.clear()
	vi.useRealTimers()
	harness.store = null
	harness.preferences = null
})

const settle = async () => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(SETTLE_MS)
	})
}

type MissionSeat = { botId: string; origin: Conversation; thread: Conversation }

const missionOf = ({ botId, origin, thread }: MissionSeat): Mission => ({
	id: "m-1",
	originConversationId: origin.id,
	spaceId: null,
	botId,
	threadConversationId: thread.id,
	objective: "Rewrite the changelog parser",
	ticket: {
		platform: "linear",
		externalId: "OPE-42",
		url: "https://linear.app/ope-42",
		title: "Changelog parser",
	},
	tools: [],
	state: "working",
	stateSeq: 1,
	isAgentRunning: false,
	openedAt: 0,
	closedAt: null,
	reportedAt: null,
	reportedTurnId: null,
	status: null,
	lastActivityAt: null,
	lastActivity: null,
	commitsAhead: null,
	dirtyFiles: null,
	pullRequestUrl: null,
	branch: null,
	workspacePath: null,
})

const seedConversationWithMission = async () => {
	writeMirror({ ...readMirror(), firstRunDone: true })
	const store = createFakeTranscriptStore()
	const bot = await store.createBot(newBotIdentity([]), SPACE_ID)
	const conversationOf = (title: string) =>
		store.createConversation({
			botIds: [bot.id],
			sectionId: null,
			spaceId: SPACE_ID,
			title,
		})
	const origin = await conversationOf("Round table")
	const thread = await conversationOf("Mission thread")
	const mission = missionOf({ botId: bot.id, origin, thread })
	vi.mocked(missionsTransport.detailOn).mockResolvedValue({
		mission,
		events: [],
	})
	harness.store = store
	harness.preferences = STORED_ON_MISSIONS
	return { origin, mission }
}

const mountWorkspace = async () => {
	vi.useFakeTimers()
	const router = createWorkspaceRouter()
	render(createElement(RouterProvider, { router }), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await settle()
	return router
}

const slot = (name: string) => document.querySelector(`[data-slot='${name}']`)

it("shows the conversation left to from a mission, with the saved sidebar tab on missions", async () => {
	const { origin, mission } = await seedConversationWithMission()
	const router = await mountWorkspace()

	await act(() =>
		router.navigate({
			to: "/",
			search: { conversation: origin.id, mission: mission.id },
		}),
	)
	await settle()
	expect(slot("mission-header")).not.toBeNull()

	await act(() =>
		router.navigate({ to: "/", search: { conversation: origin.id } }),
	)
	await settle()

	expect(slot("mission-header")).toBeNull()
	expect(slot("header-conversation-button")).not.toBeNull()
	expect(screen.getByRole("textbox")).toBeTruthy()
})
