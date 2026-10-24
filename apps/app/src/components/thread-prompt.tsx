import { useContext, useState } from "react"

import { AnsweredQuestionCard } from "@workspace/ui/components/answered-question-card"
import type { MessageAuthor } from "@workspace/ui/components/message"
import {
	ToolApproval,
	ToolApprovalCode,
} from "@workspace/ui/components/tool-approval"
import {
	ToolQuestion,
	type ToolQuestionItem,
} from "@workspace/ui/components/tool-question"
import { AssistantTurn } from "@workspace/ui/components/turn"
import { useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import type {
	PermissionRequest,
	QuestionRequest,
	QuestionSubject,
} from "@/lib/agent/contract"
import type { Application } from "@/lib/applications/application-port"
import { ConversationApplicationsContext } from "@/lib/applications/use-conversation-installs"
import type { AnsweredCard } from "@/lib/chat/answered-question"
import {
	isPostedRequest,
	type PostedAskedQuestion,
} from "@/lib/chat/posted-question"
import { usePersonOf } from "@/lib/chat/thread-authorship"
import type { PromptResponder } from "@/lib/chat/use-prompt-responder"

type ApprovalPromptProps = {
	request: PermissionRequest
	responder: PromptResponder
}

export const ApprovalPrompt = ({ request, responder }: ApprovalPromptProps) => {
	const t = useChatCopy()
	const isShell = request.toolName === "Bash"

	return (
		<ToolApproval
			description={t("screen.approval.description")}
			onAllowOnce={() => {
				void responder.respond(request.id, "allowOnce")
			}}
			onDeny={() => {
				void responder.respond(request.id, "deny")
			}}
			parameters={
				request.detail && !isShell
					? [
							{
								id: "path",
								label: t("screen.approval.path"),
								value: request.detail,
							},
						]
					: []
			}
			title={request.title}
			tool={request.toolName}
		>
			{request.detail && isShell ? (
				<ToolApprovalCode code={request.detail} />
			) : null}
		</ToolApproval>
	)
}

const toQuestionItem = ({
	question,
	header,
	multiSelect,
	options,
	...pieces
}: PostedAskedQuestion): ToolQuestionItem => ({
	question,
	header,
	multiSelect,
	options: options.map((option) => ({
		label: option.label,
		description: option.description ?? "",
		preview: option.preview ?? undefined,
	})),
	...pieces,
})

type QuestionPromptProps = {
	request: QuestionRequest
	responder: PromptResponder
	companionName?: string
}

const markOf = (
	subject: QuestionSubject | undefined,
	curated: Application[],
): string | undefined =>
	subject?.kind === "applicationScope"
		? curated.find(({ name }) => name === subject.application)?.logo
		: undefined

export const QuestionPrompt = ({
	request,
	responder,
	companionName,
}: QuestionPromptProps) => {
	const applications = useContext(ConversationApplicationsContext)
	const mark = markOf(request.subject, applications?.curated ?? [])
	const [isMinimised, setIsMinimised] = useState(false)

	return (
		<ToolQuestion
			companionName={companionName}
			hasDigitKeys
			minimised={isMinimised}
			onExpand={() => setIsMinimised(false)}
			onMinimise={() => setIsMinimised(true)}
			onAnswer={(answers) => {
				void responder.answer(request.id, answers)
			}}
			onDeny={
				isPostedRequest(request)
					? undefined
					: () => {
							void responder.respond(request.id, "deny")
						}
			}
			questions={request.questions.map((asked) => ({
				...toQuestionItem(asked),
				mark,
			}))}
		/>
	)
}

type AnsweredPromptProps = {
	card: AnsweredCard
	readerName: string
}

export const AnsweredPrompt = ({
	card: { answer, questions },
	readerName,
}: AnsweredPromptProps) => {
	const personOf = usePersonOf()
	const person = personOf(answer)

	return (
		<AnsweredQuestionCard
			answeredAt={answer.createdAt}
			author={
				person === undefined
					? { name: readerName, isViewer: true }
					: { name: person }
			}
			questions={questions}
		/>
	)
}

type SpokenApprovalProps = {
	request: PermissionRequest
	author?: MessageAuthor
	responder: PromptResponder
}

export const SpokenApproval = ({
	request,
	author,
	responder,
}: SpokenApprovalProps) => (
	<AssistantTurn author={author} bare>
		<ApprovalPrompt request={request} responder={responder} />
	</AssistantTurn>
)
