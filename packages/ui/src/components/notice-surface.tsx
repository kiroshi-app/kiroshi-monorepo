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
import { useCopyText } from "@workspace/ui/hooks/use-copy-text"
import { cn } from "@workspace/ui/lib/utils"

const TRANSIENT_NOTICE_DELAY = 5000
const NOTICE_LIMIT = 3

type NoticeData = {
	spaceColour?: BotAvatarBlot
	reportText?: string
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

type FailureSide = "host" | "member" | "local"

type FailureFields = {
	appVersion?: string
	platform?: string
	raisedAt?: string
	command?: string
	httpStatus?: number
	side?: FailureSide
	raisedIn?: string
}

type FailureSpecs = {
	appVersion?: string
	commit?: string
	installKind?: string
	os?: string
	osBuild?: string
	arch?: string
	ram?: string
	agentVersion?: string
	provider?: string
	side?: FailureSide
	plan?: string
}

type FailureContext = {
	raisedAt?: string
	raisedIn?: string
	space?: string
	botId?: string
	botName?: string
	conversation?: string
	session?: string
	turn?: string
	command?: string
	httpStatus?: number
}

type FailureLog = {
	lines: string[]
	path: string
	lineCount: number
}

type FailureReport = FailureFields & {
	specs?: FailureSpecs
	context?: FailureContext
	log?: FailureLog
}

type ReportedFailure = Pick<NoticeMessage, "description"> & {
	report: FailureReport
}

const FAILURE_REPORT_HEADING = "Kiroshi failure report"

const FAILURE_REPORT_WARNING =
	"Review before sharing: may contain file names and local paths."

const FAILURE_REPORT_LABELS = {
	appVersion: "App version",
	platform: "Platform",
	raisedAt: "Time",
	command: "Command",
	httpStatus: "HTTP status",
	side: "Side",
	raisedIn: "Raised in",
} satisfies Record<keyof FailureFields, string>

const FAILURE_SPECS_LABELS = {
	appVersion: "App version",
	commit: "Commit",
	installKind: "Install",
	os: "OS",
	osBuild: "OS build",
	arch: "Arch",
	ram: "RAM",
	agentVersion: "Agent version",
	provider: "Provider",
	side: "Side",
	plan: "Plan",
} satisfies Record<keyof FailureSpecs, string>

const FAILURE_CONTEXT_LABELS = {
	raisedAt: "Time",
	raisedIn: "Raised in",
	space: "Space",
	botId: "Bot id",
	botName: "Bot name",
	conversation: "Conversation",
	session: "Session",
	turn: "Turn",
	command: "Command",
	httpStatus: "HTTP status",
} satisfies Record<keyof FailureContext, string>

const onOneLine = (text = "") => text.replace(/\s+/g, " ").trim()

const labelledLines = <Field extends string>(
	fields: Partial<Record<Field, string | number>>,
	labels: Record<Field, string>,
) =>
	(Object.entries(labels) as [Field, string][])
		.map(([field, label]) => {
			const value = onOneLine(fields[field]?.toString())
			return value && `${label}: ${value}`
		})
		.filter(Boolean)

const section = (header: string, lines: string[]) =>
	lines.length > 0 ? [header, ...lines].join("\n") : ""

const formatFailureSpecs = (specs: FailureSpecs) =>
	section("-- Specs", labelledLines(specs, FAILURE_SPECS_LABELS))

const formatFailureContext = (context: FailureContext) =>
	section("-- Context", labelledLines(context, FAILURE_CONTEXT_LABELS))

const formatFailureLog = ({ lines, path, lineCount }: FailureLog) =>
	section(`-- Log (last ${lineCount} lines of ${onOneLine(path)})`, lines)

const formatFailureReport = ({
	description,
	report: { specs, context, log, ...fields },
}: ReportedFailure) => {
	const sections = [
		specs && formatFailureSpecs(specs),
		context && formatFailureContext(context),
		log && formatFailureLog(log),
	].filter(Boolean)

	return [
		FAILURE_REPORT_HEADING,
		sections.length > 0 && FAILURE_REPORT_WARNING,
		onOneLine(description),
		...labelledLines(fields, FAILURE_REPORT_LABELS),
		...sections,
	]
		.filter(Boolean)
		.join("\n")
}

type FailureNotice = NoticeMessage & {
	report?: FailureReport
	onClose?: () => void
}

type RaisedNotice = FailureNotice & {
	type: NoticeType
	priority: "high" | "low"
	timeout?: number
}

let raisedNoticeCount = 0

const raiseNotice = ({
	action,
	report,
	spaceColour,
	...notice
}: RaisedNotice) => {
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
		data: {
			reportText:
				report &&
				formatFailureReport({
					description: notice.description,
					report,
				}),
			spaceColour,
		},
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

type CopyLabelProps = {
	isShown: boolean
	children: string
}

const CopyLabel = ({ isShown, children }: CopyLabelProps) => (
	<span
		aria-hidden={!isShown}
		className={cn("col-start-1 row-start-1", !isShown && "invisible")}
	>
		{children}
	</span>
)

type NoticeCopyProps = {
	text: string
}

const NoticeCopy = ({ text }: NoticeCopyProps) => {
	const { t } = useTranslation("common")
	const { copied, copy } = useCopyText(text)

	return (
		<Button
			className="shrink-0"
			onClick={() => {
				copy().catch(() =>
					raiseFailureNotice({ title: t("notice.copyFailed") }),
				)
			}}
			size="sm"
			variant="outline"
		>
			<span className="grid">
				<CopyLabel isShown={!copied}>{t("notice.copy")}</CopyLabel>
				<CopyLabel isShown={copied}>{t("notice.copied")}</CopyLabel>
			</span>
		</Button>
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
				{notice.data?.reportText ? (
					<NoticeCopy text={notice.data.reportText} />
				) : null}
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
	type FailureContext,
	type FailureLog,
	type FailureReport,
	type FailureSpecs,
	formatFailureReport,
	formatFailureSpecs,
	type NoticeMessage,
	NoticeSurface,
	type NoticeSurfaceProps,
	raiseFailureNotice,
	raiseTransientNotice,
	TRANSIENT_NOTICE_DELAY,
	type TransientNoticeType,
}
