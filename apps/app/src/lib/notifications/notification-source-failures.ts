import type { NoticeMessage } from "@workspace/ui/components/notice-surface"

import {
	type NotificationFailure,
	notificationFailureTitleFor,
} from "./notification-words"

import { describeFailure } from "../failure-report"
import { isHostOffline } from "../host/host-offline"

export type FailWith = (
	failure: NotificationFailure,
) => (reason: unknown) => undefined

export const createFailWith = (
	reportFailure: (notice: NoticeMessage) => void,
): FailWith => {
	const reportedFailures = new Set<NotificationFailure>()

	return (failure) => (reason) => {
		if (reportedFailures.has(failure) || isHostOffline(reason)) {
			return
		}
		reportedFailures.add(failure)
		reportFailure({
			title: notificationFailureTitleFor(failure),
			description: describeFailure(reason),
		})
	}
}
