"use client"

import { REGEXP_ONLY_DIGITS } from "input-otp"
import { type ReactNode, useState } from "react"
import { useTranslation } from "react-i18next"

import { type Device, DeviceCard } from "@workspace/ui/components/device-card"
import {
	FullWindowContent,
	FullWindowLayout,
} from "@workspace/ui/components/full-window-layout"
import { Icons } from "@workspace/ui/components/icons"
import { Button } from "@workspace/ui/components/ui/button"
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSlot,
} from "@workspace/ui/components/ui/input-otp"

type NewDeviceStep = "waiting" | "code" | "expired" | "rejected"

type NewDeviceScreenProps = {
	step: NewDeviceStep
	email: string
	device: Device
	onUseCode: () => void
	onApproveWithCode: (code: string) => void
	onResendCode: () => void
	onAskAgain: () => void
	onSignOut: () => void
	onBackToSignIn: () => void
}

const CODE_LENGTH = 6

const CODE_SLOTS = Array.from({ length: CODE_LENGTH }, (_, slot) => slot)

const CODE_SLOT_CLASS =
	"h-14 w-12 rounded-control border border-shell-divider bg-muted/40 font-medium text-2xl text-foreground tabular-nums leading-7 first:rounded-control first:border-l last:rounded-control data-[active=true]:border-ring data-[active=true]:ring-0 data-[active=true]:inset-ring-[0.5px] data-[active=true]:inset-ring-ring [&>div>div]:h-6 [&>div>div]:w-[1.5px] [&>div>div]:motion-reduce:animate-none"

const PRIMARY_CLASS = "rounded-full px-5 leading-4.5"

const LINK_CLASS =
	"relative rounded-xs font-medium text-compact text-foreground leading-4.5 underline decoration-1 underline-offset-2 outline-offset-2 after:absolute after:-inset-1"

type ScreenLinkProps = {
	onPress: () => void
	children: string
}

const ScreenLink = ({ onPress, children }: ScreenLinkProps) => (
	<button className={LINK_CLASS} onClick={onPress} type="button">
		{children}
	</button>
)

type CodeEntryProps = {
	onApprove: (code: string) => void
}

const CodeEntry = ({ onApprove }: CodeEntryProps) => {
	const { t } = useTranslation("common")
	const [code, setCode] = useState("")

	return (
		<>
			<InputOTP
				aria-label={t("devices.newDevice.code.label")}
				containerClassName="gap-2"
				maxLength={CODE_LENGTH}
				onChange={setCode}
				pattern={REGEXP_ONLY_DIGITS}
				value={code}
			>
				<InputOTPGroup className="gap-2">
					{CODE_SLOTS.map((slot) => (
						<InputOTPSlot className={CODE_SLOT_CLASS} index={slot} key={slot} />
					))}
				</InputOTPGroup>
			</InputOTP>
			<Button
				className={`${PRIMARY_CLASS} data-disabled:pointer-events-none data-disabled:opacity-50`}
				disabled={code.length < CODE_LENGTH}
				focusableWhenDisabled
				onClick={() => onApprove(code)}
				size="lg"
			>
				{t("devices.newDevice.code.approve")}
			</Button>
		</>
	)
}

const NewDeviceScreen = ({
	step,
	email,
	device,
	onUseCode,
	onApproveWithCode,
	onResendCode,
	onAskAgain,
	onSignOut,
	onBackToSignIn,
}: NewDeviceScreenProps) => {
	const { t } = useTranslation("common")
	const Mark = step === "code" ? Icons.Mail : Icons.Laptop

	const card = (
		<div className="w-110 max-w-full">
			<DeviceCard {...device} meta={t("devices.newDevice.thisDevice")} />
		</div>
	)

	const signOut = (
		<ScreenLink onPress={onSignOut}>
			{t("devices.newDevice.signOut")}
		</ScreenLink>
	)

	const noOtherDevice = (
		<ScreenLink onPress={onUseCode}>
			{t("devices.newDevice.noOtherDevice")}
		</ScreenLink>
	)

	const body: Record<NewDeviceStep, ReactNode> = {
		waiting: (
			<>
				{card}
				<p
					className="flex items-center gap-2 text-compact text-muted-foreground leading-4.5"
					role="status"
				>
					<span
						aria-hidden="true"
						className="size-3.5 animate-spin rounded-full border-2 border-input border-t-muted-foreground motion-reduce:animate-none"
					/>
					{t("devices.newDevice.waiting.status")}
				</p>
			</>
		),
		code: <CodeEntry onApprove={onApproveWithCode} />,
		expired: (
			<>
				{card}
				<Button className={PRIMARY_CLASS} onClick={onAskAgain} size="lg">
					{t("devices.newDevice.expired.askAgain")}
				</Button>
			</>
		),
		rejected: card,
	}

	const links: Record<NewDeviceStep, ReactNode> = {
		waiting: (
			<>
				{noOtherDevice}
				{signOut}
			</>
		),
		code: (
			<>
				<ScreenLink onPress={onResendCode}>
					{t("devices.newDevice.code.resend")}
				</ScreenLink>
				{signOut}
			</>
		),
		expired: (
			<>
				{noOtherDevice}
				{signOut}
			</>
		),
		rejected: (
			<ScreenLink onPress={onBackToSignIn}>
				{t("devices.newDevice.rejected.backToSignIn")}
			</ScreenLink>
		),
	}

	return (
		<FullWindowLayout data-step={step} data-slot="new-device-screen">
			<FullWindowContent className="gap-5 p-6">
				<span className="grid size-14 shrink-0 place-items-center rounded-[1rem] bg-muted/40">
					<Mark aria-hidden="true" className="size-6 text-foreground" />
				</span>
				<div className="flex w-105 max-w-full flex-col gap-2 text-center">
					<h1 className="text-balance font-semibold text-[22px] text-foreground leading-7 tracking-[-0.01em]">
						{t(`devices.newDevice.${step}.title`)}
					</h1>
					<p className="text-pretty text-muted-foreground text-sm">
						{t(`devices.newDevice.${step}.body`, { email })}
					</p>
				</div>
				{body[step]}
				<div className="flex flex-wrap justify-center gap-5 pt-1">
					{links[step]}
				</div>
			</FullWindowContent>
		</FullWindowLayout>
	)
}

export { NewDeviceScreen, type NewDeviceScreenProps, type NewDeviceStep }
