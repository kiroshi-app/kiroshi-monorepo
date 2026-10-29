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
	{ isWithShoto }: OnboardingFlowState,
): OnboardingScreenStep | null => {
	if (step === "done" || (step === "connect" && isWithShoto)) {
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

export const connectAccountOf = (
	connection: ConnectionStep,
): OnboardingConnectAccount | undefined =>
	connection.state === "detected" && connection.plan
		? {
				email: connection.email,
				initials: connection.email.charAt(0).toUpperCase(),
				plan: connection.plan,
			}
		: undefined
