import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { exitDetailOf } from "./onboarding-failure"
import type { OnboardingPort } from "./onboarding-port"
import {
	onboardingSummonsFor,
	type SummonOutcome,
	summonOutcomeOf,
} from "./onboarding-summons"
import {
	type ConnectionStep,
	createSignInFlow,
	type SignInActions,
} from "./sign-in-flow"

import { failureReporterIn } from "../failure-report"
import { createStore } from "../store"
import type { OnboardingStep } from "@/lib/bindings"
import type { RosterController } from "../bots/roster-controller"
import type { ChatController } from "../chat/chat-controller"
import type { CompanionCreated } from "../companions/companions-transport"
import type { UserPreferences } from "../user/preferences-contract"
import type { UserController } from "../user/preferences-controller"

export type OnboardingFlowState = {
	connection: ConnectionStep | null
	round: number
	isBusy: boolean
	isWithShoto: boolean
	shotoId: string | null
	firstCompanion: CompanionCreated | null
}

export type OnboardingFlowWorld = {
	storedStep: () => OnboardingStep
	storeStep: (step: OnboardingStep) => Promise<void>
	replay: () => Promise<void>
	markFirstRunDone: () => Promise<void>
	homeBotId: () => string | null
	openConversation: (botId: string) => Promise<void>
	sendTo: (botId: string, text: string) => Promise<void>
	outcomeOf: (botId: string, summons: string) => Promise<SummonOutcome>
}

export type OnboardingFlowController = SignInActions & {
	getState: () => OnboardingFlowState
	subscribe: (listener: () => void) => () => void
	resume: () => Promise<void>
	leaveIntro: () => Promise<void>
	skipImport: () => Promise<void>
	finish: () => Promise<void>
	replay: () => Promise<void>
	downloadAgain: () => Promise<void>
	noteCreated: (created: CompanionCreated) => void
	noteFirstRunDone: () => Promise<void>
}

export type OnboardingFlowOptions = {
	reportFailure?: (notice: NoticeMessage) => void
}

export type OnboardingCreation = {
	shotoId: string
	companionId: string
}

const initialOnboardingFlowState: OnboardingFlowState = {
	connection: null,
	round: 0,
	isBusy: false,
	isWithShoto: false,
	shotoId: null,
	firstCompanion: null,
}

type StoredOnboarding = Pick<UserPreferences, "onboardingStep" | "firstRunDone">

export const onboardingStepOf = ({
	onboardingStep,
	firstRunDone,
}: StoredOnboarding): OnboardingStep =>
	onboardingStep ?? (firstRunDone ? "done" : "welcome")

export const onboardingCreationOf = ({
	isWithShoto,
	shotoId,
	firstCompanion,
}: OnboardingFlowState): OnboardingCreation | null =>
	isWithShoto && shotoId && firstCompanion
		? { shotoId, companionId: firstCompanion.id }
		: null

export const createOnboardingFlowController = (
	port: OnboardingPort,
	world: OnboardingFlowWorld,
	{
		reportFailure = failureReporterIn("onboarding-flow-controller"),
	}: OnboardingFlowOptions = {},
): OnboardingFlowController => {
	const stateStore = createStore(initialOnboardingFlowState)
	const current = stateStore.getState

	const set = (fields: Partial<OnboardingFlowState>) =>
		stateStore.setState({ ...current(), ...fields })

	const report = (title: string, reason: unknown) => {
		reportFailure({ title, description: exitDetailOf(reason) })
	}

	const reportUnsent = (reason: unknown) =>
		report(i18n.t("chat:screen.notice.failed"), reason)

	const persisted = async (write: () => Promise<void>) => {
		try {
			await write()
			return true
		} catch (reason) {
			reportUnsent(reason)
			return false
		}
	}

	const store = (step: OnboardingStep) => persisted(() => world.storeStep(step))

	const meetShoto = async (shotoId: string) => {
		const greeting = onboardingSummonsFor("greeting")
		try {
			await world.openConversation(shotoId)
			await world.sendTo(shotoId, greeting)
			const outcome = await world.outcomeOf(shotoId, greeting)
			if (outcome.kind === "answered") {
				await world.sendTo(shotoId, onboardingSummonsFor("firstCompanion"))
			}
		} catch (reason) {
			reportUnsent(reason)
		}
	}

	const settle = async () => {
		set({ connection: null, round: current().round + 1 })
		if (await port.hasClaudeHome()) {
			await store("import")
			return
		}
		const shotoId = world.homeBotId()
		set({ isWithShoto: true, shotoId })
		if (shotoId) {
			void meetShoto(shotoId)
		}
	}

	const showConnection = (connection: ConnectionStep) => {
		set({ connection, round: current().round + 1, isBusy: false })
	}

	const { readAccount, actions } = createSignInFlow(port, {
		showConnection,
		setBusy: (isBusy) => set({ isBusy }),
		settle,
	})

	const enterConnect = async () => {
		const { connection, isBusy } = current()
		if (connection || isBusy) {
			return
		}
		await readAccount()
	}

	const land = async () => {
		const companion = current().firstCompanion
		if (!companion) {
			return
		}
		try {
			await world.openConversation(companion.id)
			await world.sendTo(companion.id, onboardingSummonsFor("arrival"))
		} catch (reason) {
			report(
				i18n.t("chat:onboarding.arrival.failure", { name: companion.name }),
				reason,
			)
		}
	}

	return {
		...actions,

		getState: current,

		subscribe: stateStore.subscribe,

		resume: async () => {
			if (world.storedStep() === "connect") {
				await enterConnect()
			}
		},

		leaveIntro: async () => {
			if (await store("connect")) {
				await enterConnect()
			}
		},

		skipImport: async () => {
			await store("account")
		},

		finish: async () => {
			if (!(await store("done"))) {
				return
			}
			await world.markFirstRunDone()
			await land()
		},

		replay: async () => {
			stateStore.setState(initialOnboardingFlowState)
			await persisted(world.replay)
		},

		downloadAgain: () => port.openDownloadPage().catch(reportUnsent),

		noteCreated: (created) => {
			if (current().isWithShoto) {
				set({ firstCompanion: created })
			}
		},

		noteFirstRunDone: async () => {
			if (!current().isWithShoto) {
				return
			}
			set({ isWithShoto: false })
			if (!(await store("account"))) {
				set({ isWithShoto: true })
			}
		},
	}
}

const settledOutcomeOf = (
	chat: ChatController,
	botId: string,
	summons: string,
) =>
	new Promise<SummonOutcome>((resolve) => {
		const check = () => {
			const outcome = summonOutcomeOf(chat.stateFor(botId), summons)
			if (outcome.kind === "pending") {
				return
			}
			stopWatching()
			resolve(outcome)
		}
		const stopWatching = chat.subscribe(check)
		check()
	})

type OnboardingScene = {
	chat: ChatController
	roster: RosterController
	user: UserController
}

export const onboardingFlowWorldOf = ({
	chat,
	roster,
	user,
}: OnboardingScene): OnboardingFlowWorld => ({
	storedStep: () => onboardingStepOf(user.getState().preferences),
	storeStep: user.setOnboardingStep,
	replay: user.replayOnboarding,
	markFirstRunDone: user.markFirstRunDone,
	homeBotId: () => roster.getState().selectedBotId,
	openConversation: async (botId) => {
		const { spaceRowId } = roster.getState()
		await chat.openAside(botId, spaceRowId && roster.hostSpaceIdOf(spaceRowId))
		roster.select(botId)
	},
	sendTo: (botId, text) => chat.sendTo(botId, text),
	outcomeOf: (botId, summons) => settledOutcomeOf(chat, botId, summons),
})
