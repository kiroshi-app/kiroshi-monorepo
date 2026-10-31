import type { OnboardingFlowWorld } from "./onboarding-flow-controller"
import type { SummonOutcome } from "./onboarding-summons"

import type { OnboardingStep } from "@/lib/bindings"

export const SHOTO = "bot-shoto"

type Sent = { botId: string; text: string }

export type FakeFlowWorld = OnboardingFlowWorld & {
	step: OnboardingStep
	stored: OnboardingStep[]
	opened: string[]
	sent: Sent[]
	threadHistory: Sent[]
	replays: number
	firstRunDone: number
	refusesStep: boolean
	shoto: string | null
	firstCompanion: string | null
	names: Record<string, string>
	greetingOutcome: SummonOutcome
}

export const createFakeFlowWorld = (): FakeFlowWorld => {
	const fake: FakeFlowWorld = {
		step: "welcome",
		stored: [],
		opened: [],
		sent: [],
		threadHistory: [],
		replays: 0,
		firstRunDone: 0,
		refusesStep: false,
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
			fake.firstRunDone += 1
		},
		shotoId: () => fake.shoto,
		firstCompanionId: () => fake.firstCompanion,
		storeFirstCompanion: async (botId) => {
			fake.firstCompanion = botId
		},
		botNameOf: (botId) => fake.names[botId] ?? null,
		openConversation: async (botId) => {
			fake.opened.push(botId)
		},
		sendTo: async (botId, text) => {
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
