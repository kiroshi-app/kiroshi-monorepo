import type { Language } from "@workspace/ui/lib/i18n"

import type { ColorScheme, UserPreferences } from "./preferences-contract"
import {
	applyLanguage,
	isMirrorKey,
	type MirroredPreferences,
	mirrorOf,
	readMirror,
	sameMirror,
	writeMirror,
} from "./preferences-mirror"
import {
	changeOnboardingStep,
	changePreferences,
	changeProfilePicture,
	readPreferences,
	replayOnboarding,
} from "./preferences-queue"

import { createStore } from "../store"
import type { OnboardingStep, SidebarTab, UpdateChannel } from "@/lib/bindings"

type NotificationField = Extract<keyof UserPreferences, `notify${string}`>

export type NotificationChange = {
	field: NotificationField
	isEnabled: boolean
}

type LastBotOpened = {
	spaceId: string | null
	botId: string
}

export type ReaderPreferences = UserPreferences & MirroredPreferences

type ReportedPreferences = Pick<
	UserPreferences,
	"updateChannel" | "showWhatsNew" | "lastSeenVersion"
>

export type UserState = {
	preferences: ReaderPreferences
}

export type UserController = {
	getState: () => UserState
	subscribe: (listener: () => void) => () => void
	followOtherWindows: () => () => void
	load: () => Promise<void>
	rename: (displayName: string) => void
	setNotification: (change: NotificationChange) => Promise<void>
	setColorScheme: (colorScheme: ColorScheme) => Promise<void>
	setLanguage: (language: Language | null) => Promise<void>
	setSidebarWidth: (sidebarWidth: number) => Promise<void>
	setSidebarTab: (sidebarTab: SidebarTab) => Promise<void>
	setActivityPanelOpen: (activityPanelOpen: boolean) => Promise<void>
	markFirstRunDone: () => Promise<void>
	setOnboardingStep: (step: OnboardingStep) => Promise<void>
	replayOnboarding: () => Promise<void>
	setLastBot: (opened: LastBotOpened) => Promise<void>
	setLastSpace: (lastSpaceId: string) => Promise<void>
	setUpdateChannel: (updateChannel: UpdateChannel) => Promise<void>
	setShowWhatsNew: (showWhatsNew: boolean) => Promise<void>
	markVersionSeen: (lastSeenVersion: string) => Promise<void>
	uploadPicture: (file: File) => Promise<void>
	removePicture: () => Promise<void>
}

const UNMIRRORED_DEFAULTS = {
	displayName: "",
	profilePicturePath: null,
	notifyOnQuestion: true,
	notifyOnPermission: true,
	notifyOnFinishedTurn: true,
	notifyWithSound: true,
	sidebarTab: "conversations",
} satisfies Omit<UserPreferences, keyof MirroredPreferences>

const openingPreferences = (): ReaderPreferences => ({
	...UNMIRRORED_DEFAULTS,
	...readMirror(),
})

const recordOf = (record: UserPreferences): ReaderPreferences => ({
	...UNMIRRORED_DEFAULTS,
	...record,
	...mirrorOf(record),
})

export const createUserController = (): UserController => {
	const stateStore = createStore<UserState>({
		preferences: openingPreferences(),
	})
	const current = stateStore.getState

	let answered = current().preferences

	let pendingName: string | null = null
	let isWriting = false

	const set = (fields: Partial<UserState>) =>
		stateStore.setState({ ...current(), ...fields })

	const show = (preferences: ReaderPreferences) => set({ preferences })

	const mirror = (mirrored: MirroredPreferences) => {
		if (sameMirror(mirrored, readMirror())) {
			return
		}
		writeMirror(mirrored)
		applyLanguage(mirrored.language)
	}

	const apply = (record: UserPreferences) => {
		answered = recordOf(record)
		mirror(answered)
		show(answered)
	}

	const restore = () => apply(answered)

	const flush = async (): Promise<void> => {
		const displayName = pendingName
		if (displayName === null) {
			return
		}
		pendingName = null
		const written = await changePreferences((record) => ({
			...record,
			displayName,
		}))
		if (pendingName === null) {
			apply(written)
		}
		return flush()
	}

	const botIdBySpaceWith = ({ spaceId, botId }: LastBotOpened) => {
		const { lastBotIdBySpace } = current().preferences
		return spaceId === null
			? lastBotIdBySpace
			: { ...lastBotIdBySpace, [spaceId]: botId }
	}

	const changeMirrored = (fields: Partial<MirroredPreferences>) => {
		const held = current().preferences
		const preferences = { ...held, ...fields }
		if (sameMirror(preferences, held)) {
			return Promise.resolve()
		}
		show(preferences)
		mirror(preferences)
		return changePreferences((record) => ({ ...record, ...fields }))
			.then(apply)
			.catch(restore)
	}

	const changeReported = (fields: ReportedPreferences) => {
		show({ ...current().preferences, ...fields })
		return changePreferences((record) => ({ ...record, ...fields })).then(
			apply,
			(failure: unknown) => {
				restore()
				throw failure
			},
		)
	}

	const changeOnboarding = (
		onboardingStep: OnboardingStep,
		write: () => Promise<UserPreferences>,
	) => {
		show({ ...current().preferences, onboardingStep })
		return write().then(apply, (failure: unknown) => {
			restore()
			throw failure
		})
	}

	return {
		getState: current,

		subscribe: stateStore.subscribe,

		followOtherWindows: () => {
			const follow = (event: StorageEvent) => {
				if (!isMirrorKey(event.key)) {
					return
				}
				const mirrored = readMirror()
				applyLanguage(mirrored.language)
				answered = { ...answered, ...mirrored }
				show({ ...current().preferences, ...mirrored })
			}

			window.addEventListener("storage", follow)

			return () => {
				window.removeEventListener("storage", follow)
			}
		},

		load: () => readPreferences().then(apply).catch(restore),

		rename: (displayName: string) => {
			show({ ...current().preferences, displayName })
			pendingName = displayName
			if (isWriting) {
				return
			}
			isWriting = true
			void flush()
				.catch(restore)
				.finally(() => {
					isWriting = false
				})
		},

		setNotification: ({ field, isEnabled }: NotificationChange) => {
			show({ ...current().preferences, [field]: isEnabled })
			return changePreferences((record) => ({ ...record, [field]: isEnabled }))
				.then(apply)
				.catch(restore)
		},

		setColorScheme: (colorScheme: ColorScheme) =>
			changeMirrored({ colorScheme }),

		setLanguage: (language: Language | null) => changeMirrored({ language }),

		setSidebarWidth: (sidebarWidth: number) => changeMirrored({ sidebarWidth }),

		setSidebarTab: (sidebarTab: SidebarTab) => {
			const held = current().preferences
			if (held.sidebarTab === sidebarTab) {
				return Promise.resolve()
			}
			show({ ...held, sidebarTab })
			return changePreferences((record) => ({ ...record, sidebarTab }))
				.then(apply)
				.catch(restore)
		},

		setActivityPanelOpen: (activityPanelOpen: boolean) =>
			changeMirrored({ activityPanelOpen }),

		markFirstRunDone: () => changeMirrored({ firstRunDone: true }),

		setOnboardingStep: (step: OnboardingStep) =>
			changeOnboarding(step, () => changeOnboardingStep(step)),

		replayOnboarding: () => changeOnboarding("welcome", replayOnboarding),

		setLastBot: (opened: LastBotOpened) =>
			changeMirrored({ lastBotIdBySpace: botIdBySpaceWith(opened) }),

		setLastSpace: (lastSpaceId: string) => changeMirrored({ lastSpaceId }),

		setUpdateChannel: (updateChannel: UpdateChannel) =>
			changeReported({ updateChannel }),

		setShowWhatsNew: (showWhatsNew: boolean) =>
			changeReported({ showWhatsNew }),

		markVersionSeen: (lastSeenVersion: string) =>
			changeReported({ lastSeenVersion }),

		uploadPicture: async (file: File) => {
			const bytes = new Uint8Array(await file.arrayBuffer())
			return changeProfilePicture(bytes).then(apply).catch(restore)
		},

		removePicture: () =>
			changePreferences((record) => ({
				...record,
				profilePicturePath: null,
			}))
				.then(apply)
				.catch(restore),
	}
}
