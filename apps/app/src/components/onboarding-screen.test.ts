// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createElement, useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"

import { OnboardingScreen } from "@/components/onboarding-screen"
import type { WatchedAccount } from "@/lib/account/use-account"
import type { AccountReport } from "@/lib/agent/contract"
import type {
	ClaudeImportOutcome,
	ClaudeInventory,
	OnboardingStep,
} from "@/lib/bindings"
import {
	createFakeFlowWorld,
	type FakeFlowWorld,
} from "@/lib/onboarding/fake-onboarding-flow-world"
import {
	createFakeOnboardingPort,
	type FakeOnboardingPort,
} from "@/lib/onboarding/fake-onboarding-port"
import { onboardingScreenStepOf } from "@/lib/onboarding/onboarding-screen"
import { useOnboardingFlow } from "@/lib/onboarding/use-onboarding-flow"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

const inventoryRead = vi.hoisted(() => ({
	inventory: { kind: "absent" } as ClaudeInventory,
}))

const importRun = vi.hoisted(() => ({
	run: vi.fn<
		(selection: string[], spaceId: string) => Promise<ClaudeImportOutcome[]>
	>(),
}))

vi.mock("@/lib/onboarding/claude-import-transport", () => ({
	readClaudeInventory: async () => inventoryRead.inventory,
	claudeImportTransport: {
		run: importRun.run,
		onProgress: async () => () => undefined,
	},
}))

const SPACE_ID = "space-home"

const itemOf = (key: string, name: string) => ({
	key,
	name,
	description: `${name} description`,
	alreadyImported: false,
})

const FOUND: ClaudeInventory = {
	kind: "found",
	agents: [itemOf("agent:atlas", "Atlas")],
	skills: [itemOf("skill:changelog", "changelog")],
	claudeMd: null,
}

const markSeen = vi.fn(async () => undefined)

const IMPORT_SCENE = { spaceId: () => SPACE_ID, markSeen }

const SIGNED_OUT: WatchedAccount = {
	state: { kind: "signedOut", reason: null },
	isPending: false,
}

const LOGGED_IN: AccountReport = {
	connection: "ready",
	binaryVersion: null,
	authenticated: true,
	error: null,
	account: { email: "reader@example.com", plan: "Max" },
}

type HarnessProps = {
	port: FakeOnboardingPort
	world: FakeFlowWorld
}

const OnboardingHarness = ({ port, world }: HarnessProps) => {
	const [step, setStep] = useState<OnboardingStep>(world.step)
	const flow = useOnboardingFlow(port, {
		...world,
		storeStep: async (stored) => {
			await world.storeStep(stored)
			setStep(stored)
		},
	})
	const shown = onboardingScreenStepOf(step, flow.state)

	return shown
		? createElement(OnboardingScreen, {
				account: SIGNED_OUT,
				flow,
				importScene: IMPORT_SCENE,
				readerName: "Reader",
				step: shown,
			})
		: null
}

let port: FakeOnboardingPort
let world: FakeFlowWorld

const settle = () =>
	act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0))
	})

const renderOnboarding = async () => {
	const shown = render(createElement(OnboardingHarness, { port, world }), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await settle()
	return shown
}

const press = async (name: string) => {
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name }))
	})
	await settle()
}

const heading = () => screen.getByRole("heading", { level: 1 }).textContent

const importScreen = () =>
	screen.findByRole("heading", { name: "Bring in your Claude Code setup" })

beforeEach(() => {
	port = createFakeOnboardingPort()
	world = createFakeFlowWorld()
	inventoryRead.inventory = FOUND
	importRun.run.mockReset()
	markSeen.mockClear()
})

afterEach(cleanup)

describe("the Welcome screens", () => {
	it("walks the three screens, then stores connect and offers the two ways in", async () => {
		await renderOnboarding()
		expect(heading()).toBe("Companions do the work with you")

		await press("Next")
		expect(heading()).toBe("Conversations, then missions")
		await press("Next")
		expect(heading()).toBe("Your tools, where you allow them")
		await press("Get started")

		expect(world.stored).toEqual(["connect"])
		expect(heading()).toBe("Connect the model provider")
		expect(
			screen.getByRole("button", { name: /Sign in with Claude/ }),
		).toBeTruthy()
		expect(
			screen.getByRole("button", { name: /Paste an API key/ }),
		).toBeTruthy()
	})

	it("steps back a screen on Back without moving the host step", async () => {
		await renderOnboarding()
		await press("Next")
		await press("Next")

		await press("Back")
		expect(heading()).toBe("Conversations, then missions")
		await press("Back")
		expect(heading()).toBe("Companions do the work with you")

		expect(world.stored).toEqual([])
	})

	it("stays on the first screen when Back fires there", async () => {
		await renderOnboarding()

		await press("Back")
		expect(heading()).toBe("Companions do the work with you")
		await press("Next")
		expect(heading()).toBe("Conversations, then missions")
	})

	it("leaves the intro on Skip intro from the first screen", async () => {
		await renderOnboarding()

		await press("Skip intro")

		expect(world.stored).toEqual(["connect"])
	})
})

describe("the Connect screen", () => {
	it("offers the Claude Code login found, or another account", async () => {
		port.report = LOGGED_IN
		await renderOnboarding()

		await press("Skip intro")

		expect(screen.getByText("reader@example.com")).toBeTruthy()
		expect(
			screen.getByRole("button", { name: "Use this account" }),
		).toBeTruthy()
		expect(
			screen.getByRole("button", { name: "Use another account" }),
		).toBeTruthy()
	})

	it("names a missing agent and opens the download page", async () => {
		port.report = {
			...LOGGED_IN,
			authenticated: false,
			error: { kind: "binaryNotFound", searched: [] },
			account: null,
		}
		await renderOnboarding()
		await press("Skip intro")

		expect(heading()).toBe("Couldn’t find the agent")
		await press("Download Kiroshi again")

		expect(port.calls.at(-1)).toEqual({ command: "openDownloadPage" })
	})

	it("hands the workspace to Shoto when no ~/.claude folder is found", async () => {
		port.report = LOGGED_IN
		await renderOnboarding()
		await press("Skip intro")

		await press("Use this account")

		expect(screen.queryByRole("heading")).toBeNull()
		expect(world.stored).toEqual(["connect"])
	})
})

describe("the Import and Account screens", () => {
	it("skips the import to Account, then finishes on Skip for now", async () => {
		port.report = LOGGED_IN
		port.hasClaudeFolder = true
		await renderOnboarding()
		await press("Skip intro")
		await press("Use this account")

		expect(world.stored).toEqual(["connect", "import"])
		await importScreen()
		await press("Skip for now")
		expect(world.stored.at(-1)).toBe("account")
		expect(heading()).toBe("Sign in to Kiroshi")

		await press("Skip for now")

		expect(world.stored.at(-1)).toBe("done")
		expect(world.firstRunDone).toBe(1)
		expect(screen.queryByRole("heading")).toBeNull()
	})

	it("imports the checked items into the current space, then continues as Skip does", async () => {
		importRun.run.mockResolvedValue([
			{
				key: "agent:atlas",
				result: { kind: "imported", id: "bot-atlas", name: "Atlas 2" },
			},
			{
				key: "skill:changelog",
				result: { kind: "imported", id: "skill-changelog", name: "changelog" },
			},
		])
		world.step = "import"
		await renderOnboarding()

		await screen.findByRole("checkbox", { name: "Atlas" })
		await press("Import 2 items")

		expect(importRun.run).toHaveBeenCalledWith(
			["agent:atlas", "skill:changelog"],
			SPACE_ID,
		)
		expect(heading()).toBe("Your setup is in")
		expect(
			screen.getByText(
				"Atlas already lives in Kiroshi, so this one comes in as Atlas 2. Rename it after.",
			),
		).toBeTruthy()

		await press("Continue")

		expect(world.stored.at(-1)).toBe("account")
		expect(markSeen).toHaveBeenCalledOnce()
	})

	it("keeps the import screen open on Skip when the import is refused", async () => {
		importRun.run.mockRejectedValue(new Error("database locked"))
		world.step = "import"
		await renderOnboarding()

		await importScreen()
		await press("Import 2 items")

		expect(heading()).toBe("Bring in your Claude Code setup")
		await press("Skip for now")
		expect(world.stored.at(-1)).toBe("account")
	})

	it("resumes on the stored step", async () => {
		world.step = "account"
		await renderOnboarding()

		expect(screen.getByRole("button", { name: "Skip for now" })).toBeTruthy()
	})
})
