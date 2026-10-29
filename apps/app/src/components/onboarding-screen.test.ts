// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createElement, useState } from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import "@workspace/ui/lib/i18n"

import { OnboardingScreen } from "@/components/onboarding-screen"
import type { WatchedAccount } from "@/lib/account/use-account"
import type { AccountReport } from "@/lib/agent/contract"
import type { OnboardingStep } from "@/lib/bindings"
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

beforeEach(() => {
	port = createFakeOnboardingPort()
	world = createFakeFlowWorld()
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
		expect(heading()).toBe("Bring in your Claude Code setup")
		await press("Skip for now")
		expect(world.stored.at(-1)).toBe("account")
		expect(heading()).toBe("Sign in to Kiroshi")

		await press("Skip for now")

		expect(world.stored.at(-1)).toBe("done")
		expect(world.firstRunDone).toBe(1)
		expect(screen.queryByRole("heading")).toBeNull()
	})

	it("resumes on the stored step", async () => {
		world.step = "account"
		await renderOnboarding()

		expect(screen.getByRole("button", { name: "Skip for now" })).toBeTruthy()
	})
})
