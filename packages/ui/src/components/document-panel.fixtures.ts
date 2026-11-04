import { LIBRARY_AGENTS } from "@workspace/ui/components/library.fixtures"
import type { LibraryDocumentWriter } from "@workspace/ui/components/library-document-agents"

const LIVE_SENTENCE =
	"Release notes go out with the build on the morning of the 14th"

export const DOCUMENT_TITLE = "Spring launch brief"

export const DOCUMENT_BODY = [
	"The spring launch puts the Library in front of every team on the 14th. This brief collects what we're shipping, who it's for and the three messages every page repeats.",
	"## Before the 14th",
	"- [x] Copy is final\n- [x] Screenshots land\n- [ ] Release notes are signed off",
	LIVE_SENTENCE,
].join("\n\n")

export const DOCUMENT_WRITERS: LibraryDocumentWriter[] = [
	{
		agent: LIBRARY_AGENTS.atlas,
		start: DOCUMENT_BODY.indexOf(LIVE_SENTENCE),
		end: DOCUMENT_BODY.indexOf(LIVE_SENTENCE) + LIVE_SENTENCE.length,
		elapsedSeconds: 12,
		sentenceCount: 1,
		section: "Before the 14th",
	},
]
