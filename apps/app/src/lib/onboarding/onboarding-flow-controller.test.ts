import { beforeEach, describe, expect, it, type Mock, vi } from "vitest"

import {
	type NoticeMessage,
	raiseTransientNotice,
} from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import type {
	ClaudeImported,
	ClaudeImportSession,
} from "./claude-import-controller"
import { importedOf } from "./claude-import-screen"
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

import type { ClaudeInventory } from "@/lib/bindings"
import type { AccountReport } from "../agent/contract"
import type { RosterController } from "../bots/roster-controller"
import type { ChatController } from "../chat/chat-controller"
import { initialChatState } from "../chat/chat-state"
import { message } from "../conversations/transcript-fixtures"
import type { UserController } from "../user/preferences-controller"

vi.mock("@workspace/ui/components/notice-surface", async (importOriginal) => ({
	...(await importOriginal()),
	raiseTransientNotice: vi.fn(),
}))

const SCOUT = { id: "bot-scout", name: "Scout" }

const NOTHING_IMPORTED: ClaudeImported = {
	companions: [],
	hasInstructions: false,
	skillCount: 0,
}

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
	vi.mocked(raiseTransientNotice).mockClear()
	controller = createOnboardingFlowController(port, world, { reportFailure })
})

const connectedThroughLogin = async () => {
	port.report = LOGGED_IN
	await controller.leaveIntro()
	await controller.acceptAccount()
	await flushed()
}

const relaunch = () => {
	port = createFakeOnboardingPort()
	world.opened = []
	world.sent = []
	controller = createOnboardingFlowController(port, world, { reportFailure })
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

describe("relaunching after the account was accepted", () => {
	it("resumes Shoto with no onboarding screen and no login read when no ~/.claude folder was found", async () => {
		await connectedThroughLogin()
		world.threadHistory = [...world.sent]

		relaunch()
		await controller.resume()
		await flushed()

		expect(port.calls).toEqual([])
		expect(onboardingScreenStepOf(world.step, controller.getState())).toBeNull()
		expect(controller.getState().isWithShoto).toBe(true)
		expect(world.opened).toEqual([SHOTO])
		expect(world.sent).toEqual([])
	})

	it("opens Shoto's conversation once when resumed twice at once", async () => {
		await connectedThroughLogin()
		relaunch()

		await Promise.all([controller.resume(), controller.resume()])
		await flushed()

		expect(world.opened).toEqual([SHOTO])
	})

	it("lands on the first companion once Shoto marks the first run done after the relaunch", async () => {
		await connectedThroughLogin()
		relaunch()
		await controller.resume()
		controller.noteCreated(SCOUT)
		await controller.noteFirstRunDone()

		expect(onboardingScreenStepOf(world.step, controller.getState())).toBe(
			"account",
		)

		world.opened = []
		world.sent = []
		await controller.finish()

		expect(onboardingScreenStepOf(world.step, controller.getState())).toBeNull()
		expect(world.opened).toEqual([SCOUT.id])
		expect(world.sent).toEqual([
			{ botId: SCOUT.id, text: onboardingSummonsFor("arrival") },
		])
	})

	it("resumes the import with no login read when a ~/.claude folder was found", async () => {
		port.hasClaudeFolder = true
		await connectedThroughLogin()

		relaunch()
		await controller.resume()

		expect(port.calls).toEqual([])
		expect(onboardingScreenStepOf(world.step, controller.getState())).toBe(
			"import",
		)
		expect(controller.getState().isWithShoto).toBe(false)
	})

	it("resumes nothing once the first run is done", async () => {
		await connectedThroughLogin()
		controller.noteCreated(SCOUT)
		await controller.noteFirstRunDone()
		await controller.finish()

		relaunch()
		await controller.resume()

		expect(port.calls).toEqual([])
		expect(onboardingScreenStepOf(world.step, controller.getState())).toBeNull()
		expect(controller.getState().isWithShoto).toBe(false)
		expect(world.opened).toEqual([])
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

		await controller.leaveImport(NOTHING_IMPORTED)

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
		expect(world.stored).toEqual(["connect", "done"])
		expect(controller.getState().isWithShoto).toBe(true)
	})
})

describe("connecting without a ~/.claude folder", () => {
	it("opens Shoto's conversation and summons his greeting, then the first companion", async () => {
		await connectedThroughLogin()

		expect(world.stored).toEqual(["connect", "done"])
		expect(controller.getState().isWithShoto).toBe(true)
		expect(world.opened).toEqual([SHOTO])
		expect(world.sent).toEqual([
			{ botId: SHOTO, text: onboardingSummonsFor("greeting") },
			{ botId: SHOTO, text: onboardingSummonsFor("firstCompanion") },
		])
	})

	it("keeps the Connect screen and names the failure when the step isn't stored", async () => {
		port.report = LOGGED_IN
		await controller.leaveIntro()
		world.refusesStep = true

		await controller.acceptAccount()
		await flushed()

		expect(reportFailure).toHaveBeenCalledWith({
			title: "Couldn’t send that request",
			description: "disk full",
		})
		expect(onboardingScreenStepOf(world.step, controller.getState())).toBe(
			"connect",
		)
		expect(controller.getState().connection).toEqual({
			state: "detected",
			email: "reader@example.com",
			plan: "Max",
		})
		expect(world.opened).toEqual([])
	})

	it("summons no companion and names the failure when no Shoto is stored", async () => {
		world.shoto = null

		await connectedThroughLogin()

		expect(world.opened).toEqual([])
		expect(world.sent).toEqual([])
		expect(reportFailure).toHaveBeenCalledWith({
			title: i18n.t("chat:onboarding.arrival.firstCompanionMissing"),
			description: i18n.t("chat:onboarding.arrival.unknownCompanion"),
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

		expect(world.stored).toEqual(["connect", "done"])
		release()
		await reachingAccount
		expect(world.firstCompanion).toBe(SCOUT.id)
		expect(world.stored).toEqual(["connect", "done", "account"])
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

		expect(world.stored).toEqual(["connect", "done", "account"])
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

	it("marks the first run done before storing done", async () => {
		const order: string[] = []
		world.markFirstRunDone = async () => {
			order.push("firstRunDone")
		}
		world.storeStep = async (step) => {
			order.push(step)
		}

		await controller.finish()

		expect(order).toEqual(["firstRunDone", "done"])
	})

	it("keeps Account and names the failure when the first run can't be marked done", async () => {
		await connectedThroughLogin()
		controller.noteCreated(SCOUT)
		await controller.noteFirstRunDone()
		world.opened = []
		world.refusesFirstRunDone = true

		await controller.finish()

		expect(reportFailure).toHaveBeenCalledWith({
			title: "Couldn’t send that request",
			description: "disk full",
		})
		expect(world.step).toBe("account")
		expect(onboardingScreenStepOf(world.step, controller.getState())).toBe(
			"account",
		)
		expect(world.opened).toEqual([])
	})

	it("shows Account and leaves Shoto closed on a relaunch after the first run couldn't be marked done", async () => {
		port.hasClaudeFolder = true
		await connectedThroughLogin()
		await controller.leaveImport(NOTHING_IMPORTED)
		world.refusesFirstRunDone = true
		await controller.finish()
		relaunch()

		await controller.resume()
		await flushed()

		expect(onboardingScreenStepOf(world.step, controller.getState())).toBe(
			"account",
		)
		expect(port.calls).toEqual([])
		expect(world.opened).toEqual([])
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

describe("landing after an import", () => {
	const ALL_FAILED: ClaudeImportSession = {
		unchecked: [],
		selection: ["agent:atlas", "skill:changelog"],
		results: {
			"agent:atlas": { kind: "failed", cause: "unparsable" },
			"skill:changelog": { kind: "failed", cause: "unparsable" },
		},
		isImporting: false,
	}

	const ATLAS_AND_CHANGELOG: ClaudeInventory = {
		kind: "found",
		agents: [
			{
				key: "agent:atlas",
				name: "Atlas",
				description: "",
				alreadyImported: false,
			},
		],
		skills: [
			{
				key: "skill:changelog",
				name: "changelog",
				description: "",
				alreadyImported: false,
			},
		],
		claudeMd: null,
	}

	const finishedAfter = async (imported: ClaudeImported) => {
		port.hasClaudeFolder = true
		await connectedThroughLogin()
		await controller.leaveImport(imported)
		await controller.finish()
	}

	it.each<[string, ClaudeImported]>([
		["companions", { ...NOTHING_IMPORTED, companions: ["Atlas", "Wren"] }],
		["CLAUDE.md", { ...NOTHING_IMPORTED, hasInstructions: true }],
		["skills", { ...NOTHING_IMPORTED, skillCount: 4 }],
		[
			"companions, CLAUDE.md and skills",
			{ companions: ["Atlas"], hasInstructions: true, skillCount: 1 },
		],
		["nothing", NOTHING_IMPORTED],
		["items that all failed", importedOf(ATLAS_AND_CHANGELOG, ALL_FAILED)],
	])("raises no notice after importing %s", async (_, imported) => {
		await finishedAfter(imported)

		expect(world.stored.at(-1)).toBe("done")
		expect(raiseTransientNotice).not.toHaveBeenCalled()
	})

	it("opens the stored first companion when nothing came over", async () => {
		world.firstCompanion = SCOUT.id

		await finishedAfter(importedOf(ATLAS_AND_CHANGELOG, ALL_FAILED))

		expect(world.opened).toEqual([SCOUT.id])
	})

	it("opens Shoto rather than the stored first companion and greets him once", async () => {
		world.firstCompanion = SCOUT.id

		await finishedAfter({ ...NOTHING_IMPORTED, skillCount: 1 })

		expect(world.opened).toEqual([SHOTO])
		expect(world.sent).toEqual([
			{ botId: SHOTO, text: onboardingSummonsFor("greeting") },
		])
	})

	it("greets Shoto once however many times the run finishes", async () => {
		await finishedAfter({ ...NOTHING_IMPORTED, companions: ["Atlas"] })
		await controller.finish()

		expect(world.opened).toEqual([SHOTO, SHOTO])
		expect(world.sent).toEqual([
			{ botId: SHOTO, text: onboardingSummonsFor("greeting") },
		])
	})

	it("sends no greeting already in Shoto's conversation", async () => {
		world.threadHistory = [
			{ botId: SHOTO, text: onboardingSummonsFor("greeting") },
		]

		await finishedAfter({ ...NOTHING_IMPORTED, companions: ["Atlas"] })

		expect(world.opened).toEqual([SHOTO])
		expect(world.sent).toEqual([])
	})

	it("opens nothing and names the failure when no Shoto is stored", async () => {
		world.shoto = null
		world.firstCompanion = SCOUT.id

		await finishedAfter({ ...NOTHING_IMPORTED, companions: ["Atlas"] })

		expect(world.opened).toEqual([])
		expect(world.sent).toEqual([])
		expect(reportFailure).toHaveBeenCalledWith({
			title: i18n.t("chat:onboarding.arrival.firstCompanionMissing"),
			description: i18n.t("chat:onboarding.arrival.unknownCompanion"),
		})
	})

	it("names Shoto when he couldn't say hello", async () => {
		world.names = { [SHOTO]: "Shoto" }
		world.sendTo = () => Promise.reject(new Error("socket closed"))

		await finishedAfter({ ...NOTHING_IMPORTED, companions: ["Atlas"] })

		expect(reportFailure).toHaveBeenCalledWith({
			title: "Shoto couldn’t say hello",
			description: "socket closed",
		})
	})

	it("still lands on the stored first companion when the import was skipped", async () => {
		world.firstCompanion = SCOUT.id

		await finishedAfter(NOTHING_IMPORTED)

		expect(world.opened).toEqual([SCOUT.id])
		expect(world.sent).toEqual([
			{ botId: SCOUT.id, text: onboardingSummonsFor("arrival") },
		])
	})

	it("lands on the stored first companion when the app relaunched after the import", async () => {
		world.step = "account"
		world.firstCompanion = SCOUT.id

		await controller.finish()

		expect(world.opened).toEqual([SCOUT.id])
		expect(world.sent).toEqual([
			{ botId: SCOUT.id, text: onboardingSummonsFor("arrival") },
		])
	})

	it("lands on the stored first companion again after a replay", async () => {
		port.hasClaudeFolder = true
		await connectedThroughLogin()
		await controller.leaveImport({ ...NOTHING_IMPORTED, companions: ["Atlas"] })
		await controller.replay()
		world.firstCompanion = SCOUT.id

		await controller.finish()

		expect(world.opened).toEqual([SCOUT.id])
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

describe("a Shoto thread holding the previous first agent summons", () => {
	it("sends nothing again once the greeting is answered", async () => {
		const sent: string[] = []
		const previousFirstCompanion = onboardingSummonsFor(
			"firstCompanion",
		).replace("their first agent.", "their first companion.")
		const user = {
			getState: () => ({
				preferences: { onboardingShotoId: SHOTO, onboardingStep: "done" },
			}),
			setOnboardingStep: async () => {},
			replayOnboarding: async () => {},
		} as unknown as UserController
		const roster = {
			getState: () => ({ selectedBotId: SHOTO, spaceRowId: null, bots: [] }),
			select: () => {},
		} as unknown as RosterController
		const chat = {
			openAside: async () => {},
			sendTo: async (_botId: string, text: string) => {
				sent.push(text)
			},
			stateFor: () => ({
				...initialChatState,
				messages: [
					message({
						id: "m-greeting",
						turnId: "t-greeting",
						role: "user",
						content: onboardingSummonsFor("greeting"),
					}),
					message({ id: "m-hello", turnId: "t-greeting", content: "Hello." }),
					message({
						id: "m-first",
						turnId: "t-first",
						role: "user",
						content: previousFirstCompanion,
					}),
				],
			}),
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

		expect(sent).toEqual([])
		expect(reportFailure).not.toHaveBeenCalled()
	})
})
