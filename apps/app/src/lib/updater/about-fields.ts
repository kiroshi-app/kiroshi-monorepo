import type {
	AboutFieldsProps,
	UpdateState as AboutUpdate,
} from "@workspace/ui/components/user-settings-dialog/about-fields"

import { releaseNotesUrlOf } from "./badge-model"
import { downloadedPercentOf } from "./download-progress"
import { openReleaseNotes } from "./open-release-notes"
import type { UpdaterController, UpdaterState } from "./updater-controller"
import { raiseUpdaterFailure } from "./updater-failure"
import type { Updater } from "./use-updater"

import type { User } from "../user/use-user"

type AboutFieldsInput = {
	updater: Updater
	user: User
	runningVersion: string | null
	onWhatsNew: () => void
	onReplayOnboarding: () => void
	canImportFromClaudeCode: boolean
	onImportFromClaudeCode: () => void
}

const hasCheckFailed = ({ host, offeredVersion }: UpdaterState) =>
	host.kind === "failed" && offeredVersion === null

export const toAboutUpdate = (state: UpdaterState): AboutUpdate => {
	const { host, offeredVersion, checkedAt } = state
	switch (host.kind) {
		case "upToDate":
			return { status: "upToDate", checkedAt }
		case "checking":
			return { status: "checking" }
		case "available":
			return { status: "available", version: host.version }
		case "downloading":
			return {
				status: "downloading",
				version: offeredVersion ?? "",
				progress: downloadedPercentOf(host),
			}
		case "readyToRestart":
			return {
				status: "ready",
				version: host.version,
				runningCompanions: state.runningCompanions,
			}
		case "failed":
			return offeredVersion
				? { status: "failed", version: offeredVersion }
				: { status: "upToDate", checkedAt }
	}
}

const raisePreferenceFailure = raiseUpdaterFailure("use-about-fields")

const raiseCheckFailure = raiseUpdaterFailure("check-for-updates")

const checkFrom = async (controller: UpdaterController) => {
	await controller.check()
	if (hasCheckFailed(controller.getState())) {
		raiseCheckFailure()
	}
}

export const aboutFieldsOf = ({
	updater,
	user,
	runningVersion,
	onWhatsNew,
	onReplayOnboarding,
	canImportFromClaudeCode,
	onImportFromClaudeCode,
}: AboutFieldsInput): AboutFieldsProps | undefined => {
	if (runningVersion === null) {
		return undefined
	}
	const { preferences } = user.state
	return {
		version: runningVersion,
		channel: preferences.updateChannel ?? "stable",
		update: toAboutUpdate(updater.state),
		showsWhatsNew: preferences.showWhatsNew ?? true,
		onChannelChange: (channel) => {
			user.controller.setUpdateChannel(channel).catch(raisePreferenceFailure)
		},
		onShowsWhatsNewChange: (showsWhatsNew) => {
			user.controller
				.setShowWhatsNew(showsWhatsNew)
				.catch(raisePreferenceFailure)
		},
		onCheck: () => {
			void checkFrom(updater.controller)
		},
		onDownload: () => {
			void updater.controller.install()
		},
		onRestart: () => {
			void updater.controller.restart()
		},
		onWhatsNew,
		onReleaseNotes: () => openReleaseNotes(releaseNotesUrlOf(runningVersion)),
		gettingStarted: {
			canImportFromClaudeCode,
			onImportFromClaudeCode,
			onReplayOnboarding,
		},
	}
}
