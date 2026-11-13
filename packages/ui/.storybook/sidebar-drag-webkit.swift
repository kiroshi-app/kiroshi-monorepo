import AppKit
import WebKit

let storyID = "layout-workspaceshell--long-content"
let storybook = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "http://localhost:6006"
let story = URL(string: "\(storybook)/iframe.html?id=\(storyID)&viewMode=story")!
let viewport = NSRect(x: 0, y: 0, width: 1440, height: 900)
let pollLimit = 180

let isReady = """
	document.querySelector('[data-slot="sidebar-resize-handle"]') !== null &&
	document.querySelectorAll('[data-slot="message-bubble-content"]').length > 0 &&
	document.fonts.status === "loaded"
	"""

let drag = """
	const DRAG_MS = 2000
	const SWEEP_MS = 1000
	const SWEEP_AMPLITUDE = 64
	const LONG_FRAME_MS = 50
	const handle = document.querySelector('[data-slot="sidebar-resize-handle"]')
	const sidebar = document.querySelector('[data-slot="navigation-sidebar"]')
	const grip = handle.getBoundingClientRect()
	const origin = { clientX: grip.left + grip.width / 2, clientY: grip.top + grip.height / 2 }
	const pointer = (type, clientX) =>
		new PointerEvent(type, { bubbles: true, button: 0, clientX, clientY: origin.clientY })
	const frames = []
	let edgeMoves = -1
	const panelSize = new ResizeObserver(() => {
		edgeMoves += 1
	})
	panelSize.observe(sidebar)
	await new Promise((resolve) => requestAnimationFrame(resolve))
	handle.dispatchEvent(pointer("pointerdown", origin.clientX))
	const startedAt = performance.now()
	let previous = startedAt
	let clientX = origin.clientX
	while (previous - startedAt < DRAG_MS) {
		const sweep = Math.sin((2 * Math.PI * (previous - startedAt)) / SWEEP_MS)
		clientX = origin.clientX + SWEEP_AMPLITUDE * sweep
		window.dispatchEvent(pointer("pointermove", clientX))
		const now = await new Promise((resolve) => requestAnimationFrame(resolve))
		frames.push(now - previous)
		previous = now
	}
	window.dispatchEvent(pointer("pointerup", clientX))
	const releasedAt = performance.now()
	await new Promise((resolve) => requestAnimationFrame(resolve))
	await new Promise((resolve) => requestAnimationFrame(resolve))
	panelSize.disconnect()
	const sorted = [...frames].sort((a, b) => a - b)
	const at = (share) => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] * 10) / 10
	return JSON.stringify({
		scenario: `${DRAG_MS} ms drag of the left handle, \(storyID), ${document.querySelectorAll('[data-slot="message-bubble-content"]').length} turns, ${innerWidth}x${innerHeight}`,
		detector: `requestAnimationFrame deltas in WKWebView, a long frame is over ${LONG_FRAME_MS} ms, ${navigator.userAgent}`,
		frames: { count: sorted.length, medianMs: at(0.5), p95Ms: at(0.95), maxMs: at(1) },
		longFrames: frames.filter((frame) => frame > LONG_FRAME_MS).length,
		edgeMoves,
		releaseMs: Math.round((performance.now() - releasedAt) * 10) / 10,
	}, null, "\\t")
	"""

final class Probe {
	let view = WKWebView(frame: viewport)
	let window = NSWindow(contentRect: viewport, styleMask: .borderless, backing: .buffered, defer: false)
	var polls = 0

	func start() {
		window.contentView = view
		window.alphaValue = 0
		window.ignoresMouseEvents = true
		window.orderFrontRegardless()
		view.load(URLRequest(url: story))
		poll()
	}

	func fail(_ reason: String) -> Never {
		FileHandle.standardError.write(Data("\(reason)\n".utf8))
		exit(1)
	}

	func poll() {
		polls += 1
		if polls > pollLimit { fail("The story never rendered at \(story)") }
		DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
			self.view.evaluateJavaScript(isReady) { ready, _ in
				if ready as? Bool == true {
					DispatchQueue.main.asyncAfter(deadline: .now() + 2) { self.measure() }
				} else {
					self.poll()
				}
			}
		}
	}

	func measure() {
		view.callAsyncJavaScript(drag, arguments: [:], in: nil, in: .page) { result in
			switch result {
			case .success(let report):
				print(report)
				exit(0)
			case .failure(let error):
				self.fail("The drag could not run: \(error)")
			}
		}
	}
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let probe = Probe()
probe.start()
app.run()
