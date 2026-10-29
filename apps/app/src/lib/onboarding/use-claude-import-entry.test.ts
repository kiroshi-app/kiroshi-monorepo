// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"

import { useClaudeImportEntry } from "./use-claude-import-entry"

import { ClaudeImport } from "@/components/claude-import"
import type { ClaudeInventory } from "@/lib/bindings"
import type { RosterController } from "@/lib/bots/roster-controller"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import type { SpacesController } from "@/lib/spaces/spaces-controller"
import type { ReaderPreferences } from "@/lib/user/preferences-controller"
import type { User } from "@/lib/user/use-user"

const INVENTORY: ClaudeInventory = {
	kind: "found",
	agents: [
		{
			key: "agents/atlas.md",
			name: "Atlas",
			description: "Reviews pull requests.",
			alreadyImported: false,
		},
	],
	skills: [],
	claudeMd: null,
}

vi.mock("@/lib/onboarding/claude-import-transport", () => ({
	readClaudeInventory: async () => INVENTORY,
	claudeImportTransport: {
		run: vi.fn(async () => []),
		onProgress: async () => () => undefined,
	},
}))

const roster = {
	getState: () => ({ spaceRowId: "personal" }),
} as unknown as RosterController

const spaces = {
	getState: () => ({ spaces: [{ id: "personal" }] }),
} as unknown as SpacesController

const markOnboardingImportSeen = vi.fn(async () => undefined)

const userWith = (preferences: Partial<ReaderPreferences>) =>
	({
		state: { preferences },
		controller: { markOnboardingImportSeen },
	}) as unknown as User

type StartHarnessProps = { user: User }

const StartHarness = ({ user }: StartHarnessProps) => {
	const entry = useClaudeImportEntry({ roster, spaces, user })
	return entry.shown ? createElement(ClaudeImport, entry.shown) : null
}

const renderAtStart = (preferences: Partial<ReaderPreferences>) =>
	render(createElement(StartHarness, { user: userWith(preferences) }), {
		wrapper: createQueryTestWrapper().wrapper,
	})

const EXISTING_PROFILE: Partial<ReaderPreferences> = {
	onboardingStep: "done",
	onboardingImportSeen: false,
}

afterEach(() => {
	cleanup()
	markOnboardingImportSeen.mockClear()
})

describe("the import screen shown once at start", () => {
	it("offers Not now to an existing profile, then marks the offer seen and closes", async () => {
		renderAtStart(EXISTING_PROFILE)

		const notNow = await screen.findByRole("button", { name: "Not now" })
		expect(
			screen.getByRole("heading", { name: "Bring in your Claude Code setup" }),
		).toBeTruthy()
		expect(screen.queryByRole("button", { name: "Skip for now" })).toBeNull()

		await act(async () => {
			fireEvent.click(notNow)
		})

		expect(markOnboardingImportSeen).toHaveBeenCalledOnce()
		expect(screen.queryByRole("heading")).toBeNull()
	})
})
