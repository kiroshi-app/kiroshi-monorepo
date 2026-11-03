import { createContext, type ReactNode, useContext } from "react"

type MarkdownRunRenderProps = {
	id: string
	isEnd: boolean
	children: ReactNode
}

type MarkdownRunRenderer = (props: MarkdownRunRenderProps) => ReactNode

const MarkdownRunContext = createContext<MarkdownRunRenderer | null>(null)

const MarkdownRunSpan = ({ id, isEnd, children }: MarkdownRunRenderProps) => {
	const renderRun = useContext(MarkdownRunContext)

	return renderRun ? (
		renderRun({ id, isEnd, children })
	) : (
		<span>{children}</span>
	)
}

export {
	MarkdownRunContext,
	type MarkdownRunRenderer,
	type MarkdownRunRenderProps,
	MarkdownRunSpan,
}
