import type {
	ToolQuestionEntry,
	ToolQuestionExit,
	ToolQuestionFailure,
	ToolQuestionLink,
} from "@workspace/ui/components/tool-question"
import { i18n } from "@workspace/ui/lib/i18n"

import type {
	OnboardingController,
	OnboardingState,
} from "./onboarding-controller"
import type { SummonOutcome } from "./onboarding-summons"
import type { ConnectionStep, SignInActions } from "./sign-in-flow"

import type {
	PostedAnswerHandler,
	PostedAskedQuestion,
	PostedRequest,
} from "../chat/posted-question"

export type OnboardingStepQuestion = {
	request: PostedRequest
	onAnswers: PostedAnswerHandler
}

type StepChoice = {
	label: string
	description: string
	choose: () => Promise<void> | void
}

type StepAsked = {
	id: string
	header: string
	question: string
}

type ChoiceStepInput = StepAsked & {
	choices: StepChoice[]
	failure?: ToolQuestionFailure
}

type EntryStepInput = StepAsked & {
	link?: ToolQuestionLink
	entry: ToolQuestionEntry
	exit: ToolQuestionExit
	submit: (value: string) => Promise<void>
}

const postedRequestOf = (
	id: string,
	asked: PostedAskedQuestion,
): PostedRequest => ({ id, questions: [asked], isPosted: true })

const choiceStep = ({
	id,
	header,
	question,
	choices,
	failure,
}: ChoiceStepInput): OnboardingStepQuestion => ({
	request: postedRequestOf(id, {
		header,
		question,
		multiSelect: false,
		optionsOnly: true,
		failure,
		options: choices.map(({ label, description }) => ({
			label,
			description,
			preview: null,
		})),
	}),
	onAnswers: async (answers) => {
		const chosen = choices.find(({ label }) => label === answers[question])
		if (!chosen) {
			return Promise.reject({ kind: "unmatchedChoice" })
		}
		await chosen.choose()
	},
})

const entryStep = ({
	id,
	header,
	question,
	link,
	entry,
	exit,
	submit,
}: EntryStepInput): OnboardingStepQuestion => ({
	request: postedRequestOf(id, {
		header,
		question,
		multiSelect: false,
		options: [],
		link,
		entry,
		exit,
	}),
	onAnswers: (answers) => submit(answers[question] ?? ""),
})

const signInChoice = (
	label: string,
	choose: StepChoice["choose"],
): StepChoice => ({
	label,
	description: i18n.t("chat:onboarding.access.signIn.description"),
	choose,
})

const apiKeyChoice = (choose: StepChoice["choose"]): StepChoice => ({
	label: i18n.t("chat:onboarding.access.apiKey.label"),
	description: i18n.t("chat:onboarding.access.apiKey.description"),
	choose,
})

const welcomeStep = (
	id: string,
	controller: OnboardingController,
): OnboardingStepQuestion =>
	choiceStep({
		id,
		header: i18n.t("chat:onboarding.welcome.header"),
		question: i18n.t("chat:onboarding.welcome.question"),
		choices: [
			{
				label: i18n.t("chat:onboarding.welcome.start.label"),
				description: i18n.t("chat:onboarding.welcome.start.description"),
				choose: controller.start,
			},
			{
				label: i18n.t("chat:onboarding.welcome.more.label"),
				description: i18n.t("chat:onboarding.welcome.more.description"),
				choose: controller.tellMore,
			},
		],
	})

const accountStep = (
	id: string,
	controller: SignInActions,
): OnboardingStepQuestion =>
	choiceStep({
		id,
		header: i18n.t("chat:onboarding.account.header"),
		question: i18n.t("chat:onboarding.account.question"),
		choices: [
			{
				label: i18n.t("chat:onboarding.account.use.label"),
				description: i18n.t("chat:onboarding.account.use.description"),
				choose: controller.acceptAccount,
			},
			{
				label: i18n.t("chat:onboarding.account.another.label"),
				description: i18n.t("chat:onboarding.account.another.description"),
				choose: controller.changeAccount,
			},
		],
	})

const accessStep = (
	id: string,
	controller: SignInActions,
): OnboardingStepQuestion =>
	choiceStep({
		id,
		header: i18n.t("chat:onboarding.access.header"),
		question: i18n.t("chat:onboarding.access.question"),
		choices: [
			signInChoice(
				i18n.t("chat:onboarding.access.signIn.label"),
				controller.signIn,
			),
			apiKeyChoice(controller.askApiKey),
		],
	})

const codeStep = (
	id: string,
	signInUrl: string,
	controller: SignInActions,
): OnboardingStepQuestion =>
	entryStep({
		id,
		header: i18n.t("chat:onboarding.code.header"),
		question: i18n.t("chat:onboarding.code.question"),
		link: { label: i18n.t("chat:onboarding.code.link"), url: signInUrl },
		entry: { label: i18n.t("chat:onboarding.code.entry") },
		exit: {
			label: i18n.t("chat:onboarding.code.exit"),
			onSelect: () => void controller.pasteKeyInstead(),
		},
		submit: controller.submitCode,
	})

const apiKeyStep = (
	id: string,
	controller: SignInActions,
): OnboardingStepQuestion =>
	entryStep({
		id,
		header: i18n.t("chat:onboarding.apiKey.header"),
		question: i18n.t("chat:onboarding.apiKey.question"),
		entry: {
			label: i18n.t("chat:onboarding.apiKey.entry"),
			placeholder: i18n.t("chat:onboarding.apiKey.placeholder"),
			isSecret: true,
		},
		exit: {
			label: i18n.t("chat:onboarding.apiKey.exit"),
			onSelect: () => void controller.signIn(),
		},
		submit: controller.submitApiKey,
	})

const signInFailedStep = (
	id: string,
	exitDetail: string,
	retry: () => Promise<void>,
	controller: SignInActions,
): OnboardingStepQuestion =>
	choiceStep({
		id,
		header: i18n.t("chat:onboarding.signInFailed.header"),
		question: i18n.t("chat:onboarding.signInFailed.question"),
		failure: {
			title: i18n.t("chat:onboarding.signInFailed.title"),
			detail: exitDetail,
		},
		choices: [
			{
				label: i18n.t("chat:onboarding.signInFailed.retry.label"),
				description: i18n.t("chat:onboarding.signInFailed.retry.description"),
				choose: retry,
			},
			apiKeyChoice(controller.pasteKeyInstead),
		],
	})

const apiKeyFailedStep = (
	id: string,
	exitDetail: string,
	controller: SignInActions,
): OnboardingStepQuestion =>
	choiceStep({
		id,
		header: i18n.t("chat:onboarding.apiKey.header"),
		question: i18n.t("chat:onboarding.connection.keyFailed.sentence"),
		failure: {
			title: i18n.t("chat:onboarding.connection.keyFailed.title"),
			detail: exitDetail,
		},
		choices: [
			{
				label: i18n.t("chat:onboarding.connection.keyFailed.anotherKey"),
				description: i18n.t(
					"chat:onboarding.connection.keyFailed.anotherKeyDescription",
				),
				choose: controller.askApiKey,
			},
			signInChoice(
				i18n.t("chat:onboarding.connection.keyFailed.signIn"),
				controller.signIn,
			),
		],
	})

const firstReplyStep = (
	id: string,
	controller: OnboardingController,
): OnboardingStepQuestion =>
	choiceStep({
		id,
		header: i18n.t("chat:onboarding.firstReply.header"),
		question: i18n.t("chat:onboarding.firstReply.question"),
		choices: [
			{
				label: i18n.t("chat:onboarding.firstReply.pick.label"),
				description: i18n.t("chat:onboarding.firstReply.pick.description"),
				choose: controller.pickCompanion,
			},
			{
				label: i18n.t("chat:onboarding.firstReply.keepTalking.label"),
				description: i18n.t(
					"chat:onboarding.firstReply.keepTalking.description",
				),
				choose: controller.finish,
			},
		],
	})

export const connectionStepOf = (
	connection: ConnectionStep,
	id: string,
	controller: SignInActions,
): OnboardingStepQuestion => {
	switch (connection.state) {
		case "detected":
			return accountStep(id, controller)
		case "offer":
		case "anotherAccount":
			return accessStep(id, controller)
		case "waiting":
			return codeStep(id, connection.signInUrl, controller)
		case "apiKey":
			return apiKeyStep(id, controller)
		case "signInFailed":
			return signInFailedStep(
				id,
				connection.exitDetail,
				controller.signIn,
				controller,
			)
		case "apiKeyFailed":
			return apiKeyFailedStep(id, connection.exitDetail, controller)
	}
}

export const onboardingStepOf = (
	state: OnboardingState,
	outcome: SummonOutcome,
	controller: OnboardingController,
): OnboardingStepQuestion | null => {
	const idOf = (name: string) => `onboarding-${name}-${state.round}`

	if (state.step === "welcome") {
		return welcomeStep(idOf("welcome"), controller)
	}
	if (state.step === "connection" && state.connection) {
		return connectionStepOf(
			state.connection,
			idOf(state.connection.state),
			controller,
		)
	}
	if (outcome.kind === "failed") {
		return signInFailedStep(
			idOf("turnFailed"),
			outcome.detail,
			controller.summonAgain,
			controller,
		)
	}
	if (outcome.kind === "answered") {
		return firstReplyStep(idOf("firstReply"), controller)
	}
	return null
}
