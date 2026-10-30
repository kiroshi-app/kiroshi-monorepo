import { beforeEach, describe, expect, it } from "vitest"

import "@workspace/ui/lib/i18n"

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
import {
	type OnboardingStepQuestion,
	onboardingStepOf,
} from "./onboarding-steps"
import { onboardingSummonsFor, type SummonOutcome } from "./onboarding-summons"

import type { AccountReport } from "../agent/contract"

const SIGN_IN_URL = "https://claude.ai/oauth/authorize?code=true"

const CODE = "code#state"

const API_KEY = "sk-ant-secret"

const PENDING: SummonOutcome = { kind: "pending" }

const ANSWERED: SummonOutcome = { kind: "answered" }

const NOT_AUTHENTICATED: AccountReport = {
	connection: "ready",
	binaryVersion: null,
	authenticated: false,
	error: { kind: "notAuthenticated" },
	account: null,
}

const DETECTED: AccountReport = {
	connection: "ready",
	binaryVersion: null,
	authenticated: true,
	error: null,
	account: { email: "reader@example.com", plan: null },
}

let port: FakeOnboardingPort
let world: FakeOnboardingWorld
let controller: OnboardingController

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const stepOf = (outcome: SummonOutcome = PENDING): OnboardingStepQuestion => {
	const step = onboardingStepOf(controller.getState(), outcome, controller)
	if (!step) {
		throw new Error("The onboarding asks nothing")
	}
	return step
}

const askedOf = (step: OnboardingStepQuestion) => {
	const [asked] = step.request.questions
	if (!asked) {
		throw new Error("The step holds no question")
	}
	return asked
}

const labelsOf = (step: OnboardingStepQuestion) =>
	askedOf(step).options.map(({ label }) => label)

const answer = (step: OnboardingStepQuestion, value: string) =>
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

beforeEach(async () => {
	port = createFakeOnboardingPort()
	world = createFakeOnboardingWorld()
	controller = createOnboardingController(port, world, {
		reportFailure: () => undefined,
	})
})

describe("the welcome step", () => {
	it("is asked by options alone", () => {
		const step = stepOf()

		expect(askedOf(step).question).toBe("Ready to start?")
		expect(askedOf(step).optionsOnly).toBe(true)
		expect(labelsOf(step)).toEqual(["Start", "Tell me more first"])
		expect(step.request.isPosted).toBe(true)
	})

	it("refuses an answer matching no option and asks on", async () => {
		const step = stepOf()

		await expect(answer(step, "with an API key")).rejects.toEqual({
			kind: "unmatchedChoice",
		})
		expect(commands()).toEqual([])
		expect(controller.getState().step).toBe("welcome")
	})

	it("starts on Start", async () => {
		port.report = NOT_AUTHENTICATED

		await answer(stepOf(), "Start")

		expect(commands()).toEqual(["account"])
		expect(controller.getState().connection).toEqual({ state: "offer" })
	})

	it("asks what the companion is for on Tell me more first", async () => {
		port.report = { ...DETECTED, account: { email: null, plan: null } }

		await answer(stepOf(), "Tell me more first")

		expect(world.sent).toEqual([onboardingSummonsFor("purpose")])
	})
})

describe("the account step", () => {
	beforeEach(async () => {
		port.report = DETECTED
		await controller.start()
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

		expect(controller.getState().step).toBe("summoned")
	})

	it("offers the sign-in on Use another account", async () => {
		await answer(stepOf(), "Use another account")

		expect(controller.getState().connection).toEqual({
			state: "anotherAccount",
		})
	})
})

describe("the access step", () => {
	beforeEach(async () => {
		port.report = NOT_AUTHENTICATED
		await controller.start()
	})

	it("forks between signing in and pasting a key", () => {
		expect(labelsOf(stepOf())).toEqual([
			"Sign in with Claude",
			"Paste an API key",
		])
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
	beforeEach(async () => {
		port.report = NOT_AUTHENTICATED
		await controller.start()
		await waitingOnCode()
	})

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
	beforeEach(async () => {
		port.report = NOT_AUTHENTICATED
		await controller.start()
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
		port.report = NOT_AUTHENTICATED
		await controller.start()
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
		expect(world.sent).toHaveLength(1)
	})
})

describe("the refused sign-in", () => {
	beforeEach(async () => {
		port.report = NOT_AUTHENTICATED
		await controller.start()
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

describe("the first reply step", () => {
	beforeEach(async () => {
		port.report = { ...DETECTED, account: { email: null, plan: null } }
		await controller.start()
	})

	it("asks nothing before the reply came back", () => {
		expect(
			onboardingStepOf(controller.getState(), PENDING, controller),
		).toBeNull()
	})

	it("summons Shoto for the first companion on Pick my first agent", async () => {
		await answer(stepOf(ANSWERED), "Pick my first agent")

		expect(world.sent.at(-1)).toBe(onboardingSummonsFor("firstCompanion"))
		expect(controller.getState().step).toBe("done")
		expect(world.firstRunDone).toBe(1)
	})

	it("ends the first run on Keep talking first", async () => {
		await answer(stepOf(ANSWERED), "Keep talking first")

		expect(controller.getState().step).toBe("done")
		expect(world.firstRunDone).toBe(1)
	})

	it("keeps its id while it stays on screen", () => {
		expect(stepOf(ANSWERED).request.id).toBe(stepOf(ANSWERED).request.id)
	})
})
