import type { ReactNode } from "react"

import { type Icon, Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

type DeviceKind = "laptop" | "phone" | "desktop"

type Device = {
	kind: DeviceKind
	name: string
	fingerprint: string
	activity?: string
}

const DEVICE_MARKS = {
	laptop: Icons.Laptop,
	phone: Icons.Smartphone,
	desktop: Icons.Desktop,
} satisfies Record<DeviceKind, Icon>

type DeviceSummaryProps = Omit<Device, "fingerprint"> & {
	isNameStrong?: boolean
	nameId?: string
	children?: ReactNode
}

const DeviceSummary = ({
	kind,
	name,
	activity,
	isNameStrong = false,
	nameId,
	children,
}: DeviceSummaryProps) => {
	const Mark = DEVICE_MARKS[kind]

	return (
		<div className="flex min-w-0 flex-1 items-center gap-3">
			<Mark aria-hidden="true" className="size-5 shrink-0 text-foreground" />
			<div className="flex min-w-0 flex-1 flex-col">
				<p
					className={cn(
						"wrap-break-word text-foreground text-sm",
						isNameStrong && "font-medium",
					)}
					id={nameId}
				>
					{name}
				</p>
				{activity ? (
					<p className="wrap-break-word text-muted-foreground text-xs">
						{activity}
					</p>
				) : null}
				{children}
			</div>
		</div>
	)
}

type DeviceCardProps = DeviceSummaryProps & {
	meta?: string
}

const DeviceCard = ({ meta, ...summary }: DeviceCardProps) => (
	<div
		className="flex items-center gap-3 rounded-xl bg-muted/40 px-3.5 py-3"
		data-slot="device-card"
	>
		<DeviceSummary {...summary} />
		{meta ? (
			<p className="shrink-0 text-muted-foreground text-xs">{meta}</p>
		) : null}
	</div>
)

type DeviceFailureProps = {
	children: string
	className?: string
}

const DeviceFailure = ({ children, className }: DeviceFailureProps) => (
	<p
		className={cn(
			"flex items-start gap-1.5 text-compact text-destructive leading-4.5",
			className,
		)}
		role="alert"
	>
		<Icons.AlertCircle
			aria-hidden="true"
			className="mt-0.5 size-3.5 shrink-0"
		/>
		{children}
	</p>
)

export {
	type Device,
	DeviceCard,
	type DeviceCardProps,
	DeviceFailure,
	type DeviceKind,
	DeviceSummary,
}
