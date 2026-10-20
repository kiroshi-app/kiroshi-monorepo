"use client"

import { AlertDialog } from "@base-ui/react/alert-dialog"
import { useTranslation } from "react-i18next"

import {
	type Device,
	DeviceCard,
	DeviceFailure,
} from "@workspace/ui/components/device-card"
import {
	DIALOG_BACKDROP_CLASS,
	DIALOG_POPUP_CLASS,
} from "@workspace/ui/components/settings-styles"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

type DeviceApprovalStatus = "asking" | "approving" | "failed"

type DeviceApprovalDialogProps = {
	open: boolean
	device: Device
	status?: DeviceApprovalStatus
	onApprove: () => void
	onReject: () => void
}

const PRIMARY_LABEL = {
	asking: "devices.approval.approve",
	approving: "devices.approval.approving",
	failed: "devices.approval.retry",
} as const satisfies Record<DeviceApprovalStatus, string>

const PILL_CLASS = "rounded-full leading-4.5 data-disabled:pointer-events-none"

const DeviceApprovalDialog = ({
	open,
	device,
	status = "asking",
	onApprove,
	onReject,
}: DeviceApprovalDialogProps) => {
	const { t } = useTranslation("common")
	const isApproving = status === "approving"
	const hasFailed = status === "failed"

	return (
		<AlertDialog.Root open={open}>
			<AlertDialog.Portal>
				<AlertDialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
				<AlertDialog.Popup
					className={cn(
						DIALOG_POPUP_CLASS,
						"-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 flex w-110 max-w-[calc(100vw-3rem)] flex-col gap-4.5 rounded-[20px] p-6",
					)}
				>
					<div className="flex flex-col gap-1.5">
						<AlertDialog.Title className="wrap-break-word font-semibold text-[17px] text-foreground leading-6">
							{t("devices.approval.title", { device: device.name })}
						</AlertDialog.Title>
						<AlertDialog.Description className="text-pretty text-muted-foreground text-sm">
							{t("devices.approval.body")}
						</AlertDialog.Description>
					</div>
					<DeviceCard {...device} isNameStrong />
					{hasFailed ? (
						<DeviceFailure>
							{t("devices.approval.failed", { device: device.name })}
						</DeviceFailure>
					) : null}
					<div className="flex justify-end gap-2">
						<Button
							className={cn(PILL_CLASS, "data-disabled:opacity-50")}
							disabled={isApproving}
							focusableWhenDisabled
							onClick={onReject}
							size="lg"
							variant="outline"
						>
							{t("devices.approval.notMe")}
						</Button>
						<Button
							className={cn(PILL_CLASS, "px-5 data-disabled:opacity-70")}
							disabled={isApproving}
							focusableWhenDisabled
							onClick={onApprove}
							size="lg"
						>
							{t(PRIMARY_LABEL[status])}
						</Button>
					</div>
				</AlertDialog.Popup>
			</AlertDialog.Portal>
		</AlertDialog.Root>
	)
}

export {
	DeviceApprovalDialog,
	type DeviceApprovalDialogProps,
	type DeviceApprovalStatus,
}
