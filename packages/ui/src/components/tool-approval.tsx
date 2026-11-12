"use client"

import { type ReactNode, useCallback, useId, useState } from "react"
import { useTranslation } from "react-i18next"

import {
	CodeSnippet,
	type CodeSnippetLanguage,
} from "@workspace/ui/components/code-snippet"
import { Disclosure } from "@workspace/ui/components/disclosure"
import { Icons } from "@workspace/ui/components/icons"
import {
	TOOL_CARD_CLASS,
	TOOL_CARD_SECTION_CLASS,
} from "@workspace/ui/components/tool-card-styles"
import { Button } from "@workspace/ui/components/ui/button"
import { useAutoFocus } from "@workspace/ui/hooks/use-auto-focus"
import { cn } from "@workspace/ui/lib/utils"

type ToolApprovalStatus = "pending" | "allowed" | "denied"

export type ToolApprovalParameter = {
	id: string
	label: ReactNode
} & (
	| { value: ReactNode; sensitive?: false }
	| { sensitive: true; value?: never }
)

export interface ToolApprovalCodeProps {
	code: string
	language?: CodeSnippetLanguage
	className?: string
}

export interface ToolApprovalProps {
	tool: ReactNode
	title?: ReactNode
	description?: ReactNode
	parameters?: ToolApprovalParameter[]
	status?: ToolApprovalStatus
	open?: boolean
	defaultOpen?: boolean
	onOpenChange?: (open: boolean) => void
	onAllowOnce?: () => void
	onDeny?: () => void
	children?: ReactNode
	className?: string
}

const STATUS_BADGE: Record<ToolApprovalStatus, string> = {
	pending: "border-border bg-muted text-foreground",
	allowed: "border-border bg-muted text-foreground",
	denied: "border-destructive/40 bg-card text-destructive",
}

function StatusIcon({ status }: { status: ToolApprovalStatus }) {
	if (status === "allowed") return <Icons.Success className="size-3" />
	if (status === "denied") return <Icons.Close className="size-3" />
	return <Icons.Shield className="size-3" />
}

export function ToolApprovalCode({
	code,
	language = "bash",
	className,
}: ToolApprovalCodeProps) {
	return (
		<CodeSnippet
			code={code}
			language={language}
			className={cn(
				"rounded-xl border border-border bg-muted/40 px-2.5 py-2",
				className,
			)}
		/>
	)
}

export function ToolApproval({
	tool,
	title,
	description,
	parameters = [],
	status = "pending",
	open,
	defaultOpen = false,
	onOpenChange,
	onAllowOnce,
	onDeny,
	children,
	className,
}: ToolApprovalProps) {
	const { t } = useTranslation("chat")
	const cardRef = useAutoFocus<HTMLDivElement>(status === "pending")
	const baseId = useId()
	const titleId = `${baseId}-title`
	const detailsId = `${baseId}-details`
	const [internalOpen, setInternalOpen] = useState(defaultOpen)
	const currentOpen = open ?? internalOpen

	const toggleDetails = useCallback(() => {
		const next = !(open ?? internalOpen)
		if (open === undefined) setInternalOpen(next)
		onOpenChange?.(next)
	}, [internalOpen, onOpenChange, open])

	return (
		<div
			ref={cardRef}
			tabIndex={-1}
			role="group"
			aria-labelledby={titleId}
			data-status={status}
			className={cn(TOOL_CARD_CLASS, className)}
		>
			<div className={cn(TOOL_CARD_SECTION_CLASS, "grid gap-2")}>
				<div className="flex min-w-0 items-start justify-between gap-3">
					<div className="min-w-0">
						<div id={titleId} className="font-medium text-foreground">
							{title ?? t("toolApproval.title")}
						</div>
						<div className="truncate font-mono text-muted-foreground text-xs">
							{tool}
						</div>
					</div>
					<span
						role="status"
						className={cn(
							"inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium text-xs",
							STATUS_BADGE[status],
						)}
					>
						<StatusIcon status={status} />
						{t(`toolApproval.status.${status}`)}
					</span>
				</div>

				{description ? (
					<p className="leading-5 text-muted-foreground">{description}</p>
				) : null}

				{children}

				{parameters.length ? (
					<Button
						variant="ghost"
						size="xs"
						aria-expanded={currentOpen}
						aria-controls={detailsId}
						onClick={toggleDetails}
						className="w-fit text-muted-foreground"
					>
						{t("toolApproval.input")}
						<Icons.Expand
							data-icon="inline-end"
							className={cn(
								"size-3 transition-transform duration-150 ease-out motion-reduce:transition-none",
								currentOpen && "rotate-180",
							)}
						/>
					</Button>
				) : null}
			</div>

			<Disclosure id={detailsId} open={currentOpen}>
				<dl
					className={cn(
						TOOL_CARD_SECTION_CLASS,
						"grid gap-2 border-border border-t",
					)}
				>
					{parameters.map((parameter) => (
						<div
							key={parameter.id}
							className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] items-baseline gap-3 text-xs"
						>
							<dt className="text-muted-foreground">{parameter.label}</dt>
							<dd
								className={cn(
									"min-w-0 break-words font-mono text-foreground",
									parameter.sensitive && "text-muted-foreground italic",
								)}
							>
								{parameter.sensitive
									? t("toolApproval.sensitive")
									: parameter.value}
							</dd>
						</div>
					))}
				</dl>
			</Disclosure>

			{status === "pending" ? (
				<div
					className={cn(
						TOOL_CARD_SECTION_CLASS,
						"flex flex-wrap items-center gap-2 border-border border-t",
					)}
				>
					<Button size="sm" onClick={onAllowOnce}>
						<Icons.Success data-icon="inline-start" />
						{t("toolApproval.allowOnce")}
					</Button>
					<Button variant="outline" size="sm" onClick={onDeny}>
						<Icons.Close data-icon="inline-start" />
						{t("toolApproval.deny")}
					</Button>
				</div>
			) : null}
		</div>
	)
}
