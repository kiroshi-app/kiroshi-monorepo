"use client"

import { useId, useState } from "react"
import { useTranslation } from "react-i18next"

import {
	type Device,
	DeviceCard,
	DeviceFailure,
	DeviceSummary,
} from "@workspace/ui/components/device-card"
import { Button } from "@workspace/ui/components/ui/button"
import { Skeleton } from "@workspace/ui/components/ui/skeleton"
import { useSkeletonTiming } from "@workspace/ui/hooks/use-skeleton-timing"
import { cn } from "@workspace/ui/lib/utils"

type OtherDevice = Device & {
	id: string
}

type DeviceRemovalStatus = "removing" | "failed"

type DeviceRemoval = {
	deviceId: string
	status: DeviceRemovalStatus
}

type YourDevicesProps = {
	email: string
	thisDevice: Device
	otherDevices: OtherDevice[]
	isPending?: boolean
	removal?: DeviceRemoval | null
	onRemove: (deviceId: string) => void
	onCancelRemoval: () => void
}

const LIST_CLASS =
	"flex flex-col divide-y divide-border overflow-hidden rounded-xl ring-1 ring-border"

const GROUP_LABEL_CLASS = "font-medium text-foreground text-xs"

const CONFIRM_BUTTON_CLASS =
	"h-7.5 rounded-full px-3.5 text-compact leading-4 data-disabled:pointer-events-none"

const SKELETON_ROWS = [
	{ id: "first", name: "w-24", activity: "w-30", fingerprint: "w-49" },
	{ id: "second", name: "w-32", activity: "w-25", fingerprint: "w-45" },
	{ id: "third", name: "w-21", activity: "w-33", fingerprint: "w-51" },
]

type BoneProps = {
	className: string
}

type FocusTaker = (node: HTMLElement | null) => void

type FocusRequest = {
	deviceId: string | null
	take: FocusTaker
}

const focusRequestFor = (deviceId: string | null): FocusRequest => ({
	deviceId,
	take: (node) => {
		node?.focus()
	},
})

const survivorOf = (
	listed: OtherDevice[],
	remaining: OtherDevice[],
	deviceId: string,
) => {
	const at = listed.findIndex((device) => device.id === deviceId)
	const stays = (device: OtherDevice) =>
		remaining.some((kept) => kept.id === device.id)

	return listed.slice(at + 1).find(stays) ?? listed.slice(0, at).findLast(stays)
}

const Bone = ({ className }: BoneProps) => (
	<Skeleton className={cn("animate-none rounded-full", className)} />
)

const DevicesSkeleton = () => (
	<div
		aria-hidden="true"
		className="flex min-h-0 flex-1 animate-pulse flex-col gap-4 motion-reduce:animate-none"
		data-slot="your-devices-skeleton"
	>
		<div className="flex h-11.5 shrink-0 items-center gap-3 rounded-xl bg-muted/40 px-3.5">
			<Skeleton className="size-5 animate-none rounded-[6px]" />
			<div className="flex flex-col gap-2">
				<Bone className="h-2.5 w-35" />
				<Bone className="h-2 w-50 bg-muted/40" />
			</div>
		</div>
		<div className={cn(LIST_CLASS, "min-h-0 flex-1 divide-y-0")}>
			{SKELETON_ROWS.map((row) => (
				<div className="flex items-start gap-3 p-3.5" key={row.id}>
					<Skeleton className="size-5 shrink-0 animate-none rounded-[6px]" />
					<div className="flex flex-col gap-1.5">
						<Bone className={cn("h-2.5", row.name)} />
						<Bone className={cn("h-2 bg-muted/65", row.activity)} />
						<Bone className={cn("h-2 bg-muted/65", row.fingerprint)} />
					</div>
				</div>
			))}
		</div>
	</div>
)

type DeviceRowProps = {
	device: OtherDevice
	focusTaker?: FocusTaker
	onRemovePress: () => void
}

const DeviceRow = ({ device, focusTaker, onRemovePress }: DeviceRowProps) => {
	const { t } = useTranslation("settings")
	const nameId = useId()

	return (
		<li className="flex items-center gap-3 py-3 ps-3.5 pe-3">
			<DeviceSummary {...device} nameId={nameId} />
			<span className="flex w-18 shrink-0 justify-center">
				<button
					aria-describedby={nameId}
					className="relative rounded-xs text-compact text-muted-foreground leading-4 outline-offset-2 transition-colors duration-150 after:absolute after:-inset-1 hover:text-foreground motion-reduce:transition-none"
					onClick={onRemovePress}
					ref={focusTaker}
					type="button"
				>
					{t("account.devices.remove")}
				</button>
			</span>
		</li>
	)
}

type RemovalConfirmProps = {
	device: OtherDevice
	focusTaker?: FocusTaker
	status: DeviceRemovalStatus | null
	onRemove: () => void
	onCancel: () => void
}

const RemovalConfirm = ({
	device,
	focusTaker,
	status,
	onRemove,
	onCancel,
}: RemovalConfirmProps) => {
	const { t } = useTranslation("settings")
	const titleId = useId()
	const isRemoving = status === "removing"

	return (
		<li
			className="flex flex-col gap-2.5 bg-destructive/10 pt-3 ps-3.5 pe-3 pb-3.5"
			data-slot="device-removal-confirm"
		>
			<DeviceSummary
				fingerprint={device.fingerprint}
				isNameStrong
				kind={device.kind}
				name={t("account.devices.confirm.title", { device: device.name })}
				nameId={titleId}
			>
				<p className="text-compact text-foreground leading-4.5">
					{t("account.devices.confirm.body")}
				</p>
			</DeviceSummary>
			{status === "failed" ? (
				<DeviceFailure className="ps-8">
					{t("account.devices.confirm.failed", { device: device.name })}
				</DeviceFailure>
			) : null}
			<div className="flex gap-2 ps-8">
				<Button
					aria-describedby={titleId}
					className={cn(
						CONFIRM_BUTTON_CLASS,
						"bg-destructive/60 text-foreground hover:bg-destructive/50 data-disabled:opacity-70",
					)}
					disabled={isRemoving}
					focusableWhenDisabled
					onClick={onRemove}
				>
					{isRemoving
						? t("account.devices.confirm.removing")
						: t("account.devices.confirm.remove")}
				</Button>
				<Button
					aria-describedby={titleId}
					className={cn(CONFIRM_BUTTON_CLASS, "data-disabled:opacity-50")}
					disabled={isRemoving}
					focusableWhenDisabled
					onClick={onCancel}
					ref={focusTaker}
					variant="secondary"
				>
					{t("account.devices.confirm.cancel")}
				</Button>
			</div>
		</li>
	)
}

const YourDevices = ({
	email,
	thisDevice,
	otherDevices,
	isPending = false,
	removal,
	onRemove,
	onCancelRemoval,
}: YourDevicesProps) => {
	const { t } = useTranslation("settings")
	const phase = useSkeletonTiming(isPending)
	const titleId = useId()
	const [confirmingId, setConfirmingId] = useState<string | null>(
		removal?.deviceId ?? null,
	)
	const [focus, setFocus] = useState<FocusRequest | null>(null)
	const [listed, setListed] = useState(otherDevices)

	if (listed !== otherDevices) {
		setListed(otherDevices)
		const hasLeft =
			confirmingId !== null &&
			listed.some((device) => device.id === confirmingId) &&
			!otherDevices.some((device) => device.id === confirmingId)
		if (hasLeft) {
			setConfirmingId(null)
			setFocus(
				focusRequestFor(
					survivorOf(listed, otherDevices, confirmingId)?.id ?? null,
				),
			)
		}
	}

	const confirm = (deviceId: string) => {
		setConfirmingId(deviceId)
		setFocus(focusRequestFor(deviceId))
	}

	const cancel = (deviceId: string) => {
		setConfirmingId(null)
		setFocus(focusRequestFor(deviceId))
		onCancelRemoval()
	}

	const focusTakerOf = (deviceId: string | null) =>
		focus && focus.deviceId === deviceId ? focus.take : undefined

	const isWaiting = phase === "delay" || phase === "skeleton"

	return (
		<section
			aria-busy={isWaiting || undefined}
			aria-labelledby={titleId}
			className="flex min-h-0 flex-1 flex-col gap-5"
		>
			<div className="flex flex-col gap-1">
				<h3
					className="font-semibold text-base text-foreground leading-5.5"
					id={titleId}
				>
					{t("account.devices.title")}
				</h3>
				<p className="text-compact text-muted-foreground leading-4.5">
					{t("account.devices.description")}
				</p>
			</div>
			{phase === "skeleton" ? <DevicesSkeleton /> : null}
			{isWaiting ? null : (
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1.5">
						<h4 className={GROUP_LABEL_CLASS}>
							{t("account.devices.thisDevice")}
						</h4>
						<DeviceCard {...thisDevice} meta={t("account.devices.activeNow")} />
					</div>
					<div className="flex flex-col gap-1.5">
						<h4 className={GROUP_LABEL_CLASS}>
							{t("account.devices.otherDevices")}
						</h4>
						{otherDevices.length > 0 ? (
							<ul className={LIST_CLASS}>
								{otherDevices.map((device) =>
									device.id === confirmingId ? (
										<RemovalConfirm
											device={device}
											key={device.id}
											onCancel={() => cancel(device.id)}
											onRemove={() => onRemove(device.id)}
											status={
												removal?.deviceId === device.id ? removal.status : null
											}
											focusTaker={focusTakerOf(device.id)}
										/>
									) : (
										<DeviceRow
											device={device}
											key={device.id}
											focusTaker={focusTakerOf(device.id)}
											onRemovePress={() => confirm(device.id)}
										/>
									),
								)}
							</ul>
						) : (
							<p
								className="rounded-xl border border-input border-dashed p-4 text-compact text-muted-foreground leading-4.5"
								ref={focusTakerOf(null)}
								tabIndex={-1}
							>
								{t("account.devices.empty", { email })}
							</p>
						)}
					</div>
				</div>
			)}
		</section>
	)
}

export {
	type DeviceRemoval,
	type OtherDevice,
	YourDevices,
	type YourDevicesProps,
}
