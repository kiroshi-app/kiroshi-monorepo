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
	onboardingFlowWorldOf,
	onboardingStepOf,
} from "./onboarding-flow-controller"
import { onboardingScreenStepOf } from "./onboarding-screen"
import { onboardingSummonsFor } from "./onboarding-summons"

import type { AccountReport } from "../agent/contract"
import type { RosterController } from "../bots/roster-controller"
import type { ChatController } from "../chat/chat-controller"
import { initialChatState } from "../chat/chat-state"
import type { UserController } from "../user/preferences-controller"

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
	world.names = { [SCOUT.id]: SCOUT.name }
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
		expect(onboardingStepOf({ onboardingStep: "import" })).toBe("import")
	})

	it("leaves the workspace in place until the host answered", () => {
		expect(onboardingStepOf({})).toBe("done")
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

describe("connecting while the ~/.claude read is refused", () => {
	it("reports the failure and hands the workspace to Shoto", async () => {
		port.hasClaudeHome = () => Promise.reject(new Error("host gone"))

		await connectedThroughLogin()

		expect(reportFailure).toHaveBeenCalledWith(
			expect.objectContaining({ title: "Couldn’t read ~/.claude" }),
		)
		expect(world.stored).toEqual(["connect"])
		expect(controller.getState().isWithShoto).toBe(true)
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

	it("summons no companion and names the failure when no Shoto is stored", async () => {
		world.shoto = null

		await connectedThroughLogin()

		expect(world.opened).toEqual([])
		expect(world.sent).toEqual([])
		expect(reportFailure).toHaveBeenCalledWith({
			title: "Couldn’t meet your first companion",
			description: "the companion isn’t on this machine",
		})
	})

	it("greets once when the app reopens on connect after Shoto already greeted", async () => {
		world.threadHistory = [
			{ botId: SHOTO, text: onboardingSummonsFor("greeting") },
		]

		await connectedThroughLogin()

		expect(world.sent).toEqual([
			{ botId: SHOTO, text: onboardingSummonsFor("firstCompanion") },
		])
	})

	it("summons nothing again once Shoto already holds both summons", async () => {
		world.threadHistory = [
			{ botId: SHOTO, text: onboardingSummonsFor("greeting") },
			{ botId: SHOTO, text: onboardingSummonsFor("firstCompanion") },
		]

		await connectedThroughLogin()

		expect(world.sent).toEqual([])
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

	it("stores the created companion as the first one before the account step", async () => {
		let release = () => {}
		const storing = new Promise<void>((resolve) => {
			release = resolve
		})
		world.storeFirstCompanion = async (botId) => {
			await storing
			world.firstCompanion = botId
		}
		await connectedThroughLogin()
		controller.noteCreated(SCOUT)

		const reachingAccount = controller.noteFirstRunDone()
		await flushed()

		expect(world.stored).toEqual(["connect"])
		release()
		await reachingAccount
		expect(world.firstCompanion).toBe(SCOUT.id)
		expect(world.stored).toEqual(["connect", "account"])
	})

	it("keeps the first companion the preferences already hold", async () => {
		world.firstCompanion = "bot-atlas"
		await connectedThroughLogin()

		controller.noteCreated(SCOUT)
		await controller.noteFirstRunDone()

		expect(world.firstCompanion).toBe("bot-atlas")
	})

	it("stores account once Shoto marks the first run done", async () => {
		await connectedThroughLogin()
		controller.noteCreated(SCOUT)

		await controller.noteFirstRunDone()

		expect(world.stored).toEqual(["connect", "account"])
		expect(controller.getState().isWithShoto).toBe(false)
		expect(onboardingCreationOf(controller.getState())).toBeNull()
	})

	it("shows Account when a preferences read answers done after the account write", async () => {
		await connectedThroughLogin()
		await controller.noteFirstRunDone()

		world.step = "done"

		expect(onboardingScreenStepOf(world.step, controller.getState())).toBe(
			"account",
		)
	})

	it("shows Account when a preferences read answers done before the account write", async () => {
		await connectedThroughLogin()
		world.step = "done"

		await controller.noteFirstRunDone()

		expect(world.step).toBe("account")
		expect(onboardingScreenStepOf(world.step, controller.getState())).toBe(
			"account",
		)
	})

	it("opens the created companion on Skip even after a read answered done", async () => {
		await connectedThroughLogin()
		controller.noteCreated(SCOUT)
		await controller.noteFirstRunDone()
		world.step = "done"
		world.opened = []
		world.sent = []

		await controller.finish()

		expect(onboardingScreenStepOf(world.step, controller.getState())).toBeNull()
		expect(world.opened).toEqual([SCOUT.id])
		expect(world.sent).toEqual([
			{ botId: SCOUT.id, text: onboardingSummonsFor("arrival") },
		])
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

	it("lands once on the stored first companion when the app relaunched on Account", async () => {
		world.step = "account"
		world.firstCompanion = SCOUT.id

		await controller.finish()
		await controller.finish()

		expect(world.opened).toEqual([SCOUT.id, SCOUT.id])
		expect(world.sent).toEqual([
			{ botId: SCOUT.id, text: onboardingSummonsFor("arrival") },
		])
	})

	it("sends no arrival greeting already in the companion's conversation", async () => {
		world.firstCompanion = SCOUT.id
		world.threadHistory = [
			{ botId: SCOUT.id, text: onboardingSummonsFor("arrival") },
		]

		await controller.finish()

		expect(world.opened).toEqual([SCOUT.id])
		expect(world.sent).toEqual([])
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

	it("runs the journey with the stored Shoto while another companion is selected", async () => {
		const opened: string[] = []
		const sent: string[] = []
		const selected: string[] = []
		const user = {
			getState: () => ({
				preferences: { onboardingShotoId: SHOTO, onboardingStep: "done" },
			}),
			setOnboardingStep: async () => {},
			replayOnboarding: async () => {},
		} as unknown as UserController
		const roster = {
			getState: () => ({ selectedBotId: SCOUT.id, spaceRowId: null, bots: [] }),
			select: (botId: string) => selected.push(botId),
		} as unknown as RosterController
		const chat = {
			openAside: async (botId: string) => {
				opened.push(botId)
			},
			sendTo: async (_botId: string, text: string) => {
				sent.push(text)
			},
			stateFor: () => ({ ...initialChatState, turn: "failed" }),
			subscribe: () => () => {},
		} as unknown as ChatController
		const replayed = createOnboardingFlowController(
			port,
			onboardingFlowWorldOf({ chat, roster, user }),
			{ reportFailure },
		)
		port.report = LOGGED_IN

		await replayed.replay()
		await replayed.leaveIntro()
		await replayed.acceptAccount()
		await flushed()

		expect(replayed.getState().shotoId).toBe(SHOTO)
		expect(opened).toEqual([SHOTO])
		expect(selected).toEqual([SHOTO])
		expect(sent).toEqual([onboardingSummonsFor("greeting")])
	})
})
