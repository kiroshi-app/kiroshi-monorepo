import { queryOptions, skipToken } from "@tanstack/react-query"

import { i18n } from "@workspace/ui/lib/i18n"

import { answerOf } from "./device-actions"
import { deviceQueryKeys } from "./device-query-keys"

import { commands } from "../bindings"

const readFailure = () => ({ title: i18n.t("settings:account.readFailed") })

const readDevices = () => answerOf(commands.devicesList())

export const deviceApprovalQuery = queryOptions({
	queryKey: deviceQueryKeys.approval(),
	queryFn: () => commands.deviceApproval(),
	meta: { failureNotice: readFailure, raisedIn: "device-approval-query" },
})

export const devicesListQuery = (isRead: boolean) =>
	queryOptions({
		queryKey: deviceQueryKeys.list(),
		queryFn: isRead ? readDevices : skipToken,
		meta: { failureNotice: readFailure, raisedIn: "devices-list-query" },
	})
