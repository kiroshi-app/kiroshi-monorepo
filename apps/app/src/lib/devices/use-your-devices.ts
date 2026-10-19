import {
	skipToken,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"

import type { Device } from "@workspace/ui/components/device-card"
import {
	type NoticeMessage,
	raiseTransientNotice,
} from "@workspace/ui/components/notice-surface"
import type {
	DeviceRemoval,
	OtherDevice,
	YourDevicesProps,
} from "@workspace/ui/components/user-settings-dialog/your-devices"
import { i18n } from "@workspace/ui/lib/i18n"

import { answerOf, DeviceNotRemoved } from "./device-actions"
import { activityOf, deviceNameOf, toDevice } from "./device-mapping"
import { deviceQueryKeys } from "./device-query-keys"

import {
	type AccountDevice,
	type AccountState,
	commands,
	DEVICE_APPROVAL_REQUESTED_EVENT,
	DEVICE_APPROVAL_SETTLED_EVENT,
} from "../bindings"
import { useInvalidateOnHostEvent } from "../query/host-invalidations"
import { isFirstReadPending } from "../query/last-read"

const RAISED_IN = "use-your-devices"

const UNREAD_DEVICE: Device = { kind: "laptop", name: "", fingerprint: "" }

const readDevices = () => answerOf(commands.devicesList())

const removeDevice = async (device: AccountDevice) => {
	const answer = await commands.deviceRemove(device.id)
	if (answer.status === "error")
		throw new DeviceNotRemoved(device, answer.error)
}

const removedNotice = (device: AccountDevice): NoticeMessage => ({
	title: i18n.t("settings:account.devices.removed.title", {
		device: deviceNameOf(device),
	}),
	description: i18n.t("settings:account.devices.removed.description"),
})

const notRemovedNotice = (
	failure: unknown,
	retry: (device: AccountDevice) => void,
): NoticeMessage => {
	if (!(failure instanceof DeviceNotRemoved)) {
		return { title: i18n.t("chat:screen.notice.failed") }
	}
	const { device } = failure
	return {
		title: i18n.t("settings:account.devices.confirm.failed", {
			device: deviceNameOf(device),
		}),
		action: {
			label: i18n.t("common:devices.approval.retry"),
			onPress: () => retry(device),
		},
	}
}

const toOtherDevice = (device: AccountDevice, now: number): OtherDevice => ({
	...toDevice(device),
	id: device.id,
	activity: activityOf(device.lastActiveAt, now),
})

const without = (devices: AccountDevice[] | undefined, removed: string) =>
	devices?.filter((device) => device.id !== removed)

type RemovalRun = {
	variables: AccountDevice | undefined
	isPending: boolean
	isError: boolean
}

const removalOf = ({
	variables,
	isPending,
	isError,
}: RemovalRun): DeviceRemoval | null => {
	if (!variables) return null
	if (isPending) return { deviceId: variables.id, status: "removing" }
	if (isError) return { deviceId: variables.id, status: "failed" }
	return null
}

type YourDevicesOptions = {
	isShown: boolean
	reportSuccess?: (message: NoticeMessage) => void
}

export const useYourDevices = (
	state: AccountState | undefined,
	{ isShown, reportSuccess = raiseTransientNotice }: YourDevicesOptions,
): YourDevicesProps | undefined => {
	const queryClient = useQueryClient()
	const email = state?.kind === "signedIn" ? state.email : null
	const isRead = isShown && email !== null

	const read = useQuery({
		queryKey: deviceQueryKeys.list(),
		queryFn: isRead ? readDevices : skipToken,
		meta: {
			failureNotice: () => ({ title: i18n.t("settings:account.readFailed") }),
			raisedIn: RAISED_IN,
		},
	})
	useInvalidateOnHostEvent(DEVICE_APPROVAL_REQUESTED_EVENT, [
		deviceQueryKeys.list(),
	])
	useInvalidateOnHostEvent(DEVICE_APPROVAL_SETTLED_EVENT, [
		deviceQueryKeys.list(),
	])

	const removal = useMutation({
		mutationFn: removeDevice,
		onSuccess: (_answer, device) => {
			queryClient.setQueryData<AccountDevice[]>(
				deviceQueryKeys.list(),
				(held) => without(held, device.id),
			)
			reportSuccess(removedNotice(device))
		},
		meta: {
			failureNotice: (failure) =>
				notRemovedNotice(failure, (device) => removal.mutate(device)),
			raisedIn: RAISED_IN,
		},
	})

	if (email === null || read.isError) return undefined
	const devices = read.data ?? []
	const isPending = isFirstReadPending(read)
	const current = devices.find((device) => device.current)
	if (!isPending && !current) return undefined

	const now = Date.now()

	return {
		email,
		thisDevice: current ? toDevice(current) : UNREAD_DEVICE,
		otherDevices: devices
			.filter((device) => !device.current)
			.map((device) => toOtherDevice(device, now)),
		isPending,
		removal: removalOf(removal),
		onRemove: (deviceId) => {
			const device = devices.find((listed) => listed.id === deviceId)
			if (device) removal.mutate(device)
		},
		onCancelRemoval: () => removal.reset(),
	}
}
