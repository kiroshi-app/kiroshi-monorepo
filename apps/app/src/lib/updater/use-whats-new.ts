import { useEffect, useRef, useState } from "react"

import type { WhatsNewDialogProps } from "@workspace/ui/components/whats-new-dialog"

import { openReleaseNotes } from "./open-release-notes"
import { raiseUpdaterFailure } from "./updater-failure"
import { useReleaseNotes } from "./use-release-notes"
import { toWhatsNewContent } from "./whats-new-model"

import type { ReaderPreferences } from "../user/preferences-controller"
import type { User } from "../user/use-user"

type WhatsNewVariant = WhatsNewDialogProps["variant"]

export type WhatsNew = {
	dialog: WhatsNewDialogProps | null
	openFromAbout: () => void
}

type WhatsNewInput = {
	user: User
	runningVersion: string | null
}

const raiseVersionSeenFailure = raiseUpdaterFailure("use-whats-new")

const hasReadWhatsNewPreferences = (preferences: ReaderPreferences) =>
	preferences.showWhatsNew !== undefined

const isUnseen = (
	preferences: ReaderPreferences,
	runningVersion: string | null,
): runningVersion is string =>
	runningVersion !== null &&
	hasReadWhatsNewPreferences(preferences) &&
	preferences.lastSeenVersion !== runningVersion

const isFirstLaunchDue = (
	preferences: ReaderPreferences,
	runningVersion: string | null,
) =>
	isUnseen(preferences, runningVersion) &&
	preferences.showWhatsNew === true &&
	preferences.firstRunDone

const useVersionSeenWhileHidden = ({ user, runningVersion }: WhatsNewInput) => {
	const markedVersion = useRef<string | null>(null)
	const { preferences } = user.state
	const versionToMark =
		isUnseen(preferences, runningVersion) && preferences.showWhatsNew === false
			? runningVersion
			: null

	useEffect(() => {
		if (versionToMark === null || markedVersion.current === versionToMark) {
			return
		}
		markedVersion.current = versionToMark
		user.controller
			.markVersionSeen(versionToMark)
			.catch(raiseVersionSeenFailure)
	}, [versionToMark, user.controller])
}

export const useWhatsNew = ({
	user,
	runningVersion,
}: WhatsNewInput): WhatsNew => {
	const { preferences } = user.state
	const [variant, setVariant] = useState<WhatsNewVariant>("first-launch")
	const [isOpenedFromAbout, setIsOpenedFromAbout] = useState(false)
	const [hasClosedFirstLaunch, setHasClosedFirstLaunch] = useState(false)
	const isFirstLaunchShown =
		!hasClosedFirstLaunch && isFirstLaunchDue(preferences, runningVersion)
	const isWanted = isOpenedFromAbout || isFirstLaunchShown
	const { releaseNotes, hasFailedToLoad, retry } = useReleaseNotes({
		version: runningVersion,
		isWanted,
	})
	useVersionSeenWhileHidden({ user, runningVersion })

	const close = () => {
		setIsOpenedFromAbout(false)
		if (!isFirstLaunchShown || runningVersion === null) {
			return
		}
		setHasClosedFirstLaunch(true)
		user.controller
			.markVersionSeen(runningVersion)
			.catch(raiseVersionSeenFailure)
	}

	const openFromAbout = () => {
		setVariant("from-about")
		setIsOpenedFromAbout(true)
		if (hasFailedToLoad) {
			retry()
		}
	}

	return {
		dialog: releaseNotes && {
			...toWhatsNewContent(releaseNotes),
			variant,
			channel: preferences.updateChannel ?? "stable",
			open: isWanted,
			onOpenChange: (isOpen) => {
				if (!isOpen) close()
			},
			onOpenReleaseNotes: openReleaseNotes,
		},
		openFromAbout,
	}
}
