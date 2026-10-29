// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"

import type { ClaudeImportOutcome, ClaudeInventory } from "@/lib/bindings"
import { createFakeChatDriver } from "@/lib/chat/fake-driver"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import type { UserPreferences } from "@/lib/user/preferences-contract"

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

const importRun = vi.hoisted(() => ({
	run: vi.fn<
		(
			selection: string[],
			spaceId: string | null,
		) => Promise<ClaudeImportOutcome[]>
	>(async () => []),
}))

const ATLAS = {
	key: "agent:atlas",
	name: "Atlas",
	description: "Reviews pull requests.",
	alreadyImported: false,
}

const INVENTORY: ClaudeInventory = {
	kind: "found",
	agents: [ATLAS],
	skills: [],
	claudeMd: null,
}

vi.mock("@/lib/onboarding/claude-import-transport", () => ({
	readClaudeInventory: async () => INVENTORY,
	claudeImportTransport: {
		run: importRun.run,
		onProgress: async () => () => undefined,
	},
}))

vi.mock("@/lib/conversations/create-store", () => ({
	createTranscriptStore: () => harness.store,
}))

vi.mock("@/lib/host/index", async (importOriginal) => {
	const host = await importOriginal<typeof import("@/lib/host/index")>()
	return {
		...host,
		invoke: (command: string, args?: Record<string, unknown>) =>
			command.startsWith("user_") && harness.preferences
				? Promise.resolve(harness.preferences)
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

const { App } = await import("@/App")

const SETTLE_MS = 200

const FRESH_FIRST_RUN_AT_IMPORT: UserPreferences = {
	displayName: "",
	profilePicturePath: null,
	colorScheme: "system",
	language: null,
	notifyOnQuestion: true,
	notifyOnPermission: true,
	notifyOnFinishedTurn: true,
	notifyWithSound: true,
	sidebarWidth: null,
	sidebarTab: "conversations",
	activityPanelOpen: false,
	firstRunDone: false,
	lastSpaceId: null,
	lastBotIdBySpace: {},
	onboardingStep: "import",
	onboardingImportSeen: false,
}

afterEach(() => {
	cleanup()
	localStorage.clear()
	vi.useRealTimers()
	harness.preferences = null
})

const settle = async () => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(SETTLE_MS)
	})
}

it("imports from the first-run Import step into the space the first run holds", async () => {
	const store = createFakeTranscriptStore()
	const [firstRunSpace] = await store.spaces()
	harness.store = store
	harness.preferences = FRESH_FIRST_RUN_AT_IMPORT
	vi.useFakeTimers()
	render(createElement(App), { wrapper: createQueryTestWrapper().wrapper })
	await settle()

	expect(
		screen.getByRole("heading", { name: "Bring in your Claude Code setup" }),
	).toBeTruthy()
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: "Import 1 agent" }))
	})
	await settle()

	expect(firstRunSpace?.id).toBeTruthy()
	expect(importRun.run).toHaveBeenCalledWith([ATLAS.key], firstRunSpace?.id)
})
