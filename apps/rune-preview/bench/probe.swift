import AppKit
import CoreGraphics
import Darwin
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

func recognises(_ needle: String, in path: String, rightOf minX: Double) -> Bool {
	guard let image = NSImage(contentsOfFile: path)?.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
		return false
	}
	let request = VNRecognizeTextRequest()
	request.recognitionLevel = .fast
	try? VNImageRequestHandler(cgImage: image).perform([request])
	let lines = (request.results ?? []).filter { $0.boundingBox.minX >= minX }.compactMap {
		$0.topCandidates(1).first?.string
	}
	return lines.contains { $0.localizedCaseInsensitiveContains(needle) }
}

typealias ResponsibleFor = @convention(c) (pid_t) -> pid_t

func webKitHelpers(of pid: Int32) -> [Int32]? {
	guard let symbol = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "responsibility_get_pid_responsible_for_pid") else {
		return nil
	}
	let responsible = unsafeBitCast(symbol, to: ResponsibleFor.self)
	var pids = [pid_t](repeating: 0, count: 8192)
	let count = proc_listallpids(&pids, Int32(pids.count * MemoryLayout<pid_t>.size))
	var path = [CChar](repeating: 0, count: Int(MAXPATHLEN))
	return pids.prefix(Int(max(count, 0))).filter { candidate in
		guard candidate > 0, candidate != pid, responsible(candidate) == pid,
			proc_pidpath(candidate, &path, UInt32(path.count)) > 0
		else { return false }
		return String(cString: path).contains("/com.apple.WebKit.")
	}
}

let arguments = CommandLine.arguments
switch arguments.count > 1 ? arguments[1] : "" {
case "window":
	if let found = window(of: Int32(arguments[2]) ?? -1) { print(found) } else { exit(1) }
case "helpers":
	guard let found = webKitHelpers(of: Int32(arguments[2]) ?? -1) else { exit(1) }
	print(found.map(String.init).joined(separator: " "))
case "locked":
	let session = CGSessionCopyCurrentDictionary() as? [String: Any] ?? [:]
	exit((session["CGSSessionScreenIsLocked"] as? Bool) == true ? 0 : 1)
case "trusted":
	exit(AXIsProcessTrusted() ? 0 : 1)
case "ocr":
	let minX = arguments.count > 4 ? Double(arguments[4]) ?? 0 : 0
	exit(recognises(arguments[3], in: arguments[2], rightOf: minX) ? 0 : 1)
default:
	FileHandle.standardError.write("usage: probe window <pid> | helpers <pid> | locked | trusted | ocr <png> <text> [min x]\n".data(using: .utf8)!)
	exit(64)
}
