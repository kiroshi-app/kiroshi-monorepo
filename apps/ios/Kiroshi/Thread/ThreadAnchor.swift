enum ThreadAnchor {
    static func message(
        toKeep reading: ThreadMessage.ID?, whenFirstWas previousFirst: ThreadMessage.ID?,
        in entries: [ThreadMessage]
    ) -> ThreadMessage.ID? {
        guard let reading, let previousFirst,
            entries.dropFirst().contains(where: { $0.id == previousFirst })
        else { return nil }
        return reading
    }
}
