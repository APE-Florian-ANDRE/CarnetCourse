import SwiftUI

// Premier lancement : 5 écrans courts, une question à la fois, puis le plan est généré (mêmes champs que le profil du site).
struct OnboardingView: View {
    @Environment(AppStore.self) private var store
    @State private var step = 0
    private let last = 4

    var body: some View {
        VStack(spacing: 0) {
            if step > 0 {
                HStack {
                    Button { withAnimation { step -= 1 } } label: { Image(systemName: "chevron.left").font(.headline) }
                        .accessibilityLabel("Retour")
                    ProgressView(value: Double(step), total: Double(last)).tint(Theme.accent)
                }
                .padding(.horizontal, 16).padding(.top, 8)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    switch step {
                    case 0: welcome
                    case 1: sportStep
                    case 2: goalStep
                    case 3: levelStep
                    default: bodyStep
                    }
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollDismissesKeyboard(.interactively)
            Button(step == 0 ? "Commencer" : step == last ? "Générer mon plan" : "Continuer") {
                if step == last { store.finishOnboarding() } else { withAnimation { step += 1 } }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(step == last && !bodyValid)
            .opacity(step == last && !bodyValid ? 0.4 : 1)
            .padding(16)
        }
        .background(Theme.bg)
        // le profil d'exemple pré-remplit tout, sauf les mesures : chacun saisit les siennes
        .onAppear { for k in ["age", "taille", "poids"] { store.set(k, "") } }
    }

    private var welcome: some View {
        VStack(alignment: .leading, spacing: 18) {
            Spacer(minLength: 60)
            Text("PACE'RUN").font(.display(64)).foregroundStyle(Theme.accent)
            Text("Ton plan d'entraînement, semaine après semaine.").font(.display(30, weight: .bold)).foregroundStyle(Theme.fg)
            Text("Quelques questions pour construire un plan adapté à ton niveau et à ton objectif. Tout reste sur ton iPhone.")
                .foregroundStyle(Theme.fg2)
        }
    }

    private var sportStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            title("Quel sport ?")
            ForEach([("course", "Course à pied", "figure.run"), ("trail", "Trail", "mountain.2"), ("vtt", "VTT", "figure.outdoor.cycle"),
                     ("force", "Haltérophilie et force", "dumbbell"), ("forme", "Remise en forme", "heart")], id: \.0) { v, l, icon in
                OptionCard(label: l, icon: icon, on: store.value("sport") == v) {
                    store.set("sport", v)
                    if v != "course" && v != "trail" { store.set("objectif", "forme") }
                    else if store.value("objectif") == "forme" { store.set("objectif", "10") }
                }
            }
        }
    }

    private var isRun: Bool { ["course", "trail"].contains(store.value("sport")) }

    private var goalStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            title(isRun ? "Ton objectif" : "Une date objectif ?")
            if isRun {
                ForEach([("5", "5 km"), ("10", "10 km"), ("21", "Semi-marathon"), ("42", "Marathon"), ("forme", "Forme et perte de poids")], id: \.0) { v, l in
                    OptionCard(label: l, on: store.value("objectif") == v) { store.set("objectif", v) }
                }
            }
            RaceDateField()
        }
    }

    private var levelStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            title("Ton niveau")
            ForEach([("deb", "Débutant", "Je commence ou je reprends"), ("int", "Intermédiaire", "Je cours régulièrement"),
                     ("conf", "Confirmé", "Je m'entraîne avec des séances structurées")], id: \.0) { v, l, d in
                OptionCard(label: l, detail: d, on: store.value("niveau") == v) {
                    store.set("niveau", v)
                    if v == "deb", (Int(store.value("seances")) ?? 0) > 4 { store.set("seances", "4") }
                }
            }
            title("Séances par semaine").padding(.top, 8)
            Picker("Séances", selection: Binding(get: { store.value("seances") }, set: { store.set("seances", $0) })) {
                ForEach(["3", "4", "5", "6"], id: \.self) { Text($0).tag($0) }
            }
            .pickerStyle(.segmented)
            if store.value("niveau") == "deb" && (Int(store.value("seances")) ?? 0) > 4 {
                Text("Débutant : 4 séances au plus, pour progresser sans te blesser.").font(.caption).foregroundStyle(Theme.long)
            }
        }
    }

    private var bodyValid: Bool {
        let a = Int(store.value("age")) ?? 0, t = Int(store.value("taille")) ?? 0
        let p = Double(store.value("poids").replacingOccurrences(of: ",", with: ".")) ?? 0
        return a >= 15 && a <= 100 && t >= 120 && t <= 230 && p >= 35 && p <= 250
            && !(store.value("niveau") == "deb" && (Int(store.value("seances")) ?? 0) > 4)
    }

    private var bodyStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            title("Toi")
            ProfileFields(running: isRun)
            if !bodyValid {
                Text("Âge (15 ans minimum), taille et poids sont nécessaires pour calculer les allures et les calories.")
                    .font(.caption).foregroundStyle(Theme.muted)
            }
        }
    }

    private func title(_ t: String) -> some View {
        Text(t).font(.display(34)).foregroundStyle(Theme.fg)
    }
}

struct OptionCard: View {
    let label: String
    var detail: String? = nil
    var icon: String? = nil
    let on: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                if let icon { Image(systemName: icon).font(.title3).frame(width: 30).foregroundStyle(on ? Theme.ink : Theme.accent) }
                VStack(alignment: .leading, spacing: 2) {
                    Text(label).font(.headline)
                    if let detail { Text(detail).font(.caption).opacity(0.75) }
                }
                Spacer()
                if on { Image(systemName: "checkmark.circle.fill") }
            }
            .foregroundStyle(on ? Theme.ink : Theme.fg)
            .padding(16)
            .background(on ? Theme.accent : Theme.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.selection, trigger: on)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

struct RaceDateField: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        let has = !store.value("raceDate").isEmpty
        VStack(alignment: .leading, spacing: 10) {
            Toggle("J'ai une date de course", isOn: Binding(
                get: { has },
                set: { $0 ? store.set("raceDate", Day.iso(Calendar.current.date(byAdding: .day, value: 84, to: Date()) ?? Date())) : store.set("raceDate", "") }))
            .foregroundStyle(Theme.fg)
            if has {
                DatePicker("Date", selection: Binding(
                    get: { Day.date(store.value("raceDate")) ?? Date() },
                    set: { store.set("raceDate", Day.iso($0)) }),
                    in: Date()..., displayedComponents: .date)
                .environment(\.locale, Locale(identifier: "fr_FR"))
                Text("Le plan se cale pour finir la semaine de ta course.").font(.caption).foregroundStyle(Theme.muted)
            }
        }
        .padding(16)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

// Tuto des fonctionnalités : affiché une fois après l'onboarding, puis depuis le profil.
struct TutorialView: View {
    let done: () -> Void
    @State private var page = 0

    private let pages: [(String, String, String, Color)] = [
        ("house.fill", "Ton accueil", "La séance du jour en grand, ta semaine en un coup d'œil, et le compte à rebours jusqu'à ta course.", Theme.accent),
        ("checkmark.circle.fill", "Coche tes séances", "Touche « C'est fait » après chaque séance, puis note l'effort ressenti de 1 à 10 : c'est ce qui permet de suivre ta forme.", Theme.race),
        ("calendar", "Tout ton plan", "Dans l'onglet Plan, fais glisser pour passer d'une semaine à l'autre. Touche une séance pour voir chaque étape et ses allures.", Theme.easy),
        ("chart.xyaxis.line", "Ton suivi", "Chaque semaine, note ton poids, ton sommeil et ta fatigue. Les courbes montrent ta progression et ta régularité.", Theme.long),
        ("person.crop.circle", "Ton profil", "Change d'objectif, de date ou de nombre de séances à tout moment : le plan se recalcule tout de suite.", Theme.renfo)
    ]

    var body: some View {
        VStack(spacing: 0) {
            HStack { Spacer(); Button("Passer", action: done).foregroundStyle(Theme.muted) }.padding(16)
            TabView(selection: $page) {
                ForEach(Array(pages.enumerated()), id: \.offset) { i, p in
                    VStack(spacing: 26) {
                        Spacer()
                        Image(systemName: p.0).font(.system(size: 72)).foregroundStyle(p.3)
                            .frame(width: 150, height: 150).background(p.3.opacity(0.12), in: Circle())
                        Text(p.1).font(.display(36)).foregroundStyle(Theme.fg)
                        Text(p.2).multilineTextAlignment(.center).foregroundStyle(Theme.fg2).padding(.horizontal, 28)
                        Spacer()
                    }
                    .tag(i)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .always))
            Button(page == pages.count - 1 ? "C'est parti" : "Suivant") {
                if page == pages.count - 1 { done() } else { withAnimation { page += 1 } }
            }
            .buttonStyle(PrimaryButtonStyle())
            .padding(16)
        }
        .background(Theme.bg)
    }
}
