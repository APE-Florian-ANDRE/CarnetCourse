import SwiftUI

@main
struct PaceRunApp: App {
    @State private var store = AppStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .preferredColorScheme(.dark)
                .tint(Theme.accent)
        }
    }
}

struct RootView: View {
    @Environment(AppStore.self) private var store
    @State private var tab = 0
    @State private var showTuto = false

    var body: some View {
        if !store.onboarded {
            OnboardingView()
        } else {
            TabView(selection: $tab) {
                Tab("Accueil", systemImage: "house.fill", value: 0) { DashboardView(tab: $tab) }
                Tab("Plan", systemImage: "calendar", value: 1) { PlanView() }
                Tab("Suivi", systemImage: "chart.xyaxis.line", value: 2) { JournalView() }
                Tab("Profil", systemImage: "person.crop.circle", value: 3) { ProfileView(showTuto: $showTuto) }
            }
            .onAppear { if !store.doc.tutoSeen { showTuto = true } }
            .fullScreenCover(isPresented: $showTuto) {
                TutorialView { store.markTutoSeen(); showTuto = false }
            }
        }
    }
}
