import { useMutation, useQuery } from "@tanstack/react-query"
import { useEffect, useReducer, useState } from "react"

import type {
	DeviceApprovalDialogProps,
	DeviceApprovalStatus,
} from "@workspace/ui/components/device-approval-dialog"
import {
	type NoticeMessage,
	raiseTransientNotice,
} from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import {
	type AskingDevice,
	askingDevicesOf,
	changedApprovalQueue,
	EMPTY_APPROVAL_QUEUE,
} from "./approval-queue"
import { answerOf, deviceFailureNotice } from "./device-actions"
import { deviceNameOf, toDevice } from "./device-mapping"
import { deviceApprovalQuery, devicesListQuery } from "./device-queries"

import {
	type AccountDevice,
	type AccountState,
	commands,
	DEVICE_APPROVAL_REQUESTED_EVENT,
	DEVICE_APPROVAL_SETTLED_EVENT,
	type DeviceApprovalRequested,
	type DeviceApprovalSettled,
} from "../bindings"
import { listen } from "../host"

const RAISED_IN = "use-device-approvals"

type ApprovalsOptions = {
	reportSuccess?: (message: NoticeMessage) => void
}

const reportUnheardEvent = (reason: unknown) => {
	console.error("devices: an approval event could not be listened to", reason)
	return () => undefined
}

const approvedNotice = (request: AskingDevice): NoticeMessage => ({
	title: i18n.t("common:devices.approval.approved.title", {
		device: deviceNameOf(request),
	}),
	description: i18n.t("common:devices.approval.approved.description"),
})

const rejectedNotice = (request: AskingDevice): NoticeMessage => ({
	title: i18n.t("common:devices.approval.rejected.title", {
		device: deviceNameOf(request),
	}),
	description: i18n.t("common:devices.approval.rejected.description"),
})

type ApprovalRun = {
	variables: AskingDevice | undefined
	isPending: boolean
	isError: boolean
}

const approvalStatusOf = (
	{ variables, isPending, isError }: ApprovalRun,
	asked: AskingDevice,
): DeviceApprovalStatus => {
	if (variables?.deviceId !== asked.deviceId) return "asking"
	if (isPending) return "approving"
	if (isError) return "failed"
	return "asking"
}

const useApprovalQueue = (listed: AccountDevice[] | undefined) => {
	const [queue, change] = useReducer(changedApprovalQueue, EMPTY_APPROVAL_QUEUE)
	const [mergedList, setMergedList] = useState(listed)
	if (listed !== mergedList) {
		setMergedList(listed)
		if (listed) {
			change({ kind: "asked", devices: askingDevicesOf(listed, Date.now()) })
		}
	}

	useEffect(() => {
		const listenings = [
			listen<DeviceApprovalRequested>(
				DEVICE_APPROVAL_REQUESTED_EVENT,
				({ payload }) => change({ kind: "asked", devices: [payload] }),
			),
			listen<DeviceApprovalSettled>(
				DEVICE_APPROVAL_SETTLED_EVENT,
				({ payload }) =>
					change({ kind: "settled", deviceId: payload.deviceId }),
			),
		].map((listening) => listening.catch(reportUnheardEvent))
		return () => {
			for (const listening of listenings) {
				void listening.then((stop) => stop())
			}
		}
	}, [])

	const settle = (request: AskingDevice) =>
		change({ kind: "settled", deviceId: request.deviceId })

	return { asked: queue.asking.at(0), settle }
}

export const useDeviceApprovals = (
	state: AccountState | undefined,
	{ reportSuccess = raiseTransientNotice }: ApprovalsOptions = {},
): DeviceApprovalDialogProps | null => {
	const { data: thisApproval } = useQuery(deviceApprovalQuery)
	const isListed =
		state?.kind === "signedIn" && thisApproval?.kind === "approved"
	const { data: listed } = useQuery(devicesListQuery(isListed))
	const { asked, settle } = useApprovalQueue(isListed ? listed : undefined)

	const approval = useMutation({
		mutationFn: (request: AskingDevice) =>
			answerOf(commands.deviceApprove(request.deviceId)),
		onSuccess: (_answer, request) => {
			settle(request)
			reportSuccess(approvedNotice(request))
		},
		meta: { rendersErrorInline: true },
	})
	const refusal = useMutation({
		mutationFn: (request: AskingDevice) =>
			answerOf(commands.deviceRefuse(request.deviceId)),
		onSuccess: (_answer, request) => {
			settle(request)
			reportSuccess(rejectedNotice(request))
		},
		meta: { failureNotice: deviceFailureNotice, raisedIn: RAISED_IN },
	})

	if (!asked) return null
	return {
		open: true,
		device: toDevice(asked),
		status: approvalStatusOf(approval, asked),
		onApprove: () => approval.mutate(asked),
		onReject: () => refusal.mutate(asked),
	}
}
