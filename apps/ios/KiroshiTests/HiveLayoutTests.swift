import Foundation
import Testing

@testable import Kiroshi

@MainActor
struct HiveLayoutTests {
    static let fixture = URL(filePath: #filePath)
        .deletingLastPathComponent()
        .appending(path: "../../../packages/ui/src/components/hive-layout.fixture.jsonl")
        .standardizedFileURL

    func engine() throws -> CompanionAvatarEngine {
        try CompanionAvatarEngine(bundle: Bundle(for: CompanionAvatarEngine.self))
    }

    @Test func laysOutEveryFixtureCaseTheWayTheDesktopDoes() throws {
        let engine = try engine()
        let lines = try String(contentsOf: Self.fixture, encoding: .utf8)
            .split(separator: "\n")
        var passed = 0
        for line in lines {
            let entry = try #require(
                JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any])
            let input = try #require(entry["input"] as? [String: Any])
            let json = try engine.hiveJSON(input)
            let laidOut = try JSONSerialization.jsonObject(
                with: Data(json.utf8), options: .fragmentsAllowed)
            _ = try HiveLayout.decode(json)
            if CompanionAvatarTests.matches(laidOut, try #require(entry["output"]), drift: 0) {
                passed += 1
            } else {
                Issue.record("Differs from the fixture: \(input)")
            }
        }
        print("hive-layout fixture: \(passed)/\(lines.count) cases passed")
        #expect(lines.count == 16)
        #expect(passed == lines.count)
    }

    @Test func putsTheWorkingCompanionFirstAndCountsTheOthers() throws {
        let members = ["a", "b", "c", "d", "e"].map {
            HiveLayout.Member(id: $0, isWorking: $0 == "d")
        }

        let layout = try engine().hiveLayout(of: members, side: 52)

        #expect(layout.cells.map(\.id) == ["d", "a"])
        #expect(layout.overflow?.hiddenCount == 3)
        #expect(layout.cells.allSatisfy { $0.shape == .hexagon })
    }
}
