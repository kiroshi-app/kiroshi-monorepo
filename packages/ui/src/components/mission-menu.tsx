"use client"

import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu"
import {
	cloneElement,
	type HTMLAttributes,
	type ReactElement,
	type Ref,
	useRef,
} from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import type { MissionState } from "@workspace/ui/components/mission"
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@workspace/ui/components/ui/context-menu"
import { STILL_UNDER_REDUCED_MOTION } from "@workspace/ui/lib/reduced-motion"

type MissionCopyKind =
	| "issue_id"
	| "branch"
	| "pull_request_url"
	| "workspace_path"

type MissionMenuActions = {
	onOpen: () => void
	onOpenPullRequest: () => void
	onCopy: (kind: MissionCopyKind) => void
	onMessageAgent: () => void
	onStopAgent: () => void
	onAnswer: () => void
	onClose: () => void
	onReopen: () => void
}

type MissionMenuSurface = HTMLAttributes<HTMLElement> & {
	ref?: Ref<HTMLElement>
}

type MissionMenuTrigger = ReactElement<{ surface?: MissionMenuSurface }>

type MissionMenuProps = MissionMenuActions & {
	state: MissionState
	hasPullRequest: boolean
	hasBranch: boolean
	hasWorkspacePath: boolean
	children: MissionMenuTrigger
}

type MissionMenuContentProps = Omit<MissionMenuProps, "children"> & {
	returnsFocus: () => boolean
}

const ICON_CLASS = "size-3.5"

const isClosedState = (state: MissionState) =>
	state === "done" || state === "failed" || state === "closed"

const isAgentRunning = (state: MissionState) =>
	state === "working" || state === "waiting_bot"

const copyKindsFor = ({
	hasBranch,
	hasPullRequest,
	hasWorkspacePath,
}: Pick<
	MissionMenuProps,
	"hasBranch" | "hasPullRequest" | "hasWorkspacePath"
>) => {
	const shown: Record<MissionCopyKind, boolean> = {
		issue_id: true,
		branch: hasBranch,
		pull_request_url: hasPullRequest,
		workspace_path: hasWorkspacePath,
	}
	return (Object.keys(shown) as MissionCopyKind[]).filter((kind) => shown[kind])
}

const MissionMenuContent = ({
	state,
	hasPullRequest,
	hasBranch,
	hasWorkspacePath,
	returnsFocus,
	onOpen,
	onOpenPullRequest,
	onCopy,
	onMessageAgent,
	onStopAgent,
	onAnswer,
	onClose,
	onReopen,
}: MissionMenuContentProps) => {
	const { t } = useTranslation("chat")

	return (
		<ContextMenuContent
			aria-label={t("missions.menu.label")}
			className={STILL_UNDER_REDUCED_MOTION}
			finalFocus={returnsFocus}
		>
			<ContextMenuItem onClick={onOpen}>
				<Icons.ArrowRight aria-hidden="true" className={ICON_CLASS} />
				{t("missions.menu.open")}
			</ContextMenuItem>
			{hasPullRequest ? (
				<ContextMenuItem onClick={onOpenPullRequest}>
					<Icons.ExternalLink aria-hidden="true" className={ICON_CLASS} />
					{t("missions.menu.openPullRequest")}
				</ContextMenuItem>
			) : null}
			<ContextMenuSub>
				<ContextMenuSubTrigger className="gap-2">
					<Icons.Copy aria-hidden="true" className={ICON_CLASS} />
					{t("missions.menu.copy")}
				</ContextMenuSubTrigger>
				<ContextMenuSubContent className={STILL_UNDER_REDUCED_MOTION}>
					{copyKindsFor({ hasBranch, hasPullRequest, hasWorkspacePath }).map(
						(kind) => (
							<ContextMenuItem key={kind} onClick={() => onCopy(kind)}>
								{t(`missions.menu.copyKind.${kind}`)}
							</ContextMenuItem>
						),
					)}
				</ContextMenuSubContent>
			</ContextMenuSub>
			{isAgentRunning(state) ? (
				<>
					<ContextMenuSeparator />
					<ContextMenuItem onClick={onMessageAgent}>
						<Icons.Message aria-hidden="true" className={ICON_CLASS} />
						{t("missions.menu.messageAgent")}
					</ContextMenuItem>
					<ContextMenuItem onClick={onStopAgent}>
						<Icons.Stop aria-hidden="true" className={ICON_CLASS} />
						{t("missions.menu.stopAgent")}
					</ContextMenuItem>
				</>
			) : null}
			{state === "waiting_human" ? (
				<>
					<ContextMenuSeparator />
					<ContextMenuItem onClick={onAnswer}>
						<Icons.Reply aria-hidden="true" className={ICON_CLASS} />
						{t("missions.menu.answer")}
					</ContextMenuItem>
				</>
			) : null}
			<ContextMenuSeparator />
			{isClosedState(state) ? (
				<ContextMenuItem onClick={onReopen}>
					<Icons.Restart aria-hidden="true" className={ICON_CLASS} />
					{t("missions.menu.reopen")}
				</ContextMenuItem>
			) : (
				<ContextMenuItem onClick={() => onClose()}>
					<Icons.Close aria-hidden="true" className={ICON_CLASS} />
					{t("missions.menu.close")}
				</ContextMenuItem>
			)}
		</ContextMenuContent>
	)
}

const MissionMenu = ({ children, ...props }: MissionMenuProps) => {
	const isLeavingCard = useRef(false)

	const leavingCard = (action: () => void) => () => {
		isLeavingCard.current = true
		action()
	}

	const staysOnCardWhenOpened = (isOpen: boolean) => {
		if (isOpen) isLeavingCard.current = false
	}

	return (
		<ContextMenu onOpenChange={staysOnCardWhenOpened}>
			<ContextMenuPrimitive.Trigger
				render={(surface) => cloneElement(children, { surface })}
			/>
			<MissionMenuContent
				{...props}
				onAnswer={leavingCard(props.onAnswer)}
				onMessageAgent={leavingCard(props.onMessageAgent)}
				returnsFocus={() => !isLeavingCard.current}
			/>
		</ContextMenu>
	)
}

export {
	type MissionCopyKind,
	MissionMenu,
	type MissionMenuActions,
	type MissionMenuProps,
	type MissionMenuTrigger,
}
