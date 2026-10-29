import {
	createOnboardingFlowController,
	type OnboardingFlowController,
	type OnboardingFlowState,
	type OnboardingFlowWorld,
} from "./onboarding-flow-controller"
import type { OnboardingPort } from "./onboarding-port"

import { useController } from "../use-controller"

export type OnboardingFlow = {
	state: OnboardingFlowState
	controller: OnboardingFlowController
}

export const useOnboardingFlow = (
	port: OnboardingPort,
	world: OnboardingFlowWorld,
): OnboardingFlow =>
	useController(() => createOnboardingFlowController(port, world))
