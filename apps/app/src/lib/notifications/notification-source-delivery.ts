import type { NotificationRequest } from "./notification-port"
import type {
	NotificationSourceOptions,
	NotificationSourceSwitches,
} from "./notification-source"
import type { FailWith } from "./notification-source-failures"

export type Reading = {
	switches: NotificationSourceSwitches
	hasFocus: boolean
}

export type Deliver = (
	requests: NotificationRequest[],
	reading: Reading,
) => void

type DeliveryOptions = Pick<
	NotificationSourceOptions,
	"notifications" | "playChime"
> & {
	failWith: FailWith
}

export const createDelivery =
	({ notifications, playChime, failWith }: DeliveryOptions): Deliver =>
	(requests, reading) => {
		for (const request of requests) {
			void notifications.send(request).catch(failWith("send"))
		}

		if (requests.length > 0 && reading.switches.notifyWithSound) {
			playChime()
		}
	}
