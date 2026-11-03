import type { OnboardingFlowWorld } from "./onboarding-flow-controller"
import type { SummonOutcome } from "./onboarding-summons"

import type { OnboardingStep } from "@/lib/bindings"

export const SHOTO = "bot-shoto"

const UNREACHABLE = { kind: "transport", detail: "the host is unreachable" }

type Sent = { botId: string; text: string }

type FakeProfile = {
	isShotoRunOwed: boolean
	isShotoRunHeld: boolean
}

const createFakeProfile = (): FakeProfile => ({
	isShotoRunOwed: false,
	isShotoRunHeld: false,
})

export type FakeFlowWorld = OnboardingFlowWorld & {
	step: OnboardingStep
	stored: OnboardingStep[]
	opened: string[]
	sent: Sent[]
	threadHistory: Sent[]
	replays: number
	firstRunDone: number
	refusesStep: boolean
	refusesFirstRunDone: boolean
	profile: FakeProfile
	refusesOpen: boolean
	unsendable: string[]
	shoto: string | null
	firstCompanion: string | null
	names: Record<string, string>
	greetingOutcome: SummonOutcome
}

export const createFakeFlowWorld = (
	profile: FakeProfile = createFakeProfile(),
): FakeFlowWorld => {
	const fake: FakeFlowWorld = {
		step: "welcome",
		stored: [],
		opened: [],
		sent: [],
		threadHistory: [],
		replays: 0,
		firstRunDone: 0,
		refusesStep: false,
		refusesFirstRunDone: false,
		profile,
		refusesOpen: false,
		unsendable: [],
		shoto: SHOTO,
		firstCompanion: null,
		names: {},
		greetingOutcome: { kind: "answered" },

		storedStep: () => fake.step,
		isFirstRunDone: () => fake.firstRunDone > 0,
		storeStep: async (step) => {
			if (fake.refusesStep) {
				throw { kind: "storage", detail: "disk full" }
			}
			fake.stored.push(step)
			fake.step = step
		},
		replay: async () => {
			fake.replays += 1
			fake.step = "welcome"
			fake.firstCompanion = null
		},
		markFirstRunDone: async () => {
			if (fake.refusesFirstRunDone) {
				throw { kind: "storage", detail: "disk full" }
			}
			fake.firstRunDone += 1
		},
		isShotoRunOwed: () => fake.profile.isShotoRunOwed,
		oweShotoRun: () => {
			fake.profile.isShotoRunOwed = true
		},
		clearShotoRunOwed: () => {
			fake.profile.isShotoRunOwed = false
		},
		holdShotoRun: async (run) => {
			if (fake.profile.isShotoRunHeld) {
				return
			}
			fake.profile.isShotoRunHeld = true
			try {
				await run()
			} finally {
				fake.profile.isShotoRunHeld = false
			}
		},
		shotoId: () => fake.shoto,
		firstCompanionId: () => fake.firstCompanion,
		storeFirstCompanion: async (botId) => {
			fake.firstCompanion = botId
		},
		botNameOf: (botId) => fake.names[botId] ?? null,
		openConversation: async (botId) => {
			if (fake.refusesOpen) {
				throw UNREACHABLE
			}
			fake.opened.push(botId)
		},
		sendTo: async (botId, text) => {
			if (fake.unsendable.includes(text)) {
				throw UNREACHABLE
			}
			fake.sent.push({ botId, text })
		},
		hasSummoned: (botId, summons) =>
			[...fake.threadHistory, ...fake.sent].some(
				(sent) => sent.botId === botId && sent.text === summons,
			),
		outcomeOf: async () => fake.greetingOutcome,
	}

	return fake
}
