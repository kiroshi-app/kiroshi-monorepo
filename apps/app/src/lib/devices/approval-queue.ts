import type { AccountDevice, DeviceApprovalRequested } from "../bindings"

export type AskingDevice = Pick<
	DeviceApprovalRequested,
	"deviceId" | "name" | "kind" | "fingerprint" | "expiresAt"
>

export type ApprovalQueue = {
	asking: AskingDevice[]
	answered: string[]
}

export type ApprovalQueueChange =
	| { kind: "asked"; devices: AskingDevice[] }
	| { kind: "settled"; deviceId: string }

export const EMPTY_APPROVAL_QUEUE: ApprovalQueue = { asking: [], answered: [] }

const requestKeyOf = ({ deviceId, expiresAt }: AskingDevice) =>
	`${deviceId}@${expiresAt}`

const isAskingBefore = (device: AccountDevice, now: number) =>
	!device.current &&
	device.status === "pending" &&
	device.approvalExpiresAt !== null &&
	Date.parse(device.approvalExpiresAt) > now

const askingDeviceOf = (device: AccountDevice): AskingDevice => ({
	deviceId: device.id,
	name: device.name,
	kind: device.kind,
	fingerprint: device.fingerprint,
	expiresAt: device.approvalExpiresAt ?? "",
})

export const askingDevicesOf = (
	devices: AccountDevice[],
	now: number,
): AskingDevice[] =>
	devices.filter((device) => isAskingBefore(device, now)).map(askingDeviceOf)

const isHeld = (queue: ApprovalQueue, device: AskingDevice) =>
	queue.asking.some((held) => held.deviceId === device.deviceId) ||
	queue.answered.includes(requestKeyOf(device))

const asked = (queue: ApprovalQueue, devices: AskingDevice[]) => {
	const fresh = devices.filter((device) => !isHeld(queue, device))
	if (fresh.length === 0) return queue
	return { ...queue, asking: [...queue.asking, ...fresh] }
}

const settled = (queue: ApprovalQueue, deviceId: string) => {
	const answered = queue.asking.find((held) => held.deviceId === deviceId)
	if (!answered) return queue
	return {
		asking: queue.asking.filter((held) => held !== answered),
		answered: [...queue.answered, requestKeyOf(answered)],
	}
}

export const changedApprovalQueue = (
	queue: ApprovalQueue,
	change: ApprovalQueueChange,
): ApprovalQueue =>
	change.kind === "asked"
		? asked(queue, change.devices)
		: settled(queue, change.deviceId)
