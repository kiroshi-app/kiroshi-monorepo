"use client"

import { useEffect } from "react"
import { useTranslation } from "react-i18next"

import {
	type BotAvatarBlot,
	blotTint,
} from "@workspace/ui/components/companion-colour"
import { type Icon, Icons } from "@workspace/ui/components/icons"
import { Button } from "@workspace/ui/components/ui/button"
import {
	createToastManager,
	Toast,
	ToastAction,
	ToastClose,
	ToastContent,
	ToastDescription,
	ToastPortal,
	ToastProvider,
	ToastTitle,
	ToastViewport,
	useToastManager,
} from "@workspace/ui/components/ui/toast"
import { cn } from "@workspace/ui/lib/utils"

const TRANSIENT_NOTICE_DELAY = 5000
const NOTICE_LIMIT = 3

type NoticeData = {
	spaceColour?: BotAvatarBlot
}

const noticeManager = createToastManager<NoticeData>()

type NoticeType = "error" | "info" | "loading" | "success" | "warning"

type TransientNoticeType = Exclude<NoticeType, "error">

type NoticeAction = {
	label: string
	onPress: () => void
}

type NoticeMessage = {
	title: string
	description?: string
	action?: NoticeAction
	spaceColour?: BotAvatarBlot
}

type TransientNotice = NoticeMessage & {
	type?: TransientNoticeType
}

type FailureNotice = NoticeMessage & {
	onClose?: () => void
}

type RaisedNotice = FailureNotice & {
	type: NoticeType
	priority: "high" | "low"
	timeout?: number
}

let raisedNoticeCount = 0

const raiseNotice = ({ action, spaceColour, ...notice }: RaisedNotice) => {
	raisedNoticeCount += 1
	const id = `notice-${raisedNoticeCount}`

	return noticeManager.add({
		...notice,
		actionProps: action && {
			children: action.label,
			onClick: () => {
				action.onPress()
				endNotice(id)
			},
		},
		data: { spaceColour },
		id,
	})
}

const raiseTransientNotice = ({
	type = "success",
	...message
}: TransientNotice) => raiseNotice({ ...message, priority: "low", type })

const failuresOnSurface = new Map<string, string>()

const raiseFailureNotice = ({ onClose, ...message }: FailureNotice) => {
	const failure = JSON.stringify([message.title, message.description])
	const shown = failuresOnSurface.get(failure)
	if (shown) return shown

	const id = raiseNotice({
		...message,
		onClose: () => {
			failuresOnSurface.delete(failure)
			onClose?.()
		},
		priority: "high",
		timeout: 0,
		type: "error",
	})
	failuresOnSurface.set(failure, id)

	return id
}

const endNotice = (id: string) => noticeManager.close(id)

const NOTICE_MARKS = {
	error: Icons.Error,
	info: Icons.Info,
	loading: Icons.Loading,
	success: Icons.Success,
	warning: Icons.Alert,
} satisfies Record<NoticeType, Icon>

const TOP_CENTRED_VIEWPORT =
	"top-4 bottom-auto z-100 sm:inset-x-4 sm:mx-auto sm:w-auto"

const TOP_ANCHORED_NOTICE = [
	"top-0 bottom-auto origin-top",
	"[--offset-y:calc(var(--toast-offset-y)+calc(var(--toast-index)*var(--gap))+var(--toast-swipe-movement-y))]",
	"[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)+(var(--toast-index)*var(--peek))+(var(--shrink)*var(--height))))_scale(var(--scale))]",
	"data-starting-style:[transform:translateY(-150%)]",
	"[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(-150%)]",
].join(" ")

const FADE_ONLY_UNDER_REDUCED_MOTION =
	"motion-reduce:[transition:opacity_150ms]! motion-reduce:data-starting-style:[transform:none]! motion-reduce:data-starting-style:opacity-0 motion-reduce:data-ending-style:[transform:none]! motion-reduce:data-ending-style:opacity-0"

const SPACE_MARK =
	"pointer-events-none size-2.5 shrink-0 rounded-[3px] inset-ring-[1.5px] inset-ring-current"

type NoticeMarkProps = {
	type: string | undefined
	spaceColour?: BotAvatarBlot
}

const NoticeMark = ({ type, spaceColour }: NoticeMarkProps) => {
	if (spaceColour) {
		return (
			<span
				aria-hidden="true"
				className={SPACE_MARK}
				data-slot="notice-space-mark"
				style={{ color: blotTint(spaceColour) }}
			/>
		)
	}

	const Mark = NOTICE_MARKS[type as NoticeType]

	if (!Mark) {
		return null
	}

	return (
		<Mark
			className={cn(
				"pointer-events-none size-4 shrink-0",
				type === "error" && "text-destructive",
				type === "loading" && "animate-spin motion-reduce:animate-none",
			)}
		/>
	)
}

const NoticeList = () => {
	const { t } = useTranslation("common")
	const { toasts } = useToastManager<NoticeData>()

	return toasts.map((notice) => (
		<Toast
			className={cn(
				"pointer-events-auto",
				TOP_ANCHORED_NOTICE,
				FADE_ONLY_UNDER_REDUCED_MOTION,
			)}
			key={notice.id}
			swipeDirection={["up"]}
			toast={notice}
		>
			<ToastContent>
				<NoticeMark spaceColour={notice.data?.spaceColour} type={notice.type} />
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<ToastTitle className="break-words font-semibold" />
					<ToastDescription className="text-pretty break-words" />
				</div>
				<ToastAction />
				<ToastClose
					render={
						<Button
							aria-label={t("notice.close")}
							size="icon-sm"
							variant="ghost"
						/>
					}
				/>
			</ToastContent>
		</Toast>
	))
}

type NoticeSurfaceProps = {
	transientDelay?: number
}

const NoticeSurface = ({
	transientDelay = TRANSIENT_NOTICE_DELAY,
}: NoticeSurfaceProps) => {
	const { t } = useTranslation("common")

	useEffect(() => {
		failuresOnSurface.clear()
	}, [])

	return (
		<ToastProvider
			limit={NOTICE_LIMIT}
			timeout={transientDelay}
			toastManager={noticeManager}
		>
			<ToastPortal>
				<ToastViewport
					aria-label={t("notice.label")}
					className={TOP_CENTRED_VIEWPORT}
				>
					<NoticeList />
				</ToastViewport>
			</ToastPortal>
		</ToastProvider>
	)
}

export {
	endNotice,
	type NoticeMessage,
	NoticeSurface,
	type NoticeSurfaceProps,
	raiseFailureNotice,
	raiseTransientNotice,
	TRANSIENT_NOTICE_DELAY,
	type TransientNoticeType,
}
