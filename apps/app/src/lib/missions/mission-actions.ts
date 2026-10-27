import type {
	MissionCopyKind,
	MissionMenuActions,
} from "@workspace/ui/components/mission-menu"
import { raiseTransientNotice } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import type { Mission } from "./mission-contract"

import { raiseReportedFailure } from "../failure-report"

export type MissionLanding = "composer"

export type OpenMission = (missionId: string, landing?: MissionLanding) => void

export type OpenMissionInNewTab = (missionId: string) => void

export type MissionActionsPort = {
	openMission: OpenMission
	openInBrowser: (url: string | null) => Promise<void>
	writeClipboard: (text: string) => Promise<void>
	stopThread: (conversationId: string) => Promise<void>
	close: (missionId: string) => Promise<unknown>
	reopen: (missionId: string) => Promise<unknown>
	onChanged: () => void
}

type FailedAction =
	| "openPullRequest"
	| "copy"
	| "stopAgent"
	| "close"
	| "reopen"

const reportFailure = (action: FailedAction) => (reason: unknown) => {
	console.error(`mission menu: ${action} failed`, reason)
	raiseReportedFailure(
		{ title: i18n.t(`chat:missions.menu.failed.${action}`) },
		{ raisedIn: "mission-actions" },
	)
}

const copiedValueOf = (
	mission: Mission,
	kind: MissionCopyKind,
): string | null =>
	({
		issue_id: mission.ticket.externalId,
		branch: mission.branch,
		pull_request_url: mission.pullRequestUrl,
		workspace_path: mission.workspacePath,
	})[kind]

const announceCopied = (kind: MissionCopyKind) => {
	raiseTransientNotice({
		title: i18n.t("chat:missions.menu.copied", {
			kind: i18n.t(`chat:missions.menu.copyKind.${kind}`),
		}),
	})
}

const attempt = (action: FailedAction, run: () => Promise<unknown>) => {
	void Promise.resolve().then(run).catch(reportFailure(action))
}

export const missionActionsOf = (
	mission: Mission,
	port: MissionActionsPort,
): MissionMenuActions => ({
	onOpen: () => port.openMission(mission.id),
	onOpenPullRequest: () =>
		attempt("openPullRequest", () =>
			port.openInBrowser(mission.pullRequestUrl),
		),
	onCopy: (kind) =>
		attempt("copy", async () => {
			const value = copiedValueOf(mission, kind)
			if (!value) {
				throw new Error(`the mission carries no ${kind}`)
			}
			await port.writeClipboard(value)
			announceCopied(kind)
		}),
	onMessageAgent: () => port.openMission(mission.id, "composer"),
	onAnswer: () => port.openMission(mission.id, "composer"),
	onStopAgent: () =>
		attempt("stopAgent", () => port.stopThread(mission.threadConversationId)),
	onClose: () =>
		attempt("close", async () => {
			await port.close(mission.id)
			port.onChanged()
		}),
	onReopen: () =>
		attempt("reopen", async () => {
			await port.reopen(mission.id)
			port.onChanged()
		}),
})
