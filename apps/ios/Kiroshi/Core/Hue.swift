struct Hue: Decodable, Hashable, Sendable {
    static let red = Hue(42)
    static let orange = Hue(63)
    static let yellow = Hue(82)
    static let green = Hue(132)
    static let cyan = Hue(186)
    static let blue = Hue(257)
    static let purple = Hue(296)
    static let pink = Hue(358)

    static let presets: [String: Hue] = [
        "red": .red, "orange": .orange, "yellow": .yellow, "green": .green,
        "cyan": .cyan, "blue": .blue, "purple": .purple, "pink": .pink,
    ]

    static let degreesInATurn = 360

    let degrees: Int

    private init(_ degrees: Int) {
        self.degrees = degrees
    }

    init?(degrees: Int) {
        guard (0..<Self.degreesInATurn).contains(degrees) else { return nil }
        self.init(degrees)
    }

    init?(named name: String) {
        guard let preset = Self.presets[name] else { return nil }
        self = preset
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        let hue =
            if let degrees = try? container.decode(Int.self) {
                Hue(degrees: degrees)
            } else {
                Hue(named: try container.decode(String.self))
            }
        guard let hue else {
            throw DecodingError.dataCorruptedError(
                in: container, debugDescription: "A hue runs from 0 to 359 or names a preset.")
        }
        self = hue
    }
}

extension KeyedDecodingContainer {
    func hue(forKey key: Key) -> Hue? {
        (try? decodeIfPresent(Hue.self, forKey: key)) ?? nil
    }
}
