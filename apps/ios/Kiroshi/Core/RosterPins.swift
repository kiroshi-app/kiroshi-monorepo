struct RosterPin: Encodable, Equatable, Sendable {
    let id: String
    let sectionId: String?

    func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(sectionId, forKey: .sectionId)
    }

    private enum CodingKeys: String, CodingKey {
        case id
        case sectionId
    }
}

struct PinPlace: Decodable, Equatable, Sendable {
    let id: String
    let sectionId: String?
    let pinPosition: Int?
}

struct RosterSection: Decodable, Equatable, Sendable {
    let id: String
    let position: Int
}

enum RosterPins {
    static func of(_ rows: [PinPlace], sections: [RosterSection]) -> [RosterPin] {
        let knownSectionIds = Set(sections.map(\.id))
        let sectionOf = { (row: PinPlace) in
            row.sectionId.flatMap { knownSectionIds.contains($0) ? $0 : nil }
        }
        let rowsIn = { (sectionId: String?) -> [Ranked] in
            ranked(
                rows.compactMap { row in
                    guard let rank = row.pinPosition, sectionOf(row) == sectionId else {
                        return nil
                    }
                    return Ranked(id: row.id, sectionId: sectionId, rank: rank, isSection: false)
                })
        }
        let topLevel = ranked(
            sections.map { Ranked(id: $0.id, sectionId: nil, rank: $0.position, isSection: true) }
                + rowsIn(nil))
        return topLevel.flatMap { entry in
            entry.isSection ? [entry] + rowsIn(entry.id) : [entry]
        }
        .map { RosterPin(id: $0.id, sectionId: $0.sectionId) }
    }

    static func pinning(_ id: String, in pins: [RosterPin]) -> [RosterPin] {
        unpinning(id, in: pins) + [RosterPin(id: id, sectionId: nil)]
    }

    static func unpinning(_ id: String, in pins: [RosterPin]) -> [RosterPin] {
        pins.filter { $0.id != id }
    }

    private struct Ranked {
        let id: String
        let sectionId: String?
        let rank: Int
        let isSection: Bool
    }

    private static func ranked(_ entries: [Ranked]) -> [Ranked] {
        entries.enumerated().sorted { left, right in
            left.element.rank == right.element.rank
                ? left.offset < right.offset : left.element.rank < right.element.rank
        }
        .map(\.element)
    }
}
