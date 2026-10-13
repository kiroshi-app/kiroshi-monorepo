import type { EmitFor, FakeRun } from "./fake-driver-runs"

export const createFakeAsks = (emitFor: EmitFor) => {
	let permissionSeq = 0

	const beginAsk = (run: FakeRun, title: string) => {
		permissionSeq += 1
		const id = `fake-perm-${permissionSeq}`
		run.pendingPermissionId = id
		run.waiting = true
		emitFor(run, {
			type: "activity",
			activity: { id, title, kind: "permission", status: "pending" },
		})
		return id
	}

	const requestPermission = (run: FakeRun) => {
		const title = "Run a command"
		emitFor(run, {
			type: "permissionRequested",
			request: {
				id: beginAsk(run, title),
				toolName: "Bash",
				title,
				detail: "echo hello",
			},
		})
	}

	const requestQuestion = (run: FakeRun) => {
		emitFor(run, {
			type: "questionRequested",
			request: {
				id: beginAsk(run, "Ask the reader"),
				questions: [
					{
						header: "Framework",
						question: "Which framework should it use?",
						multiSelect: false,
						options: [
							{
								label: "React",
								description: "The one the app already runs on",
								preview: null,
							},
							{ label: "Solid", description: null, preview: "createSignal()" },
						],
					},
				],
			},
		})
	}

	return { requestPermission, requestQuestion }
}
