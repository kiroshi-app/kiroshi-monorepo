import type {
	ToolQuestionEntry,
	ToolQuestionExit,
	ToolQuestionFailure,
	ToolQuestionLink,
} from "@workspace/ui/components/tool-question"
import { i18n } from "@workspace/ui/lib/i18n"

import type { ConnectionStep, SignInActions } from "./sign-in-flow"
import type { SignIn } from "./use-sign-in"

import type {
	PostedAnswerHandler,
	PostedAskedQuestion,
	PostedRequest,
} from "../chat/posted-question"

export type SignInStep = {
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
}: ChoiceStepInput): SignInStep => ({
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
}: EntryStepInput): SignInStep => ({
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

const accountStep = (id: string, controller: SignInActions): SignInStep =>
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

const accessStep = (id: string, controller: SignInActions): SignInStep =>
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
): SignInStep =>
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

const apiKeyStep = (id: string, controller: SignInActions): SignInStep =>
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
	controller: SignInActions,
): SignInStep =>
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
				choose: controller.signIn,
			},
			apiKeyChoice(controller.pasteKeyInstead),
		],
	})

const apiKeyFailedStep = (
	id: string,
	exitDetail: string,
	controller: SignInActions,
): SignInStep =>
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

const connectionStepOf = (
	connection: ConnectionStep,
	id: string,
	controller: SignInActions,
): SignInStep => {
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
			return signInFailedStep(id, connection.exitDetail, controller)
		case "apiKeyFailed":
			return apiKeyFailedStep(id, connection.exitDetail, controller)
	}
}

export const signInStepOf = (
	signIn: SignIn | undefined,
	botId: string,
): SignInStep | null => {
	const connection = signIn?.state.connection
	if (!signIn || !connection || signIn.state.botId !== botId) {
		return null
	}
	const id = `sign-in-${connection.state}-${signIn.state.round}`

	return connectionStepOf(connection, id, signIn.controller)
}
