import {
	type NoticeMessage,
	raiseTransientNotice,
} from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import type { ClaudeImported } from "./claude-import-controller"
import { landingTitleOf } from "./claude-import-landing"
import { exitDetailOf } from "./onboarding-failure"
import type { OnboardingPort } from "./onboarding-port"
import {
	isSummonedIn,
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
	isAtAccount: boolean
	shotoId: string | null
	firstCompanion: CompanionCreated | null
}

export type OnboardingFlowWorld = {
	storedStep: () => OnboardingStep
	storeStep: (step: OnboardingStep) => Promise<void>
	replay: () => Promise<void>
	markFirstRunDone: () => Promise<void>
	shotoId: () => string | null
	firstCompanionId: () => string | null
	storeFirstCompanion: (botId: string) => Promise<void>
	botNameOf: (botId: string) => string | null
	openConversation: (botId: string) => Promise<void>
	sendTo: (botId: string, text: string) => Promise<void>
	hasSummoned: (botId: string, summons: string) => boolean
	outcomeOf: (botId: string, summons: string) => Promise<SummonOutcome>
}

export type OnboardingFlowController = SignInActions & {
	getState: () => OnboardingFlowState
	subscribe: (listener: () => void) => () => void
	resume: () => Promise<void>
	leaveIntro: () => Promise<void>
	leaveImport: (imported: ClaudeImported) => Promise<void>
	finish: () => Promise<void>
	replay: () => Promise<void>
	downloadAgain: () => Promise<void>
	noteCreated: (created: CompanionCreated) => void
	noteFirstRunDone: () => Promise<void>
}

export type OnboardingFlowOptions = {
	reportFailure?: (notice: NoticeMessage) => void
	reportSuccess?: (notice: NoticeMessage) => void
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
	isAtAccount: false,
	shotoId: null,
	firstCompanion: null,
}

type StoredOnboarding = Pick<UserPreferences, "onboardingStep">

export const onboardingStepOf = ({
	onboardingStep,
}: StoredOnboarding): OnboardingStep => onboardingStep ?? "done"

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
		reportSuccess = raiseTransientNotice,
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

	let firstCompanionStored = Promise.resolve()
	let importedThisRun: ClaudeImported | null = null

	const claimFirstCompanion = async (botId: string) => {
		if (world.firstCompanionId() === null) {
			await persisted(() => world.storeFirstCompanion(botId))
		}
	}

	const summonOnce = async (shotoId: string, summons: string) => {
		if (!world.hasSummoned(shotoId, summons)) {
			await world.sendTo(shotoId, summons)
		}
	}

	const meetShoto = async (shotoId: string) => {
		const greeting = onboardingSummonsFor("greeting")
		try {
			await world.openConversation(shotoId)
			await summonOnce(shotoId, greeting)
			const outcome = await world.outcomeOf(shotoId, greeting)
			if (outcome.kind === "answered") {
				await summonOnce(shotoId, onboardingSummonsFor("firstCompanion"))
			}
		} catch (reason) {
			reportUnsent(reason)
		}
	}

	const offersImport = () =>
		port.hasClaudeHome().catch((reason: unknown) => {
			report(i18n.t("common:claudeImport.unreadable.title"), reason)
			return false
		})

	const settle = async () => {
		set({ connection: null, round: current().round + 1 })
		if (await offersImport()) {
			await store("import")
			return
		}
		const shotoId = world.shotoId()
		set({ isWithShoto: true, shotoId })
		if (!shotoId) {
			report(i18n.t("chat:onboarding.arrival.firstCompanionMissing"), {
				kind: "unknownBot",
			})
			return
		}
		void meetShoto(shotoId)
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

	const reportArrivalFailure = (companionId: string, reason: unknown) => {
		const name = world.botNameOf(companionId)
		if (!name) {
			reportUnsent(reason)
			return
		}
		report(i18n.t("chat:onboarding.arrival.failure", { name }), reason)
	}

	const land = async () => {
		const companionId = world.firstCompanionId()
		if (!companionId) {
			return
		}
		try {
			await world.openConversation(companionId)
			await summonOnce(companionId, onboardingSummonsFor("arrival"))
		} catch (reason) {
			reportArrivalFailure(companionId, reason)
		}
	}

	const announceImported = () => {
		const title = importedThisRun && landingTitleOf(importedThisRun)
		importedThisRun = null
		if (title) {
			reportSuccess({ title })
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

		leaveImport: async (imported) => {
			importedThisRun = imported
			await store("account")
		},

		finish: async () => {
			if (!(await store("done"))) {
				return
			}
			set({ isAtAccount: false })
			await world.markFirstRunDone()
			await land()
			announceImported()
		},

		replay: async () => {
			stateStore.setState(initialOnboardingFlowState)
			importedThisRun = null
			await persisted(world.replay)
		},

		downloadAgain: () => port.openDownloadPage().catch(reportUnsent),

		noteCreated: (created) => {
			if (!current().isWithShoto) {
				return
			}
			set({ firstCompanion: created })
			firstCompanionStored = firstCompanionStored.then(() =>
				claimFirstCompanion(created.id),
			)
		},

		noteFirstRunDone: async () => {
			if (!current().isWithShoto) {
				return
			}
			set({ isWithShoto: false, isAtAccount: true })
			await firstCompanionStored
			if (!(await store("account"))) {
				set({ isWithShoto: true, isAtAccount: false })
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
	shotoId: () => user.getState().preferences.onboardingShotoId ?? null,
	firstCompanionId: () =>
		user.getState().preferences.onboardingFirstCompanionId ?? null,
	storeFirstCompanion: user.setOnboardingFirstCompanion,
	botNameOf: (botId) =>
		roster.getState().bots.find((bot) => bot.id === botId)?.name ?? null,
	openConversation: async (botId) => {
		const { spaceRowId } = roster.getState()
		await chat.openAside(botId, spaceRowId && roster.hostSpaceIdOf(spaceRowId))
		roster.select(botId)
	},
	sendTo: (botId, text) => chat.sendTo(botId, text),
	hasSummoned: (botId, summons) => isSummonedIn(chat.stateFor(botId), summons),
	outcomeOf: (botId, summons) => settledOutcomeOf(chat, botId, summons),
})
