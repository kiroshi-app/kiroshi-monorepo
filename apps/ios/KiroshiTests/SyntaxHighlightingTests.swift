import SwiftUI
import Testing

@testable import Kiroshi

@MainActor
struct SyntaxHighlightingTests {
    func colors(of word: String, in code: String, as language: String) throws -> [Color?] {
        let highlighted = SyntaxHighlighting.shared.highlighted(
            MarkdownCode(language: language, text: code))
        let range = try #require(highlighted.range(of: word))
        return highlighted[range].runs[\.foregroundColor].map(\.0)
    }

    @Test(arguments: ["struct", "class", "enum", "protocol"])
    func aSwiftDeclaredTypeNameTakesTheTypeColor(keyword: String) throws {
        let code = "\(keyword) Release { let tag: String }"

        let release = try colors(of: "Release", in: code, as: "swift")

        #expect(release == [Color("syntax-type")])
        #expect(release == (try colors(of: "String", in: code, as: "swift")))
        #expect(try colors(of: " { ", in: code, as: "swift") == [nil])
    }

    @Test(arguments: ["work", "sleep", "seconds"])
    func aCallOrAMemberTakesTheFunctionColor(name: String) throws {
        let code = "try? await work()\ntry await Task.sleep(for: .seconds(2))"

        #expect(try colors(of: name, in: code, as: "swift") == [Color("syntax-function")])
    }

    @Test(arguments: ["retry", "attempt", "times"])
    func aDeclaredFunctionNameOrAValueStaysPlain(name: String) throws {
        let code = "func retry() {\n    for attempt in 1..<times { }\n}"

        #expect(try colors(of: name, in: code, as: "swift") == [nil])
    }

    @Test(arguments: ["times", "_", "work", "for", "build", "index"])
    func aSwiftParameterLabelStaysPlain(label: String) throws {
        let code = """
            func retry<T>(times: Int = 3, _ work: () async throws -> T) async throws -> T {}
            func notes(for build: Int) -> String {}
            subscript(index: Int) -> Int { 0 }
            """

        #expect(try colors(of: label, in: code, as: "swift") == [nil])
    }

    @Test(arguments: ["T", "Int", "String"])
    func aTypeInASwiftSignatureKeepsTheTypeColor(name: String) throws {
        let code = "func notes<T>(for build: Int, _ value: T) -> String {}"

        #expect(try colors(of: name, in: code, as: "swift") == [Color("syntax-type")])
    }

    @Test(arguments: ["let _ = value", "for _ in 1..<3 {}", "{ _ in }"])
    func aSwiftWildcardOutsideASignatureKeepsTheKeywordColor(code: String) throws {
        #expect(try colors(of: "_", in: code, as: "swift") == [Color("syntax-keyword")])
    }

    @Test func aKeywordKeepsTheCodeWeight() throws {
        let highlighted = SyntaxHighlighting.shared.highlighted(
            MarkdownCode(language: "swift", text: "return value"))
        let keyword = try #require(highlighted.range(of: "return"))

        #expect(highlighted[keyword].runs[\.font].map(\.0) == [nil])
    }

    @Test func aDeclaredTypeNameInAnotherLanguageStaysPlain() throws {
        #expect(
            try colors(of: "Release", in: "class Release { tag: string }", as: "typescript")
                == [nil])
        #expect(
            try colors(of: "Release", in: "struct Release { tag: String }", as: "rust") == [nil])
    }
}
