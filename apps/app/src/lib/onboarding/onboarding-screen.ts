import type {
	OnboardingConnectAccount,
	OnboardingConnectStep,
} from "@workspace/ui/components/onboarding-connect-screen"

import type { OnboardingFlowState } from "./onboarding-flow-controller"
import type { ConnectionStep } from "./sign-in-flow"

import type { OnboardingStep } from "@/lib/bindings"

export type OnboardingScreenStep = Exclude<OnboardingStep, "done">

export const onboardingScreenStepOf = (
	step: OnboardingStep,
	{ isAtAccount }: OnboardingFlowState,
): OnboardingScreenStep | null => {
	if (isAtAccount) {
		return "account"
	}
	if (step === "done") {
		return null
	}
	return step
}

export const connectStepOf = (
	connection: ConnectionStep,
	isBusy: boolean,
): OnboardingConnectStep => {
	switch (connection.state) {
		case "detected":
			return "loginFound"
		case "offer":
			return "nothingFound"
		case "anotherAccount":
			return "anotherAccount"
		case "waiting":
			return isBusy ? "connecting" : "waitingForCode"
		case "apiKey":
			return "keyField"
		case "signInFailed":
			return connection.failure
		case "apiKeyFailed":
			return "keyRefused"
	}
}

const LOCAL_PART_SEPARATORS = /[._+-]/

const initialsOf = (email: string): string => {
	const [localPart = ""] = email.split("@")
	const [first = "", second] = localPart
		.split(LOCAL_PART_SEPARATORS)
		.filter((part) => part.length > 0)
	const initials = second
		? first.charAt(0) + second.charAt(0)
		: first.slice(0, 2)
	return initials.toUpperCase()
}

export const connectAccountOf = (
	connection: ConnectionStep,
): OnboardingConnectAccount | undefined =>
	connection.state === "detected" && connection.plan
		? {
				email: connection.email,
				initials: initialsOf(connection.email),
				plan: connection.plan,
			}
		: undefined
