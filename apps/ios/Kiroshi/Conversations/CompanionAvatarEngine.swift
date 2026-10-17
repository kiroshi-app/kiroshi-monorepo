import Foundation
import JavaScriptCore
import os

enum CompanionAvatarError: Error, Equatable {
    case missingScript
    case missingEngine
    case script(String)
    case unreadableDrawing
}

enum CompanionPose: String, Sendable {
    case idle
    case working
}

enum CompanionTheme: String, Sendable {
    case light
    case dark
}

@MainActor
final class CompanionAvatarEngine {
    static let shared: CompanionAvatarEngine? = {
        do {
            return try CompanionAvatarEngine(bundle: .main)
        } catch {
            log.error("The companion avatar engine didn't load: \(String(describing: error))")
            return nil
        }
    }()

    static let log = Logger(subsystem: "com.kiroshi.app.ios", category: "companion-avatar")

    private let context: JSContext
    private let draw: JSValue
    private let stringify: JSValue
    private var thrown: String?
    private var idle: [IdleKey: CompanionDrawing] = [:]

    convenience init(bundle: Bundle) throws {
        guard let url = bundle.url(forResource: "companion-avatar", withExtension: "js") else {
            throw CompanionAvatarError.missingScript
        }
        try self.init(script: String(contentsOf: url, encoding: .utf8))
    }

    init(script: String) throws {
        guard let context = JSContext() else { throw CompanionAvatarError.missingEngine }
        self.context = context
        context.evaluateScript(script)
        if let exception = context.exception {
            throw CompanionAvatarError.script(exception.toString() ?? "")
        }
        guard let draw = context.objectForKeyedSubscript("companionAvatar"), !draw.isUndefined,
            let stringify = context.evaluateScript("JSON.stringify"), !stringify.isUndefined
        else {
            throw CompanionAvatarError.missingEngine
        }
        self.draw = draw
        self.stringify = stringify
        context.exceptionHandler = { [weak self] _, exception in
            self?.thrown = exception?.toString() ?? ""
        }
    }

    func drawing(
        name: String, tint: CompanionTint?, pose: CompanionPose, time: Double,
        theme: CompanionTheme
    ) throws -> CompanionDrawing {
        let key = IdleKey(name: name, tint: tint, theme: theme)
        if pose == .idle, let cached = idle[key] { return cached }
        let drawing = try CompanionDrawing.decode(
            json(name: name, tint: tint, pose: pose, time: pose == .idle ? 0 : time, theme: theme))
        if pose == .idle { idle[key] = drawing }
        return drawing
    }

    func json(
        name: String, tint: CompanionTint?, pose: CompanionPose, time: Double,
        theme: CompanionTheme
    ) throws -> String {
        var input: [String: Any] = [
            "name": name, "state": pose.rawValue, "time": time, "theme": theme.rawValue,
        ]
        input["tint"] = tint?.rawValue
        return try json(input)
    }

    func json(_ input: [String: Any]) throws -> String {
        try call(draw, with: input)
    }

    private func call(_ function: JSValue, with input: [String: Any]) throws -> String {
        thrown = nil
        let output = function.call(withArguments: [input])
        let text = stringify.call(withArguments: [output as Any])
        if let thrown {
            throw CompanionAvatarError.script(thrown)
        }
        guard let text, text.isString, let json = text.toString() else {
            throw CompanionAvatarError.unreadableDrawing
        }
        return json
    }

    private struct IdleKey: Hashable {
        let name: String
        let tint: CompanionTint?
        let theme: CompanionTheme
    }
}

extension CompanionDrawing {
    static func decode(_ json: String) throws -> CompanionDrawing {
        do {
            return try JSONDecoder().decode(CompanionDrawing.self, from: Data(json.utf8))
        } catch {
            throw CompanionAvatarError.unreadableDrawing
        }
    }
}
