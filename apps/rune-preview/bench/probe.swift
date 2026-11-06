import AppKit
import CoreGraphics
import Vision

func window(of pid: Int32) -> Int? {
	let listed = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []
	let owned = listed.filter {
		($0[kCGWindowOwnerPID as String] as? Int32) == pid && ($0[kCGWindowLayer as String] as? Int) == 0
	}
	let area = { (info: [String: Any]) -> Double in
		let bounds = info[kCGWindowBounds as String] as? [String: Double] ?? [:]
		return (bounds["Width"] ?? 0) * (bounds["Height"] ?? 0)
	}
	return owned.filter { area($0) > 10_000 }.max { area($0) < area($1) }?[kCGWindowNumber as String] as? Int
}

func recognises(_ needle: String, in path: String) -> Bool {
	guard let image = NSImage(contentsOfFile: path)?.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
		return false
	}
	let request = VNRecognizeTextRequest()
	request.recognitionLevel = .fast
	try? VNImageRequestHandler(cgImage: image).perform([request])
	let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
	return lines.contains { $0.localizedCaseInsensitiveContains(needle) }
}

let arguments = CommandLine.arguments
switch arguments.count > 1 ? arguments[1] : "" {
case "window":
	if let found = window(of: Int32(arguments[2]) ?? -1) { print(found) } else { exit(1) }
case "ocr":
	exit(recognises(arguments[3], in: arguments[2]) ? 0 : 1)
default:
	FileHandle.standardError.write("usage: probe window <pid> | ocr <png> <text>\n".data(using: .utf8)!)
	exit(64)
}
