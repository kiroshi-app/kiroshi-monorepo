const PORT = Number(process.env.OPE1176_CLOUD_PORT ?? 47176)
const INSTANCE = "0e1176aa-0000-4000-8000-00000000a176"
const BEARER = "ope1176-fake-bearer"
const NOW = "2026-10-01T00:00:00.000Z"

const log = (line: string) =>
	console.log(`[ope1176] fake-cloud ${new Date().toISOString()} ${line}`)

const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	})

const isSignedIn = (request: Request) =>
	request.headers.get("authorization") === `Bearer ${BEARER}`

const nonce = Buffer.alloc(32, 7).toString("base64url")

const answered = (request: Request, path: string): Response | undefined => {
	const method = request.method
	if (path === "/me" && method === "GET") {
		return isSignedIn(request)
			? json(200, {
					id: "member",
					email: "member@example.com",
					createdAt: NOW,
					plan: "pro",
				})
			: new Response(null, { status: 401 })
	}
	if (path === "/devices/challenge" && method === "POST") {
		return json(201, { nonce, expiresAt: "2099-10-01T00:00:00.000Z" })
	}
	if (path === "/devices" && method === "POST") {
		return json(201, {
			id: "0e1176bb-0000-4000-8000-00000000d176",
			createdAt: NOW,
			transferred: false,
			status: "approved",
		})
	}
	if (path === "/instances" && method === "GET") {
		return json(200, [{ id: INSTANCE, name: "Silent host" }])
	}
	if (path === `/instances/${INSTANCE}/roster` && method === "GET") {
		return json(200, [
			{ userId: "owner", name: "Ann", role: "owner" },
			{ userId: "member", name: "Bob", role: "member" },
		])
	}
	if (path === "/devices" && method === "GET") {
		return json(200, [])
	}
	if (path === "/invitations" && method === "GET") {
		return json(200, [])
	}
	return undefined
}

Bun.serve({
	port: PORT,
	hostname: "127.0.0.1",
	fetch(request, server) {
		const url = new URL(request.url)
		const path = url.pathname
		if (path === `/instances/${INSTANCE}/relay/member`) {
			log(
				`${request.method} ${path} member socket asked, the host will never answer`,
			)
			if (!isSignedIn(request)) return new Response(null, { status: 401 })
			if (server.upgrade(request)) return undefined
			return new Response(null, { status: 400 })
		}
		const response = answered(request, path)
		log(`${request.method} ${path} -> ${response?.status ?? 404}`)
		return (
			response ??
			json(404, { error: { code: "not_found", message: path, status: 404 } })
		)
	},
	websocket: {
		open() {
			log("member socket opened (silent host)")
		},
		message(_socket, frame) {
			log(
				`member socket frame of ${String(frame).length} chars left unanswered`,
			)
		},
		close(_socket, code) {
			log(`member socket closed by the app, code ${code}`)
		},
	},
})

log(`listening on http://127.0.0.1:${PORT}, instance ${INSTANCE}`)
