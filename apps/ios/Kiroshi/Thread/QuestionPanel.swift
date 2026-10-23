import SwiftUI

struct QuestionPanel: View {
    let asking: QuestionAsking
    let send: (QuestionDraft) -> Void
    @State private var draft: QuestionDraft
    @State private var questionHeight: CGFloat?
    @State private var isAboveTheHomeIndicator = true
    @FocusState private var isWritingOther: Bool
    @AccessibilityFocusState private var isQuestionFocused: Bool
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @ScaledMetric(relativeTo: .body) private var sendInset: CGFloat = 10
    @ScaledMetric(relativeTo: .body) private var sendLabelHeight: CGFloat = 30
    @ScaledMetric(relativeTo: .footnote) private var headerLine: CGFloat = 18
    @ScaledMetric(relativeTo: .headline) private var questionLine: CGFloat = 22
    @ScaledMetric(relativeTo: .subheadline) private var hintLine: CGFloat = 20
    @ScaledMetric(relativeTo: .subheadline) private var segmentsCorner: CGFloat = 18

    init(
        asking: QuestionAsking, draft: QuestionDraft? = nil,
        send: @escaping (QuestionDraft) -> Void
    ) {
        self.asking = asking
        self.send = send
        _draft = State(initialValue: draft ?? QuestionDraft(request: asking.question.request))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ScrollView {
                question
            }
            .scrollBounceBehavior(.basedOnSize)
            .frame(maxHeight: questionHeight)
            .onScrollGeometryChange(for: CGFloat.self) { geometry in
                geometry.contentSize.height
            } action: { _, height in
                questionHeight = height
            }
            actions
                .padding(.leading, 6)
                .padding(.top, 2)
        }
        .padding(.top, 20)
        .padding(.horizontal, 16)
        .padding(.bottom, bottomPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .onGeometryChange(for: Bool.self) { proxy in
            proxy.safeAreaInsets.bottom > 0
        } action: { hasInset in
            isAboveTheHomeIndicator = hasInset
        }
        .background {
            UnevenRoundedRectangle(topLeadingRadius: 28, topTrailingRadius: 28)
                .fill(Color(.secondarySystemBackground))
                .shadow(
                    color: Color(.separator).opacity(colorScheme == .dark ? 2 / 3 : 0.5), radius: 0,
                    y: -0.5
                )
                .shadow(
                    color: .black.opacity(colorScheme == .dark ? 0.4 : 0.06), radius: 14, y: -10
                )
                .ignoresSafeArea(edges: .bottom)
        }
        .tint(Color(.systemBlue))
        .disabled(asking.isSending)
        .accessibilityElement(children: .contain)
        .task(id: asking.question.request.id) {
            isQuestionFocused = true
        }
    }

    private var bottomPadding: CGFloat {
        if isWritingOther { return 14 }
        return isAboveTheHomeIndicator ? -5 : 29
    }

    private var question: some View {
        VStack(alignment: .leading, spacing: 12) {
            if draft.isOneOfSeveral {
                segments
            }
            heading
                .padding(.horizontal, 6)
            VStack(spacing: 8) {
                ForEach(draft.asked.options, id: \.label) { option in
                    QuestionOptionButton(
                        option: option, isPicked: draft.isPicked(option),
                        isMultiSelect: draft.asked.multiSelect
                    ) {
                        isWritingOther = false
                        draft.pick(option)
                    }
                }
            }
            otherField
            if asking.hasFailed {
                ProblemLabel(message: "Couldn’t send your answer. Tap Send to try again.")
            }
        }
    }

    private var segments: some View {
        QuestionSegmentsLayout {
            ForEach(draft.request.questions.indices, id: \.self) { index in
                QuestionSegment(
                    header: draft.request.questions[index].header,
                    isShown: draft.shown == index,
                    isAnswered: draft.isMarkedAnswered(index)
                ) {
                    draft.show(index)
                }
            }
        }
        .padding(3)
        .background(Color(.tertiarySystemFill), in: .rect(cornerRadius: segmentsCorner))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("Questions")
    }

    private var heading: some View {
        VStack(alignment: .leading, spacing: 2) {
            if !draft.isOneOfSeveral {
                Text(draft.asked.header)
                    .font(.footnote.weight(.semibold))
                    .frame(minHeight: headerLine)
                    .foregroundStyle(.secondary)
            }
            Text(draft.asked.question)
                .font(.headline)
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
                .frame(minHeight: questionLine)
                .accessibilityAddTraits(.isHeader)
                .accessibilityFocused($isQuestionFocused)
            if draft.asked.multiSelect {
                Text("Choose any that apply.")
                    .font(.subheadline)
                    .frame(minHeight: hintLine)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var otherField: some View {
        HStack(spacing: 8) {
            TextField("Write your own answer…", text: $draft.other, axis: .vertical)
                .lineLimit(1...5)
                .font(.body)
                .focused($isWritingOther)
                .accessibilityLabel("Other answer")
                .id(dynamicTypeSize)
            if draft.hasOther {
                QuestionMark(isMultiSelect: false, isPicked: true)
            }
        }
        .padding(.vertical, 11.5)
        .padding(.leading, 16)
        .padding(.trailing, 14)
        .frame(minHeight: 45)
        .background(Color(.tertiarySystemBackground), in: .rect(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(
                    draft.hasOther ? Color(.systemBlue) : Color(.separator),
                    lineWidth: draft.hasOther ? 2 : 0.5)
        }
    }

    private var actions: some View {
        HStack {
            Button("Skip") {
                isWritingOther = false
                if draft.skip() {
                    send(draft)
                }
            }
            .buttonStyle(.borderless)
            .padding(.horizontal, 10)
            .frame(minHeight: 44)
            Spacer(minLength: 8)
            Button {
                isWritingOther = false
                if draft.goOn() {
                    send(draft)
                }
            } label: {
                Group {
                    if asking.isSending {
                        ProgressView()
                            .accessibilityLabel("Sending your answer")
                    } else {
                        Text(draft.isLast ? "Send" : "Next")
                            .fontWeight(.semibold)
                    }
                }
                .padding(.horizontal, sendInset)
                .frame(minHeight: sendLabelHeight)
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.capsule)
            .disabled(!draft.canGoOn)
        }
    }
}

struct LatestMessageButton: View {
    let jump: () -> Void
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Button(action: jump) {
            Image(systemName: "arrow.down")
                .font(.body.weight(.semibold))
                .foregroundStyle(.primary)
                .frame(width: 44, height: 44)
                .background(Color(.tertiarySystemBackground), in: .circle)
                .overlay {
                    Circle()
                        .strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.5)
                }
                .shadow(color: .black.opacity(colorScheme == .dark ? 0.4 : 0.08), radius: 7, y: 4)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Latest message")
        .padding(.bottom, 10)
    }
}

struct QuestionSegment: View {
    let header: String
    let isShown: Bool
    let isAnswered: Bool
    let show: () -> Void
    @ScaledMetric(relativeTo: .subheadline) private var height: CGFloat = 30
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Button(action: show) {
            HStack(spacing: 4) {
                if isAnswered {
                    Image(systemName: "checkmark")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Color(.systemGreen))
                }
                Text(header)
                    .font(.subheadline.weight(isShown ? .semibold : .medium))
                    .dynamicTypeSize(dynamicTypeSize.oneStepSmaller)
                    .foregroundStyle(.primary)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 8)
            .frame(maxWidth: .infinity, minHeight: height)
            .background {
                if isShown {
                    Capsule()
                        .fill(colorScheme == .dark ? Color(.systemGray2) : Color(.systemBackground))
                        .shadow(color: .black.opacity(0.04), radius: 0.5)
                        .shadow(color: .black.opacity(0.12), radius: 4, y: 3)
                }
            }
            .contentShape(.capsule)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(header)
        .accessibilityValue(isAnswered ? "Answered" : "")
        .accessibilityAddTraits(isShown ? .isSelected : [])
        .accessibilityRemoveTraits(isShown ? [] : .isSelected)
    }
}

struct QuestionSegmentsLayout: Layout {
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? widestIdealWidth(of: subviews) * CGFloat(subviews.count)
        let heights = frames(in: width, of: subviews).map(\.height)
        let height =
            isInARow(width, subviews) ? heights.max() ?? 0 : heights.reduce(0, +)
        return CGSize(width: width, height: height)
    }

    func placeSubviews(
        in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
    ) {
        let isRow = isInARow(bounds.width, subviews)
        for (subview, frame) in zip(subviews, frames(in: bounds.width, of: subviews)) {
            let height = isRow ? bounds.height : frame.height
            subview.place(
                at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY),
                proposal: ProposedViewSize(width: frame.width, height: height))
        }
    }

    private func isInARow(_ width: CGFloat, _ subviews: Subviews) -> Bool {
        widestIdealWidth(of: subviews) * CGFloat(subviews.count) <= width
    }

    private func widestIdealWidth(of subviews: Subviews) -> CGFloat {
        subviews.map { $0.sizeThatFits(.unspecified).width }.max() ?? 0
    }

    private func frames(in width: CGFloat, of subviews: Subviews) -> [CGRect] {
        if isInARow(width, subviews) {
            let share = width / CGFloat(subviews.count)
            return subviews.enumerated().map { index, subview in
                let height = subview.sizeThatFits(ProposedViewSize(width: share, height: nil))
                    .height
                return CGRect(x: share * CGFloat(index), y: 0, width: share, height: height)
            }
        }
        var top: CGFloat = 0
        return subviews.map { subview in
            let height = subview.sizeThatFits(ProposedViewSize(width: width, height: nil)).height
            defer { top += height }
            return CGRect(x: 0, y: top, width: width, height: height)
        }
    }
}

extension DynamicTypeSize {
    var oneStepSmaller: DynamicTypeSize {
        let sizes = Self.allCases
        let index = sizes.firstIndex(of: self) ?? sizes.startIndex
        return sizes[max(index - 1, sizes.startIndex)]
    }
}

struct QuestionOptionButton: View {
    let option: QuestionRequest.Option
    let isPicked: Bool
    let isMultiSelect: Bool
    let pick: () -> Void
    @ScaledMetric(relativeTo: .body) private var labelLine: CGFloat = 22
    @ScaledMetric(relativeTo: .subheadline) private var descriptionLine: CGFloat = 20

    var body: some View {
        Button(action: pick) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(option.label)
                        .font(.body)
                        .frame(minHeight: labelLine)
                        .foregroundStyle(.primary)
                    if let description = option.description, !description.isEmpty {
                        Text(description)
                            .font(.subheadline)
                            .frame(minHeight: descriptionLine)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
                QuestionMark(isMultiSelect: isMultiSelect, isPicked: isPicked)
            }
            .padding(.vertical, 11)
            .padding(.leading, 16)
            .padding(.trailing, 14)
            .frame(minHeight: 44)
            .background(Color(.tertiarySystemBackground), in: .rect(cornerRadius: 14))
            .overlay {
                if isPicked {
                    RoundedRectangle(cornerRadius: 14)
                        .strokeBorder(Color(.systemBlue), lineWidth: 2)
                }
            }
            .contentShape(.rect(cornerRadius: 14))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isPicked ? .isSelected : [])
    }
}

struct QuestionMark: View {
    let isMultiSelect: Bool
    let isPicked: Bool
    @ScaledMetric(relativeTo: .body) private var side: CGFloat = 22

    var body: some View {
        Group {
            if isMultiSelect {
                Image(systemName: isPicked ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(isPicked ? Color(.systemBlue) : Color(.tertiaryLabel))
            } else if isPicked {
                Image(systemName: "checkmark")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Color(.systemBlue))
            }
        }
        .frame(width: side, height: side)
        .accessibilityHidden(true)
    }
}

struct AnsweredQuestionCard: View {
    let answered: QuestionAnswered
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label {
                Text(title)
            } icon: {
                icon
            }
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.secondary)
            if !answered.lines.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(Array(answered.lines.enumerated()), id: \.offset) { _, line in
                        lineLayout {
                            if let header = line.header {
                                Text("\(header):")
                                    .foregroundStyle(.secondary)
                            }
                            Text(line.answer)
                                .foregroundStyle(.primary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .font(.subheadline)
                    }
                }
            }
        }
        .padding(.top, 12)
        .padding(.bottom, 14)
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 22))
        .accessibilityElement(children: .combine)
    }

    private var title: LocalizedStringKey {
        switch answered.by {
        case .you where answered.isSkipped: "You skipped"
        case .you: "You answered"
        case .elsewhere: "Answered on another device"
        }
    }

    @ViewBuilder private var icon: some View {
        switch answered.by {
        case .you where answered.isSkipped:
            Image(systemName: "forward.circle.fill")
        case .you:
            Image(systemName: "checkmark.circle.fill")
                .symbolRenderingMode(.palette)
                .foregroundStyle(.white, Color(.systemGreen))
        case .elsewhere:
            Image(systemName: "laptopcomputer")
        }
    }

    private var lineLayout: AnyLayout {
        dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 6))
    }
}

#if DEBUG
    #Preview("4.1 Panel · single select, empty") {
        QuestionPanelPreview(asking: QuestionsFixture.asking(QuestionsFixture.format))
    }

    #Preview("4.2 Panel · option chosen") {
        let asking = QuestionsFixture.asking(QuestionsFixture.format)
        var draft = QuestionDraft(request: asking.question.request)
        draft.pick(draft.asked.options[0])
        return QuestionPanelPreview(asking: asking, draft: draft)
    }

    #Preview("4.3 Panel · multi-select") {
        let asking = QuestionsFixture.asking(QuestionsFixture.sections)
        var draft = QuestionDraft(request: asking.question.request)
        draft.pick(draft.asked.options[0])
        draft.pick(draft.asked.options[1])
        return QuestionPanelPreview(asking: asking, draft: draft)
    }

    #Preview("4.4 Panel · Other typed") {
        let asking = QuestionsFixture.asking(QuestionsFixture.format)
        var draft = QuestionDraft(request: asking.question.request)
        draft.other = "Changelog, user-facing only"
        return QuestionPanelPreview(asking: asking, draft: draft)
    }

    #Preview("4.5 Panel · 3 questions, segment 2 · dark") {
        let asking = QuestionsFixture.asking(
            QuestionsFixture.format, QuestionsFixture.audience, QuestionsFixture.length)
        var draft = QuestionDraft(request: asking.question.request)
        draft.pick(draft.asked.options[0])
        _ = draft.goOn()
        draft.pick(draft.asked.options[0])
        return QuestionPanelPreview(asking: asking, draft: draft)
            .preferredColorScheme(.dark)
    }

    #Preview("Panel · answer refused") {
        var asking = QuestionsFixture.asking(QuestionsFixture.format)
        asking.hasFailed = true
        return QuestionPanelPreview(asking: asking)
    }

    #Preview("4.6 Answer · after Send") {
        AnsweredQuestionPreview(
            answered: QuestionAnswered(
                by: .you,
                lines: [
                    QuestionAnswerLine(header: "Format", answer: "Summary"),
                    QuestionAnswerLine(header: "Audience", answer: "People using the app"),
                    QuestionAnswerLine(header: "Length", answer: "Under a page"),
                ]))
    }

    #Preview("4.7 Answer · answered on another device") {
        AnsweredQuestionPreview(
            answered: QuestionAnswered(
                by: .elsewhere,
                lines: [QuestionAnswerLine(header: "Format", answer: "Full changelog")]))
    }

    #Preview("4.8 Panel · thread scrolled up") {
        QuestionPanelPreview(
            asking: QuestionsFixture.asking(QuestionsFixture.format), isScrolledUp: true)
    }

    #Preview("Answer · skipped") {
        AnsweredQuestionPreview(answered: QuestionAnswered(by: .you, lines: []))
    }

    #Preview("Thread · 4.1 question waiting") {
        SignInRootView(model: .fixture(.questionSingle))
    }

    #Preview("Thread · 4.5 three questions · dark") {
        SignInRootView(model: .fixture(.questionSeveral))
            .preferredColorScheme(.dark)
    }

    #Preview("Thread · 4.7 answered on another device") {
        SignInRootView(model: .fixture(.questionElsewhere))
    }

    #Preview("2.1 Conversations · needs you") {
        SignInRootView(model: .fixture(.questionsList))
    }

    private struct QuestionPanelPreview: View {
        let asking: QuestionAsking
        var draft: QuestionDraft?
        var isScrolledUp = false

        var body: some View {
            ScrollView {
                Text(QuestionsFixture.thread.map(\.content).joined(separator: "\n\n"))
                    .padding()
            }
            .defaultScrollAnchor(.bottom)
            .overlay(alignment: .bottom) {
                if isScrolledUp {
                    LatestMessageButton {}
                }
            }
            .safeAreaBar(edge: .bottom) {
                QuestionPanel(asking: asking, draft: draft) { _ in }
            }
        }
    }

    private struct AnsweredQuestionPreview: View {
        let answered: QuestionAnswered

        var body: some View {
            ScrollView {
                AnsweredQuestionCard(answered: answered)
                    .padding()
            }
        }
    }
#endif
