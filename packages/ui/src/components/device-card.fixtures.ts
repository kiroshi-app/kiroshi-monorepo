import type { Device } from "@workspace/ui/components/device-card"
import type { OtherDevice } from "@workspace/ui/components/user-settings-dialog/your-devices"

export const ACCOUNT_EMAIL = "noa@example.com"

export const ASKING_PHONE: Device = {
	kind: "phone",
	name: "Noa’s iPhone 17",
	activity: "Asked just now",
	fingerprint: "antenna hockey hawk giant tree palm",
}

export const THIS_MACBOOK_PRO: Device = {
	kind: "laptop",
	name: "Noa’s MacBook Pro",
	fingerprint: "water you baby width tourist company",
}

export const MAC_MINI: OtherDevice = {
	id: "mac-mini",
	kind: "desktop",
	name: "Mac mini",
	activity: "Active 2 hours ago",
	fingerprint: "orbit velvet canal fossil ripple mango",
}

export const LISTED_PHONE: OtherDevice = {
	id: "iphone-17",
	kind: "phone",
	name: "Noa’s iPhone 17",
	activity: "Active yesterday",
	fingerprint: "antenna hockey hawk giant tree palm",
}

export const OTHER_DEVICES: OtherDevice[] = [MAC_MINI, LISTED_PHONE]

export const NEW_MACBOOK_AIR: Device = {
	kind: "laptop",
	name: "Noa’s MacBook Air",
	fingerprint: "ocean violin parade lunch eagle pencil",
}
