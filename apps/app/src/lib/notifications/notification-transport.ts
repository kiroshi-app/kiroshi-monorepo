import type { NotificationPort, NotificationTarget } from "./notification-port"

import { invoke, listen } from "../host"

const ACTIVATED_EVENT = "notification://activated"

export const notificationTransport: NotificationPort = {
	send: async ({ target, title, body }) => {
		await invoke("notification_show", { target, title, body })
	},

	onActivate: (listener) =>
		listen<NotificationTarget>(ACTIVATED_EVENT, (event) =>
			listener(event.payload),
		),
}
