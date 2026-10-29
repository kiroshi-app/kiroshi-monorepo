import { beforeEach, describe, expect, it, type Mock, vi } from "vitest"

import "@workspace/ui/lib/i18n"
import type { NoticeMessage } from "@workspace/ui/components/notice-surface"

import {
	createFakeFlowWorld,
	type FakeFlowWorld,
	SHOTO,
} from "./fake-onboarding-flow-world"
import {
	createFakeOnboardingPort,
	type FakeOnboardingPort,
} from "./fake-onboarding-port"
import {
	createOnboardingFlowController,
	type OnboardingFlowController,
	onboardingCreationOf,
	onboardingStepOf,
} from "./onboarding-flow-controller"
import { onboardingSummonsFor } from "./onboarding-summons"

import type { AccountReport } from "../agent/contract"

const SCOUT = { id: "bot-scout", name: "Scout" }

const LOGGED_IN: AccountReport = {
	connection: "ready",
	binaryVersion: null,
	authenticated: true,
	error: null,
	account: { email: "reader@example.com", plan: "Max" },
}

let port: FakeOnboardingPort
let world: FakeFlowWorld
let controller: OnboardingFlowController
let reportFailure: Mock<(notice: NoticeMessage) => void>

const flushed = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
	port = createFakeOnboardingPort()
	world = createFakeFlowWorld()
	reportFailure = vi.fn<(notice: NoticeMessage) => void>()
	controller = createOnboardingFlowController(port, world, { reportFailure })
})

const connectedThroughLogin = async () => {
	port.report = LOGGED_IN
	await controller.leaveIntro()
	await controller.acceptAccount()
	await flushed()
}

describe("the stored onboarding step", () => {
	it("reads the step the host stored", () => {
		expect(
			onboardingStepOf({ onboardingStep: "import", firstRunDone: false }),
		).toBe("import")
	})

	it("reads the step the first-run flag implies before the host answered", () => {
		expect(onboardingStepOf({ firstRunDone: true })).toBe("done")
		expect(onboardingStepOf({ firstRunDone: false })).toBe("welcome")
	})
})

describe("leaving the intro", () => {
	it("stores connect and reads the Claude Code login", async () => {
		port.report = LOGGED_IN

		await controller.leaveIntro()

		expect(world.stored).toEqual(["connect"])
		expect(controller.getState().connection).toEqual({
			state: "detected",
			email: "reader@example.com",
			plan: "Max",
		})
	})

	it("offers the sign-in when no login is found", async () => {
		await controller.leaveIntro()

		expect(controller.getState().connection).toEqual({ state: "offer" })
	})

	it("stays on the intro and names the failure when the step isn't stored", async () => {
		world.refusesStep = true

		await controller.leaveIntro()

		expect(port.calls).toEqual([])
		expect(reportFailure).toHaveBeenCalledWith({
			title: "Couldn’t send that request",
			description: "disk full",
		})
	})
})

describe("resuming", () => {
	it("reads the login again when the app reopens on connect", async () => {
		world.step = "connect"

		await controller.resume()

		expect(port.calls.map(({ command }) => command)).toEqual(["account"])
		expect(controller.getState().connection).toEqual({ state: "offer" })
	})

	it("reads nothing on any other step", async () => {
		world.step = "account"

		await controller.resume()

		expect(port.calls).toEqual([])
	})

	it("reads the login once when asked twice at once", async () => {
		world.step = "connect"

		await Promise.all([controller.resume(), controller.resume()])

		expect(port.calls.map(({ command }) => command)).toEqual(["account"])
	})
})

describe("a sign-in that fails", () => {
	it("names the failure the connect screen draws", async () => {
		await controller.leaveIntro()
		const signingIn = controller.signIn()
		await Promise.resolve()

		port.refuseSignIn({ kind: "binaryNotFound", searched: [] })
		await signingIn

		expect(controller.getState().connection).toMatchObject({
			state: "signInFailed",
			failure: "agentMissing",
		})
	})

	it("opens the download page to get the agent back", async () => {
		await controller.downloadAgain()

		expect(port.calls).toEqual([{ command: "openDownloadPage" }])
	})
})

describe("connecting with a ~/.claude folder", () => {
	beforeEach(() => {
		port.hasClaudeFolder = true
	})

	it("stores import and leaves Shoto alone", async () => {
		await connectedThroughLogin()

		expect(world.stored).toEqual(["connect", "import"])
		expect(controller.getState().isWithShoto).toBe(false)
		expect(world.sent).toEqual([])
	})

	it("stores account when the import is skipped", async () => {
		await connectedThroughLogin()

		await controller.skipImport()

		expect(world.stored.at(-1)).toBe("account")
	})
})

describe("connecting without a ~/.claude folder", () => {
	it("opens Shoto's conversation and summons his greeting, then the first companion", async () => {
		await connectedThroughLogin()

		expect(world.stored).toEqual(["connect"])
		expect(controller.getState().isWithShoto).toBe(true)
		expect(world.opened).toEqual([SHOTO])
		expect(world.sent).toEqual([
			{ botId: SHOTO, text: onboardingSummonsFor("greeting") },
			{ botId: SHOTO, text: onboardingSummonsFor("firstCompanion") },
		])
	})

	it("summons nothing more when the greeting failed", async () => {
		world.greetingOutcome = { kind: "failed", detail: "the agent stopped" }

		await connectedThroughLogin()

		expect(world.sent).toEqual([
			{ botId: SHOTO, text: onboardingSummonsFor("greeting") },
		])
	})

	it("names the companion Shoto created in his thread", async () => {
		await connectedThroughLogin()

		controller.noteCreated(SCOUT)

		expect(onboardingCreationOf(controller.getState())).toEqual({
			shotoId: SHOTO,
			companionId: SCOUT.id,
		})
	})

	it("stores account once Shoto marks the first run done", async () => {
		await connectedThroughLogin()
		controller.noteCreated(SCOUT)

		await controller.noteFirstRunDone()

		expect(world.stored).toEqual(["connect", "account"])
		expect(controller.getState().isWithShoto).toBe(false)
		expect(onboardingCreationOf(controller.getState())).toBeNull()
	})

	it("stays with Shoto when the account step isn't stored", async () => {
		await connectedThroughLogin()
		world.refusesStep = true

		await controller.noteFirstRunDone()

		expect(controller.getState().isWithShoto).toBe(true)
		expect(reportFailure).toHaveBeenCalledOnce()
	})

	it("ignores a companion created and a first run done outside the run", async () => {
		controller.noteCreated(SCOUT)
		await controller.noteFirstRunDone()

		expect(world.stored).toEqual([])
		expect(controller.getState().firstCompanion).toBeNull()
	})
})

describe("finishing on Account", () => {
	const finishedWithScout = async () => {
		await connectedThroughLogin()
		controller.noteCreated(SCOUT)
		await controller.noteFirstRunDone()
		world.opened = []
		world.sent = []
		await controller.finish()
	}

	it("stores done and records the first run", async () => {
		await finishedWithScout()

		expect(world.stored.at(-1)).toBe("done")
		expect(world.firstRunDone).toBe(1)
	})

	it("opens the first companion and summons its arrival greeting", async () => {
		await finishedWithScout()

		expect(world.opened).toEqual([SCOUT.id])
		expect(world.sent).toEqual([
			{ botId: SCOUT.id, text: onboardingSummonsFor("arrival") },
		])
	})

	it("names the companion that couldn't say hello", async () => {
		await connectedThroughLogin()
		controller.noteCreated(SCOUT)
		await controller.noteFirstRunDone()
		world.sendTo = () => Promise.reject(new Error("socket closed"))

		await controller.finish()

		expect(reportFailure).toHaveBeenCalledWith({
			title: "Scout couldn’t say hello",
			description: "socket closed",
		})
	})

	it("opens nothing when no companion was created in this run", async () => {
		await controller.finish()

		expect(world.stored).toEqual(["done"])
		expect(world.opened).toEqual([])
		expect(world.sent).toEqual([])
	})
})

describe("replaying", () => {
	it("forgets the last run and stores the first step again", async () => {
		await connectedThroughLogin()

		await controller.replay()

		expect(world.replays).toBe(1)
		expect(controller.getState()).toMatchObject({
			connection: null,
			isWithShoto: false,
			firstCompanion: null,
		})
	})
})
