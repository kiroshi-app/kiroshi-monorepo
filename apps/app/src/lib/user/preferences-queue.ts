import type { UserPreferences } from "./preferences-contract"
import { userPreferencesStore } from "./preferences-transport"

import { createQueue } from "../queue"
import type { OnboardingStep } from "@/lib/bindings"

const enqueue = createQueue()

export const readPreferences = () => enqueue(() => userPreferencesStore.read())

export const changePreferences = (
	change: (record: UserPreferences) => UserPreferences,
): Promise<UserPreferences> =>
	enqueue(async () =>
		userPreferencesStore.write(change(await userPreferencesStore.read())),
	)

export const changeProfilePicture = (
	bytes: Uint8Array,
): Promise<UserPreferences> =>
	enqueue(() => userPreferencesStore.setProfilePicture(bytes))

export const changeOnboardingStep = (
	step: OnboardingStep,
): Promise<UserPreferences> =>
	enqueue(() => userPreferencesStore.setOnboardingStep(step))

export const replayOnboarding = (): Promise<UserPreferences> =>
	enqueue(() => userPreferencesStore.replayOnboarding())

export const changeOnboardingFirstCompanion = (
	botId: string,
): Promise<UserPreferences> =>
	enqueue(() => userPreferencesStore.setOnboardingFirstCompanion(botId))

export const markOnboardingImportSeen = (): Promise<UserPreferences> =>
	enqueue(() => userPreferencesStore.markOnboardingImportSeen())
