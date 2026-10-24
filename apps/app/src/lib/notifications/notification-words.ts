import { i18n } from "@workspace/ui/lib/i18n"

import type { NotifiedEvent } from "./notification-policy"
import type { NotificationRequest } from "./notification-port"

import type { MissionState } from "../missions/mission-contract"

const BODY_KEY = {
	question: "common:notification.question",
	permission: "common:notification.approval",
	finishedTurn: "common:notification.finishedTurn",
} as const satisfies Record<NotifiedEvent, string>

export type NotificationFailure = "clicks" | "focus" | "reveal" | "send"

const FAILURE_TITLE_KEY = {
	clicks: "common:notification.failure.clicks",
	focus: "common:notification.failure.focus",
	reveal: "common:notification.failure.reveal",
	send: "common:notification.failure.send",
} as const satisfies Record<NotificationFailure, string>

export const notificationFailureTitleFor = (
	failure: NotificationFailure,
): string => i18n.t(FAILURE_TITLE_KEY[failure])

export type NotificationWordsInput = {
	name: string
	event: NotifiedEvent
}

export type NotifiedMissionState = Extract<
	MissionState,
	"waiting_human" | "ready_to_merge"
>

const MISSION_BODY_KEY = {
	waiting_human: "common:notification.mission.waiting_human",
	ready_to_merge: "common:notification.mission.ready_to_merge",
} as const satisfies Record<NotifiedMissionState, string>

export const isNotifiedMissionState = (
	state: MissionState,
): state is NotifiedMissionState => state in MISSION_BODY_KEY

export type MissionNotificationWordsInput = {
	name: string
	ticket: string
	state: NotifiedMissionState
}

export const missionNotificationWordsFor = ({
	name,
	ticket,
	state,
}: MissionNotificationWordsInput): Pick<
	NotificationRequest,
	"title" | "body"
> => ({
	title: name,
	body: i18n.t(MISSION_BODY_KEY[state], { ticket }),
})

export type SpokenWordsInput = {
	title: string
	name: string
}

export const spokenWordsFor = ({
	title,
	name,
}: SpokenWordsInput): Pick<NotificationRequest, "title" | "body"> => ({
	title,
	body: i18n.t("common:notification.spoke", { name }),
})

export const notificationWordsFor = ({
	name,
	event,
}: NotificationWordsInput): Pick<NotificationRequest, "title" | "body"> => ({
	title: name,
	body: i18n.t(BODY_KEY[event]),
})
