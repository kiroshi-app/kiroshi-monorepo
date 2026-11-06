import type { ReactNode } from "react"

type AnswerStackProps = { children: ReactNode }

const AnswerStack = ({ children }: AnswerStackProps) => (
	<div className="flex min-w-0 flex-col gap-3" data-slot="answer-stack">
		{children}
	</div>
)

export { AnswerStack, type AnswerStackProps }
