import SwiftUI
import UIKit

struct TimesRevealingScroll<Content: View>: View {
    let content: Content
    @State private var revealDrag: CGFloat
    @ScaledMetric(relativeTo: .footnote) private var timeWidth = MessageBubbles.timeWidth
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
        #if DEBUG
            _revealDrag = State(initialValue: ConversationsFixture.showsTimes ? .infinity : 0)
        #else
            _revealDrag = State(initialValue: 0)
        #endif
    }

    var body: some View {
        ScrollView {
            content
                .offset(x: -revealed)
                .environment(\.areTimesShown, revealed > 0)
        }
        .gesture(TimesReveal(reveal: { revealDrag = $0 }, release: hideTimes))
    }

    private var revealed: CGFloat {
        min(revealDrag, timeWidth + MessageBubbles.timeGap)
    }

    private func hideTimes() {
        #if DEBUG
            guard !ConversationsFixture.holdsTimes else { return }
        #endif
        withAnimation(reduceMotion ? nil : .spring(duration: 0.35, bounce: 0.15)) {
            revealDrag = 0
        }
    }
}

struct TimesReveal: UIGestureRecognizerRepresentable {
    let reveal: (CGFloat) -> Void
    let release: () -> Void

    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator {
        Coordinator()
    }

    func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
        let pan = UIPanGestureRecognizer()
        pan.delegate = context.coordinator
        return pan
    }

    func handleUIGestureRecognizerAction(_ pan: UIPanGestureRecognizer, context: Context) {
        switch pan.state {
        case .began, .changed:
            reveal(max(0, -pan.translation(in: pan.view).x))
        case .ended, .cancelled, .failed:
            release()
        default:
            break
        }
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
            guard let pan = recognizer as? UIPanGestureRecognizer else { return false }
            let velocity = pan.velocity(in: pan.view)
            return velocity.x < 0 && abs(velocity.x) > abs(velocity.y) * 2
        }

        func gestureRecognizer(
            _ recognizer: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
        ) -> Bool {
            true
        }
    }
}
