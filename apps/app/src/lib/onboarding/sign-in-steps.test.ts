import { beforeEach, describe, expect, it } from "vitest"

import "@workspace/ui/lib/i18n"

import {
	createFakeOnboardingPort,
	type FakeOnboardingPort,
} from "./fake-onboarding-port"
import {
	createSignInController,
	type SignInController,
} from "./sign-in-controller"
import { type SignInStep, signInStepOf } from "./sign-in-steps"

import type { AccountReport } from "../agent/contract"

const BOT = "bot-1"

const OTHER_BOT = "bot-other"

const SIGN_IN_URL = "https://claude.ai/oauth/authorize?code=true"

const CODE = "code#state"

const API_KEY = "sk-ant-secret"

const DETECTED: AccountReport = {
	connection: "ready",
	binaryVersion: null,
	authenticated: true,
	error: null,
	account: { email: "reader@example.com", plan: null },
}

let port: FakeOnboardingPort
let controller: SignInController
let reopened: string[]

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const signInOf = (signInController: SignInController) => ({
	state: signInController.getState(),
	controller: signInController,
})

const stepOf = (): SignInStep => {
	const step = signInStepOf(signInOf(controller), BOT)
	if (!step) {
		throw new Error("The sign-in asks nothing")
	}
	return step
}

const askedOf = (step: SignInStep) => {
	const [asked] = step.request.questions
	if (!asked) {
		throw new Error("The step holds no question")
	}
	return asked
}

const labelsOf = (step: SignInStep) =>
	askedOf(step).options.map(({ label }) => label)

const answer = (step: SignInStep, value: string) =>
	step.onAnswers({ [askedOf(step).question]: value })

const commands = () => port.calls.map(({ command }) => command)

const signingIn = async () => {
	void answer(stepOf(), "Sign in with Claude")
	await flush()
}

const waitingOnCode = async () => {
	await signingIn()
	port.announceStarted(SIGN_IN_URL)
	await flush()
}

beforeEach(() => {
	port = createFakeOnboardingPort()
	reopened = []
	controller = createSignInController(port, {
		reopen: async (botId) => {
			reopened.push(botId)
		},
	})
	controller.offer(BOT)
})

describe("the sign-in step of a thread", () => {
	it("asks nothing before the sign-in is offered", () => {
		const idle = createSignInController(port, { reopen: async () => {} })

		expect(signInStepOf(signInOf(idle), BOT)).toBeNull()
	})

	it("asks nothing without a sign-in", () => {
		expect(signInStepOf(undefined, BOT)).toBeNull()
	})

	it("asks nothing in another bot's thread", () => {
		expect(signInStepOf(signInOf(controller), OTHER_BOT)).toBeNull()
	})
})

describe("the account step", () => {
	beforeEach(async () => {
		port.report = DETECTED
		controller.askApiKey()
		await answer(stepOf(), API_KEY)
	})

	it("offers the account found on this machine", () => {
		expect(askedOf(stepOf()).question).toBe(
			"Use the account already on your computer?",
		)
		expect(labelsOf(stepOf())).toEqual([
			"Use this account",
			"Use another account",
		])
	})

	it("settles on Use this account", async () => {
		await answer(stepOf(), "Use this account")

		expect(controller.getState().connection).toBeNull()
		expect(reopened).toEqual([BOT])
	})

	it("offers the sign-in on Use another account", async () => {
		await answer(stepOf(), "Use another account")

		expect(controller.getState().connection).toEqual({
			state: "anotherAccount",
		})
	})
})

describe("the access step", () => {
	it("forks between signing in and pasting a key", () => {
		expect(labelsOf(stepOf())).toEqual([
			"Sign in with Claude",
			"Paste an API key",
		])
	})

	it("refuses an answer matching no option", async () => {
		await expect(answer(stepOf(), "Something else")).rejects.toEqual({
			kind: "unmatchedChoice",
		})
	})

	it("signs in on Sign in with Claude", async () => {
		await signingIn()

		expect(commands()).toContain("signIn")

		port.completeSignIn()
		await flush()
	})

	it("asks for the key on Paste an API key", async () => {
		await answer(stepOf(), "Paste an API key")

		expect(controller.getState().connection).toEqual({ state: "apiKey" })
		expect(commands()).not.toContain("cancelSignIn")
	})
})

describe("the code step", () => {
	beforeEach(waitingOnCode)

	it("carries the announced url as its link", () => {
		const asked = askedOf(stepOf())

		expect(asked.question).toBe("Paste the code Claude gave you")
		expect(asked.link).toEqual({
			label: "Open this link and sign in",
			url: SIGN_IN_URL,
		})
		expect(asked.entry?.isSecret).toBeFalsy()
	})

	it("submits the typed code", async () => {
		await answer(stepOf(), CODE)

		expect(port.calls).toContainEqual({ command: "enterCode", value: CODE })

		port.completeSignIn()
		await flush()
	})

	it("takes a key instead from its exit control", async () => {
		askedOf(stepOf()).exit?.onSelect()
		await flush()

		expect(askedOf(stepOf()).exit).toBeDefined()
		expect(commands()).toContain("cancelSignIn")
		expect(controller.getState().connection).toEqual({ state: "apiKey" })
	})
})

describe("the key step", () => {
	beforeEach(() => {
		controller.askApiKey()
	})

	it("masks the entry", () => {
		const asked = askedOf(stepOf())

		expect(asked.question).toBe("Paste your Anthropic API key")
		expect(asked.entry).toEqual({
			label: "Key",
			placeholder: "sk-ant-…",
			isSecret: true,
		})
	})

	it("holds the typed key", async () => {
		await answer(stepOf(), API_KEY)

		expect(port.calls).toContainEqual({ command: "holdApiKey", value: API_KEY })
	})

	it("signs in from its exit control", async () => {
		askedOf(stepOf()).exit?.onSelect()
		await flush()

		expect(commands()).toContain("signIn")

		port.completeSignIn()
		await flush()
	})

	it("names the refusal and offers another key or the sign-in", async () => {
		port.refusals.holdApiKey = { kind: "unwritable", detail: "read only" }
		await answer(stepOf(), API_KEY)
		const refused = stepOf()

		expect(askedOf(refused).failure).toEqual({
			title: "Couldn’t use that key",
			detail: "read only",
		})
		expect(labelsOf(refused)).toEqual(["Try another key", "Sign in instead"])

		await answer(refused, "Try another key")
		expect(controller.getState().connection).toEqual({ state: "apiKey" })
	})

	it("signs in from the refused key on Sign in instead", async () => {
		port.refusals.holdApiKey = { kind: "unwritable", detail: "read only" }
		await answer(stepOf(), API_KEY)

		void answer(stepOf(), "Sign in instead")
		await flush()

		expect(commands()).toContain("signIn")

		port.completeSignIn()
		await flush()
	})

	it("gives the key step asked again a new id", async () => {
		const first = stepOf().request.id
		port.refusals.holdApiKey = { kind: "unwritable", detail: "read only" }
		await answer(stepOf(), API_KEY)

		await answer(stepOf(), "Try another key")

		expect(stepOf().request.id).not.toBe(first)
	})
})

describe("a refused sign-in whose run is still alive", () => {
	const NEW_SIGN_IN_URL =
		"https://claude.ai/oauth/authorize?code=true&state=again"

	beforeEach(async () => {
		await signingIn()
		port.refusals.openSignInUrl = { kind: "refusedUrl" }
		port.announceStarted(SIGN_IN_URL)
		await flush()
		delete port.refusals.openSignInUrl
	})

	it("reaches the code step of a new run on Try again", async () => {
		expect(askedOf(stepOf()).failure?.title).toBe("Couldn’t sign you in")

		void answer(stepOf(), "Try again")
		await flush()
		port.announceStarted(NEW_SIGN_IN_URL)
		await flush()

		expect(commands()).toContain("cancelSignIn")
		expect(askedOf(stepOf()).link?.url).toBe(NEW_SIGN_IN_URL)
		expect(controller.getState().connection).toEqual({
			state: "waiting",
			signInUrl: NEW_SIGN_IN_URL,
		})

		port.completeSignIn()
		await flush()
		expect(reopened).toEqual([BOT])
	})
})

describe("the refused sign-in", () => {
	beforeEach(async () => {
		await signingIn()
		port.refuseSignIn({ kind: "failed", detail: "auth login exited with 1" })
		await flush()
	})

	it("names the refusal above the question", () => {
		const step = stepOf()

		expect(askedOf(step).failure).toEqual({
			title: "Couldn’t sign you in",
			detail: "auth login exited with 1",
		})
		expect(labelsOf(step)).toEqual(["Try again", "Paste an API key"])
	})

	it("signs in again on Try again", async () => {
		void answer(stepOf(), "Try again")
		await flush()

		expect(commands().filter((command) => command === "signIn")).toHaveLength(2)

		port.completeSignIn()
		await flush()
	})

	it("asks for the key on Paste an API key", async () => {
		await answer(stepOf(), "Paste an API key")

		expect(controller.getState().connection).toEqual({ state: "apiKey" })
	})
})
