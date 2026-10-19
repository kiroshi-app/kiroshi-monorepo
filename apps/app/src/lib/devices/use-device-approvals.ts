import { useMutation } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import type {
	DeviceApprovalDialogProps,
	DeviceApprovalStatus,
} from "@workspace/ui/components/device-approval-dialog"
import {
	type NoticeMessage,
	raiseTransientNotice,
} from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { answerOf, deviceFailureNotice } from "./device-actions"
import { deviceNameOf, toDevice } from "./device-mapping"

import {
	commands,
	DEVICE_APPROVAL_REQUESTED_EVENT,
	DEVICE_APPROVAL_SETTLED_EVENT,
	type DeviceApprovalRequested,
	type DeviceApprovalSettled,
} from "../bindings"
import { listen } from "../host"

const RAISED_IN = "use-device-approvals"

type Request = DeviceApprovalRequested

type ApprovalsOptions = {
	reportSuccess?: (message: NoticeMessage) => void
}

const reportUnheardEvent = (reason: unknown) => {
	console.error("devices: an approval event could not be listened to", reason)
	return () => undefined
}

const approvedNotice = (request: Request): NoticeMessage => ({
	title: i18n.t("common:devices.approval.approved.title", {
		device: deviceNameOf(request),
	}),
	description: i18n.t("common:devices.approval.approved.description"),
})

const rejectedNotice = (request: Request): NoticeMessage => ({
	title: i18n.t("common:devices.approval.rejected.title", {
		device: deviceNameOf(request),
	}),
	description: i18n.t("common:devices.approval.rejected.description"),
})

const queuedOnce = (queue: Request[], request: Request) =>
	queue.some((queued) => queued.deviceId === request.deviceId)
		? queue
		: [...queue, request]

const withoutDevice = (queue: Request[], deviceId: string) =>
	queue.filter((queued) => queued.deviceId !== deviceId)

type ApprovalRun = {
	variables: Request | undefined
	isPending: boolean
	isError: boolean
}

const approvalStatusOf = (
	{ variables, isPending, isError }: ApprovalRun,
	asked: Request,
): DeviceApprovalStatus => {
	if (variables?.deviceId !== asked.deviceId) return "asking"
	if (isPending) return "approving"
	if (isError) return "failed"
	return "asking"
}

const useApprovalQueue = () => {
	const [queue, setQueue] = useState<Request[]>([])

	useEffect(() => {
		const listenings = [
			listen<Request>(DEVICE_APPROVAL_REQUESTED_EVENT, ({ payload }) =>
				setQueue((held) => queuedOnce(held, payload)),
			),
			listen<DeviceApprovalSettled>(
				DEVICE_APPROVAL_SETTLED_EVENT,
				({ payload }) =>
					setQueue((held) => withoutDevice(held, payload.deviceId)),
			),
		].map((listening) => listening.catch(reportUnheardEvent))
		return () => {
			for (const listening of listenings) {
				void listening.then((stop) => stop())
			}
		}
	}, [])

	const settle = (request: Request) =>
		setQueue((held) => withoutDevice(held, request.deviceId))

	return { asked: queue.at(0), settle }
}

export const useDeviceApprovals = ({
	reportSuccess = raiseTransientNotice,
}: ApprovalsOptions = {}): DeviceApprovalDialogProps | null => {
	const { asked, settle } = useApprovalQueue()

	const approval = useMutation({
		mutationFn: (request: Request) =>
			answerOf(commands.deviceApprove(request.deviceId)),
		onSuccess: (_answer, request) => {
			settle(request)
			reportSuccess(approvedNotice(request))
		},
		meta: { rendersErrorInline: true },
	})
	const refusal = useMutation({
		mutationFn: (request: Request) =>
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
