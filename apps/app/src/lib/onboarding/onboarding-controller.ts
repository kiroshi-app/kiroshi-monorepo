import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { exitDetailOf } from "./onboarding-failure"
import type { OnboardingPort } from "./onboarding-port"
import {
	type OnboardingSummons,
	onboardingSummonsFor,
} from "./onboarding-summons"
import {
	type ConnectionStep,
	createSignInFlow,
	type SignInActions,
} from "./sign-in-flow"

import { failureReporterIn } from "../failure-report"
import { createStore } from "../store"
import type { CompanionCreated } from "../companions/companions-transport"

type OnboardingStep = "welcome" | "connection" | "summoned" | "done"

export type OnboardingState = {
	step: OnboardingStep
	connection: ConnectionStep | null
	round: number
	summons: string | null
	isBusy: boolean
	homeBotId: string | null
}

export type OnboardingWorld = {
	homeBotId: () => string | null
	send: (text: string) => Promise<void>
	greet: (botId: string, text: string) => Promise<void>
	markFirstRunDone: () => Promise<void>
}

export type OnboardingController = SignInActions & {
	getState: () => OnboardingState
	subscribe: (listener: () => void) => () => void
	start: () => Promise<void>
	tellMore: () => Promise<void>
	summonAgain: () => Promise<void>
	pickCompanion: () => Promise<void>
	greetCompanion: (created: CompanionCreated) => Promise<void>
	finish: () => Promise<void>
}

const initialOnboardingState: OnboardingState = {
	step: "welcome",
	connection: null,
	round: 0,
	summons: null,
	isBusy: false,
	homeBotId: null,
}

export type OnboardingControllerOptions = {
	reportFailure?: (notice: NoticeMessage) => void
}

export const createOnboardingController = (
	port: OnboardingPort,
	world: OnboardingWorld,
	{
		reportFailure = failureReporterIn("onboarding-controller"),
	}: OnboardingControllerOptions = {},
): OnboardingController => {
	const stateStore = createStore(initialOnboardingState)
	const current = stateStore.getState
	let asked: OnboardingSummons = "greeting"

	const set = (fields: Partial<OnboardingState>) =>
		stateStore.setState({ ...current(), ...fields })

	const showConnection = (connection: ConnectionStep) => {
		set({
			step: "connection",
			connection,
			round: current().round + 1,
			summons: null,
			isBusy: false,
		})
	}

	const settle = async () => {
		const summons = onboardingSummonsFor(asked)
		set({
			step: "summoned",
			connection: null,
			round: current().round + 1,
			summons,
		})
		await world.send(summons)
	}

	const { readAccount, actions } = createSignInFlow(port, {
		showConnection,
		setBusy: (isBusy) => set({ isBusy }),
		settle,
	})

	const askFor = (summons: OnboardingSummons) => {
		asked = summons
		set({ homeBotId: world.homeBotId() })
		return readAccount()
	}

	const finishRun = () => {
		set({ step: "done", connection: null })
		return world.markFirstRunDone()
	}

	const report = (title: string, reason: unknown) => {
		reportFailure({ title, description: exitDetailOf(reason) })
	}

	const pickCompanion = async () => {
		await finishRun()
		await world.send(onboardingSummonsFor("firstCompanion"))
	}

	const greetCompanion = async (created: CompanionCreated) => {
		try {
			await world.greet(created.id, onboardingSummonsFor("arrival"))
		} catch (reason) {
			report(
				i18n.t("chat:onboarding.arrival.failure", { name: created.name }),
				reason,
			)
		}
	}

	return {
		...actions,

		getState: current,

		subscribe: stateStore.subscribe,

		start: () => askFor("greeting"),

		tellMore: () => askFor("purpose"),

		summonAgain: settle,

		pickCompanion,

		greetCompanion,

		finish: finishRun,
	}
}
