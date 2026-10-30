import { beforeEach, describe, expect, it, type Mock, vi } from "vitest"

import type { NoticeMessage } from "@workspace/ui/components/notice-surface"

import {
	createFakeOnboardingPort,
	type FakeOnboardingPort,
} from "./fake-onboarding-port"
import {
	createFakeOnboardingWorld,
	type FakeOnboardingWorld,
} from "./fake-onboarding-world"
import {
	createOnboardingController,
	type OnboardingController,
} from "./onboarding-controller"
import { onboardingSummonsFor } from "./onboarding-summons"

import type { TransportError as HostTransportError } from "@/lib/bindings"
import type { AccountReport } from "../agent/contract"
import type { CompanionCreated } from "../companions/companions-transport"

const SIGN_IN_URL = "https://claude.ai/oauth/authorize?code=true"

const EMAIL = "reader@example.com"

const API_KEY = "sk-ant-secret"

const CODE = "code#state"

const CREATED_SCOUT: CompanionCreated = { id: "bot-scout", name: "Scout" }

const authenticated = (account?: {
	email: string | null
	plan: string | null
}): AccountReport => ({
	connection: "ready",
	binaryVersion: null,
	authenticated: true,
	error: null,
	account: account ?? null,
})

const NOT_AUTHENTICATED: AccountReport = {
	connection: "ready",
	binaryVersion: null,
	authenticated: false,
	error: { kind: "notAuthenticated" },
	account: null,
}

const refusedRead = (error: HostTransportError): AccountReport => ({
	connection: "unavailable",
	binaryVersion: null,
	authenticated: false,
	error,
	account: null,
})

let port: FakeOnboardingPort
let world: FakeOnboardingWorld
let controller: OnboardingController
let reportFailure: Mock<(notice: NoticeMessage) => void>

const createController = () => {
	port = createFakeOnboardingPort()
	world = createFakeOnboardingWorld()
	reportFailure = vi.fn<(notice: NoticeMessage) => void>()

	return createOnboardingController(port, world, { reportFailure })
}

const commands = () => port.calls.map(({ command }) => command)

const flushed = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
	controller = createController()
})

describe("the welcome step", () => {
	it("opens on the welcome step", () => {
		expect(controller.getState().step).toBe("welcome")
		expect(controller.getState().connection).toBeNull()
	})

	it("reads the account when the reader starts", async () => {
		port.report = NOT_AUTHENTICATED

		await controller.start()

		expect(commands()).toEqual(["account"])
	})

	it("reads the account when the reader asks to hear more first", async () => {
		port.report = NOT_AUTHENTICATED

		await controller.tellMore()

		expect(commands()).toEqual(["account"])
	})
})

describe("reading the account", () => {
	it("names the email and the plan of the detected account from one account read", async () => {
		port.report = authenticated({ email: EMAIL, plan: "Max" })

		await controller.start()

		expect(commands()).toEqual(["account"])
		expect(controller.getState().connection).toEqual({
			state: "detected",
			email: EMAIL,
			plan: "Max",
		})
	})

	it("names the email alone when the report carries no plan", async () => {
		port.report = authenticated({ email: EMAIL, plan: null })

		await controller.start()

		expect(controller.getState().connection).toEqual({
			state: "detected",
			email: EMAIL,
			plan: null,
		})
	})

	it("settles without a connection step when the report carries no email", async () => {
		port.report = authenticated({ email: null, plan: null })

		await controller.start()

		expect(controller.getState().step).toBe("summoned")
		expect(controller.getState().connection).toBeNull()
	})

	it("offers the sign-in when nobody is authenticated", async () => {
		port.report = NOT_AUTHENTICATED

		await controller.start()

		expect(controller.getState().connection).toEqual({ state: "offer" })
	})

	it("fails visibly when the report carries a reason of its own", async () => {
		port.report = refusedRead({ kind: "spawnFailed", detail: "no binary" })

		await controller.start()

		expect(controller.getState().connection).toEqual({
			state: "signInFailed",
			exitDetail: "no binary",
			failure: "agentMissing",
		})
	})

	it("says in words what a report with no detail carries", async () => {
		port.report = refusedRead({ kind: "binaryNotFound", searched: [] })

		await controller.start()

		expect(controller.getState().connection).toEqual({
			state: "signInFailed",
			exitDetail: "the agent binary wasn’t found",
			failure: "agentMissing",
		})
	})
})

describe("the detected account", () => {
	beforeEach(async () => {
		port.report = authenticated({ email: EMAIL, plan: null })
		await controller.start()
	})

	it("settles on the account the reader keeps", async () => {
		await controller.acceptAccount()

		expect(controller.getState().step).toBe("summoned")
	})

	it("offers the sign-in when the reader wants another account", () => {
		controller.changeAccount()

		expect(controller.getState().connection).toEqual({
			state: "anotherAccount",
		})
	})
})

describe("signing in", () => {
	beforeEach(async () => {
		port.report = NOT_AUTHENTICATED
		await controller.start()
	})

	it("opens the announced url and waits on it", async () => {
		const signingIn = controller.signIn()
		await Promise.resolve()
		port.announceStarted(SIGN_IN_URL)
		await Promise.resolve()

		expect(controller.getState().connection).toEqual({
			state: "waiting",
			signInUrl: SIGN_IN_URL,
		})
		expect(port.calls).toContainEqual({
			command: "openSignInUrl",
			value: SIGN_IN_URL,
		})

		port.completeSignIn()
		await signingIn
	})

	it("frees the code step once the browser step is on screen", async () => {
		const signingIn = controller.signIn()
		await Promise.resolve()
		expect(controller.getState().isBusy).toBe(true)

		port.announceStarted(SIGN_IN_URL)
		await Promise.resolve()
		expect(controller.getState().isBusy).toBe(false)

		port.completeSignIn()
		await signingIn
	})

	it("settles once the sign-in lands", async () => {
		const signingIn = controller.signIn()
		await Promise.resolve()
		port.completeSignIn()
		await signingIn

		expect(controller.getState().step).toBe("summoned")
	})

	it("shows the detail the rejection carries", async () => {
		const signingIn = controller.signIn()
		await Promise.resolve()
		port.refuseSignIn({ kind: "failed", detail: "auth login exited with 1" })
		await signingIn

		expect(controller.getState().connection).toEqual({
			state: "signInFailed",
			exitDetail: "auth login exited with 1",
			failure: "cancelled",
		})
	})

	it("ends the running sign-in and starts a new one when the reader asks again", async () => {
		const first = controller.signIn()
		await flushed()

		const second = controller.signIn()
		await flushed()
		port.announceStarted(SIGN_IN_URL)
		await flushed()

		expect(commands()).toEqual([
			"account",
			"signIn",
			"cancelSignIn",
			"signIn",
			"openSignInUrl",
		])
		expect(controller.getState().connection).toEqual({
			state: "waiting",
			signInUrl: SIGN_IN_URL,
		})

		port.completeSignIn()
		await Promise.all([first, second])
		expect(controller.getState().step).toBe("summoned")
		expect(world.sent).toHaveLength(1)
	})

	it("says in words what a rejection with no detail carries", async () => {
		const signingIn = controller.signIn()
		await Promise.resolve()
		port.refuseSignIn({ kind: "timedOut" })
		await signingIn

		expect(controller.getState().connection).toEqual({
			state: "signInFailed",
			exitDetail: "the sign-in timed out",
			failure: "timedOut",
		})
	})

	it("sends the code the reader submits", async () => {
		const signingIn = controller.signIn()
		await Promise.resolve()
		port.announceStarted(SIGN_IN_URL)
		await controller.submitCode(CODE)

		expect(port.calls).toContainEqual({ command: "enterCode", value: CODE })

		port.completeSignIn()
		await signingIn
	})

	it("leaves the step alone when the code lands on no running sign-in", async () => {
		const signingIn = controller.signIn()
		await Promise.resolve()
		port.announceStarted(SIGN_IN_URL)
		await Promise.resolve()
		port.refusals.enterCode = { kind: "notRunning" }

		await controller.submitCode(CODE)

		expect(controller.getState().connection).toEqual({
			state: "waiting",
			signInUrl: SIGN_IN_URL,
		})

		port.completeSignIn()
		await signingIn
	})

	it("asks for the key when the reader takes it instead", async () => {
		const signingIn = controller.signIn()
		await Promise.resolve()
		port.announceStarted(SIGN_IN_URL)
		await Promise.resolve()

		await controller.pasteKeyInstead()
		await signingIn

		expect(commands()).toContain("cancelSignIn")
		expect(controller.getState().connection).toEqual({ state: "apiKey" })
	})

	it("raises no notice when the cancel lands on no running sign-in", async () => {
		port.refusals.cancelSignIn = { kind: "notRunning" }

		await controller.pasteKeyInstead()

		expect(controller.getState().connection).toEqual({ state: "apiKey" })
	})
})

describe("the api key", () => {
	beforeEach(async () => {
		port.report = NOT_AUTHENTICATED
		await controller.start()
	})

	it("asks for the key when the reader picks it", () => {
		controller.askApiKey()

		expect(controller.getState().connection).toEqual({ state: "apiKey" })
	})

	it("counts a new round for every step it shows", () => {
		const offered = controller.getState().round

		controller.askApiKey()

		expect(controller.getState().round).toBe(offered + 1)
	})

	it("ends the running sign-in before holding the key", async () => {
		port.refusals.cancelSignIn = { kind: "notRunning" }
		port.report = authenticated({ email: null, plan: null })
		controller.askApiKey()
		const signingIn = controller.signIn()
		await flushed()

		await controller.submitApiKey(API_KEY)
		port.announceStarted(SIGN_IN_URL)
		port.completeSignIn()
		await signingIn

		expect(commands().indexOf("cancelSignIn")).toBeGreaterThan(-1)
		expect(commands().indexOf("cancelSignIn")).toBeLessThan(
			commands().indexOf("holdApiKey"),
		)
		expect(world.sent).toHaveLength(1)
		expect(controller.getState().connection).toBeNull()
	})

	it("holds the key and reads the account again", async () => {
		port.report = authenticated({ email: EMAIL, plan: null })

		await controller.submitApiKey(API_KEY)

		expect(port.calls).toContainEqual({
			command: "holdApiKey",
			value: API_KEY,
		})
		expect(commands().at(-1)).toBe("account")
		expect(controller.getState().connection).toEqual({
			state: "detected",
			email: EMAIL,
			plan: null,
		})
	})

	it("fails visibly when the key is refused", async () => {
		port.refusals.holdApiKey = { kind: "unwritable", detail: "read only" }

		await controller.submitApiKey(API_KEY)

		expect(controller.getState().connection).toEqual({
			state: "apiKeyFailed",
			exitDetail: "read only",
		})
	})
})

describe("the summons", () => {
	it("asks for a greeting when the reader started", async () => {
		port.report = authenticated({ email: null, plan: null })

		await controller.start()

		expect(world.sent).toEqual([onboardingSummonsFor("greeting")])
	})

	it("asks what the companion is for when the reader wanted to hear more", async () => {
		port.report = authenticated({ email: null, plan: null })

		await controller.tellMore()

		expect(world.sent).toEqual([onboardingSummonsFor("purpose")])
	})

	it("summons again when the reader retries the failed turn", async () => {
		port.report = authenticated({ email: null, plan: null })
		await controller.start()

		await controller.summonAgain()

		expect(world.sent).toHaveLength(2)
	})
})

describe("the end of the first run", () => {
	it("marks the first run done and leaves no connection step", async () => {
		port.report = authenticated({ email: null, plan: null })
		await controller.start()

		await controller.finish()

		expect(controller.getState().step).toBe("done")
		expect(controller.getState().connection).toBeNull()
		expect(world.firstRunDone).toBe(1)
	})
})

describe("the first companion", () => {
	beforeEach(async () => {
		port.report = authenticated({ email: null, plan: null })
		await controller.start()
	})

	it("summons Shoto to find the first companion when the reader picks", async () => {
		await controller.pickCompanion()

		expect(world.sent.at(-1)).toBe(onboardingSummonsFor("firstCompanion"))
		expect(controller.getState().step).toBe("done")
	})

	it("closes the first run when the reader picks", async () => {
		await controller.pickCompanion()

		expect(world.firstRunDone).toBe(1)
	})

	it("starts the created companion first turn in its own conversation", async () => {
		await controller.greetCompanion(CREATED_SCOUT)

		expect(world.greetings).toEqual([
			{ botId: CREATED_SCOUT.id, text: onboardingSummonsFor("arrival") },
		])
	})

	it("names the created companion when its first turn fails to start", async () => {
		world.refusals.greet = { kind: "crashed", detail: "the agent stopped" }

		await controller.greetCompanion(CREATED_SCOUT)

		expect(reportFailure).toHaveBeenCalledWith({
			title: `${CREATED_SCOUT.name} couldn’t say hello`,
			description: "the agent stopped",
		})
	})
})
