import SwiftUI

struct HiveLayout: Decodable, Sendable {
    struct Member: Hashable, Sendable {
        let id: String
        let isPerson: Bool
        let isWorking: Bool
    }

    struct Point: Decodable, Sendable {
        let x: Double
        let y: Double

        var point: CGPoint {
            CGPoint(x: x, y: y)
        }
    }

    enum Shape: String, Decodable, Sendable {
        case hexagon
        case circle
    }

    struct Cell: Decodable, Sendable {
        let id: String
        let centre: Point
        let side: Double
        let shape: Shape
    }

    struct Overflow: Decodable, Sendable {
        let centre: Point
        let side: Double
        let path: String
        let hiddenCount: Int
        let fontSize: Double
        let baseline: Double
    }

    let cells: [Cell]
    let hexagonPath: String
    let overflow: Overflow?

    static func decode(_ json: String) throws -> HiveLayout {
        do {
            return try JSONDecoder().decode(HiveLayout.self, from: Data(json.utf8))
        } catch {
            throw CompanionAvatarError.unreadableDrawing
        }
    }
}
