import SwiftUI
import Charts

// Suivi hebdomadaire (poids, sommeil, fatigue) et courbes de progression, comme l'onglet « Suivi » du site.
struct JournalView: View {
    @Environment(AppStore.self) private var store
    @State private var poids = ""
    @State private var sommeil = 7.0
    @State private var fatigue = 2

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    entryCard
                    if store.doc.log.count >= 2 { chartCard }
                    doneCard
                    historyCard
                }
                .padding(16)
            }
            .background(Theme.bg)
            .navigationTitle("Suivi")
            .toolbarBackground(Theme.bg, for: .navigationBar)
            .onAppear(perform: load)
        }
    }

    private var entryCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 14) {
                SectionTitle(text: "Cette semaine")
                HStack {
                    Text("Poids (kg)").foregroundStyle(Theme.fg2)
                    Spacer()
                    TextField("ex. 78,5", text: $poids).keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(width: 100)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("Sommeil moyen : \(fmt(sommeil)) h").foregroundStyle(Theme.fg2)
                    Slider(value: $sommeil, in: 4...10, step: 0.5)
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text("Fatigue").foregroundStyle(Theme.fg2)
                    Picker("Fatigue", selection: $fatigue) {
                        Text("Fraîche").tag(1); Text("Normale").tag(2); Text("Fatigué").tag(3); Text("Épuisé").tag(4)
                    }
                    .pickerStyle(.segmented)
                }
                Button("Enregistrer") {
                    store.saveLog(poids: Double(poids.replacingOccurrences(of: ",", with: ".")), sommeil: sommeil, fatigue: fatigue)
                }
                .buttonStyle(PrimaryButtonStyle())
            }
        }
    }

    private var chartCard: some View {
        let pts = store.doc.log.compactMap { e -> (Date, Double)? in
            guard let p = e.poids, let d = Day.date(e.date) else { return nil }
            return (d, p)
        }
        return Card {
            VStack(alignment: .leading, spacing: 12) {
                SectionTitle(text: "Poids")
                Chart(pts, id: \.0) { p in
                    LineMark(x: .value("Semaine", p.0), y: .value("kg", p.1)).foregroundStyle(Theme.accent).interpolationMethod(.catmullRom)
                    PointMark(x: .value("Semaine", p.0), y: .value("kg", p.1)).foregroundStyle(Theme.accent)
                }
                .chartYScale(domain: .automatic(includesZero: false))
                .chartYAxis { AxisMarks(position: .leading) { AxisGridLine().foregroundStyle(Theme.line); AxisValueLabel().foregroundStyle(Theme.muted) } }
                .chartXAxis { AxisMarks { AxisValueLabel(format: .dateTime.day().month(.abbreviated)).foregroundStyle(Theme.muted) } }
                .frame(height: 160)
            }
        }
    }

    // séances cochées par semaine du plan, jusqu'à la semaine en cours
    private var doneCard: some View {
        let cur = store.currentWeek?.w ?? 0
        let rows = (store.plan?.weeks ?? []).filter { $0.w <= cur }.map { wk -> (Int, Int, Int) in
            let p = store.weekProgress(wk); return (wk.w, p.done, p.total)
        }
        return Card {
            VStack(alignment: .leading, spacing: 12) {
                SectionTitle(text: "Séances faites")
                if rows.isEmpty {
                    Text("Coche tes séances : la régularité s'affichera ici.").foregroundStyle(Theme.muted)
                } else {
                    Chart(rows, id: \.0) { r in
                        BarMark(x: .value("Semaine", "S\(r.0)"), y: .value("Prévues", r.2)).foregroundStyle(Theme.fill)
                        BarMark(x: .value("Semaine", "S\(r.0)"), y: .value("Faites", r.1)).foregroundStyle(Theme.race)
                    }
                    .chartYAxis { AxisMarks(position: .leading) { AxisValueLabel().foregroundStyle(Theme.muted) } }
                    .frame(height: 130)
                }
            }
        }
    }

    @ViewBuilder private var historyCard: some View {
        if !store.doc.log.isEmpty {
            Card {
                VStack(alignment: .leading, spacing: 10) {
                    SectionTitle(text: "Historique")
                    ForEach(store.doc.log.reversed()) { e in
                        HStack {
                            Text("Sem. du \(Day.label(e.date, style: "d MMM"))").foregroundStyle(Theme.fg)
                            Spacer()
                            Text([e.poids.map { "\(fmt($0)) kg" }, e.sommeil.map { "\(fmt($0)) h" }].compactMap { $0 }.joined(separator: " · "))
                                .foregroundStyle(Theme.fg2)
                        }
                        .font(.subheadline)
                        .contextMenu { Button("Supprimer", role: .destructive) { store.deleteLog(e.date) } }
                    }
                }
            }
        }
    }

    private func load() {
        if let e = store.doc.log.first(where: { $0.date == Day.monday(of: store.today) }) {
            poids = e.poids.map(fmt) ?? ""
            sommeil = e.sommeil ?? 7
            fatigue = e.fatigue ?? 2
        } else if poids.isEmpty {
            poids = store.value("poids")
        }
    }
}
