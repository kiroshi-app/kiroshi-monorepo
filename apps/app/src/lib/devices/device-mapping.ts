import type {
	Device,
	DeviceKind as ShownDeviceKind,
} from "@workspace/ui/components/device-card"
import { i18n } from "@workspace/ui/lib/i18n"

import type { DeviceKind } from "../bindings"

type DescribedDevice = {
	name: string | null
	kind: DeviceKind
	fingerprint: string[] | null
}

const SHOWN_KINDS = {
	phone: "phone",
	computer: "laptop",
} satisfies Record<DeviceKind, ShownDeviceKind>

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	["year", 31_536_000],
	["month", 2_592_000],
	["week", 604_800],
	["day", 86_400],
	["hour", 3_600],
	["minute", 60],
	["second", 1],
]

const SECOND_UNIT = RELATIVE_UNITS[RELATIVE_UNITS.length - 1]

export const fingerprintOf = (words: string[] | null) => words?.join(" ") ?? ""

export const activityOf = (stamp: string, now: number): string | undefined => {
	const at = Date.parse(stamp)
	if (Number.isNaN(at)) return undefined
	const elapsed = (at - now) / 1000
	const [unit, seconds] =
		RELATIVE_UNITS.find(([, length]) => Math.abs(elapsed) >= length) ??
		SECOND_UNIT
	return new Intl.RelativeTimeFormat(i18n.language, {
		numeric: "auto",
	}).format(Math.round(elapsed / seconds), unit)
}

export const toDevice = ({
	name,
	kind,
	fingerprint,
}: DescribedDevice): Device => ({
	kind: SHOWN_KINDS[kind],
	name: name ?? "",
	fingerprint: fingerprintOf(fingerprint),
})
