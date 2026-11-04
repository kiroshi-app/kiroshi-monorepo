"use client"

import {
	createContext,
	type MouseEvent,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { MessageScrollerButton } from "@workspace/ui/components/message-scroller"

type TranscriptJump = {
	behavior: ScrollBehavior
	newCount: number
	onClick?: (event: MouseEvent<HTMLButtonElement>) => void
	dock: () => () => void
}

type JumpToLatestPlacement = "floating" | "docked"

type JumpToLatestProps = {
	jump: TranscriptJump
	placement: JumpToLatestPlacement
}

type TranscriptJumpProviderProps = {
	jump: TranscriptJump
	children: ReactNode
}

const JUMP_PLACEMENT = {
	floating:
		"h-8 gap-1.5 rounded-full border-foreground/10 bg-prompt-surface px-3 text-compact tabular-nums [&_svg]:size-3.5",
	docked:
		"static translate-x-0 gap-1.5 rounded-full border-foreground/10 bg-transparent text-compact tabular-nums has-data-[icon=inline-start]:pl-2.5 data-[active=false]:hidden [&_svg]:size-3.5",
} as const satisfies Record<JumpToLatestPlacement, string>

const TranscriptJumpContext = createContext<TranscriptJump | null>(null)

const TranscriptJumpProvider = ({
	jump,
	children,
}: TranscriptJumpProviderProps) => (
	<TranscriptJumpContext.Provider value={jump}>
		{children}
	</TranscriptJumpContext.Provider>
)

const useJumpDock = () => {
	const [dockedCount, setDockedCount] = useState(0)
	const dock = useCallback(() => {
		setDockedCount((count) => count + 1)
		return () => setDockedCount((count) => count - 1)
	}, [])

	return { isDocked: dockedCount > 0, dock }
}

const useDockedJump = (isStuck: boolean) => {
	const jump = useContext(TranscriptJumpContext)
	const dock = jump?.dock

	useEffect(() => {
		if (!isStuck || !dock) return
		return dock()
	}, [isStuck, dock])

	return isStuck ? jump : null
}

const JumpToLatest = ({ jump, placement }: JumpToLatestProps) => {
	const { t } = useTranslation("chat")

	return (
		<MessageScrollerButton
			behavior={jump.behavior}
			className={JUMP_PLACEMENT[placement]}
			data-placement={placement}
			onClick={jump.onClick}
			size="sm"
			variant="secondary"
		>
			<Icons.ArrowDown data-icon="inline-start" />
			{jump.newCount > 0
				? t("transcript.newCounted", { count: jump.newCount })
				: t("transcript.jumpToLatest")}
		</MessageScrollerButton>
	)
}

export {
	JumpToLatest,
	type TranscriptJump,
	TranscriptJumpProvider,
	useDockedJump,
	useJumpDock,
}
