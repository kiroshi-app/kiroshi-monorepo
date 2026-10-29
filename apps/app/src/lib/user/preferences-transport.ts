import type { UserPreferences } from "./preferences-contract"

import { invoke } from "../host"
import type { OnboardingStep } from "@/lib/bindings"

export const userPreferencesStore = {
	read: () => invoke<UserPreferences>("user_preferences"),

	write: (preferences: UserPreferences) =>
		invoke<UserPreferences>("user_set_preferences", { preferences }),

	setProfilePicture: (bytes: Uint8Array) =>
		invoke<UserPreferences>("user_set_profile_picture", { bytes }),

	setOnboardingStep: (step: OnboardingStep) =>
		invoke<UserPreferences>("user_set_onboarding_step", { step }),

	replayOnboarding: () => invoke<UserPreferences>("user_replay_onboarding"),
}
