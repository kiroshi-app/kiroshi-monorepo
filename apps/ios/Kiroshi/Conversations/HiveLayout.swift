import SwiftUI

struct HiveLayout: Decodable, Sendable {
    struct Member: Hashable, Sendable {
        let id: String
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
        let outline: Path
        let hiddenCount: Int
        let fontSize: Double
        let baseline: Double

        init(from decoder: any Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            centre = try container.decode(Point.self, forKey: .centre)
            side = try container.decode(Double.self, forKey: .side)
            hiddenCount = try container.decode(Int.self, forKey: .hiddenCount)
            fontSize = try container.decode(Double.self, forKey: .fontSize)
            baseline = try container.decode(Double.self, forKey: .baseline)
            let svg = try container.decode(String.self, forKey: .path)
            guard let outline = Path(svgOutline: svg) else {
                throw DecodingError.dataCorruptedError(
                    forKey: .path, in: container, debugDescription: "Unreadable outline \(svg)")
            }
            self.outline = outline
        }

        private enum CodingKeys: String, CodingKey {
            case centre
            case side
            case path
            case hiddenCount
            case fontSize
            case baseline
        }
    }

    let cells: [Cell]
    let overflow: Overflow?

    static func decode(_ json: String) throws -> HiveLayout {
        do {
            return try JSONDecoder().decode(HiveLayout.self, from: Data(json.utf8))
        } catch {
            throw CompanionAvatarError.unreadableDrawing
        }
    }
}
