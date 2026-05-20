# AEGIS — Handbuch

**A**ctive **E**arth **G**eomagnetic **I**maging **S**ystem

Eine Echtzeit-3D-Visualisierung der Erdmagnetosphäre im Browser, gespeist mit Live-Daten des amerikanischen Weltraumwetterdienstes NOAA.

---

## Was du siehst

Die Szene zeigt die Erde und die unsichtbare Blase aus Magnetkraft, die sie schützt — die **Magnetosphäre**. Jede Form, Farbe und jedes Leuchten wird aus Messwerten berechnet, die Satelliten und Bodenstationen gerade jetzt aufnehmen.

| Visuelles Element | Bedeutung |
|---|---|
| Blaue/weiße Tropfenform | Die Magnetosphäre — sonnenseitig komprimiert, auf der Nachtseite zu einem langen Schweif ausgezogen |
| Warm getönte äußere Kuppel (Tagseite) | **Bugstoßwelle und Magnetosheath** — der Überschall-Sonnenwind schockt, erhitzt und legt sich um das magnetische Hindernis der Erde |
| Bogenförmige Stränge in „Quallen"-Form | Geomagnetische **Feldlinienschalen** (McIlwain L = 2…6) — geschlossene Feldlinien, sonnenseitig zu einer Glocke komprimiert und in nachlaufende Schweiffilamente ausgezogen (die echte Tropfenform der Magnetosphäre) |
| Innerer Plasmaschimmer | Die **Plasmaphäre** — ein Ring aus kühlem, dichtem Plasma nahe der Erde; schrumpft bei Stürmen nach innen |
| Karmesinrotes Leuchten dicht um die Erde (nur bei Sturm) | **Partieller Ringstrom** — westwärts driftende energiereiche Ionen auf den geschlossenen Feldlinien; asymmetrisch (eng am Mittag, ausgebeult zur Mitternacht); das magnetische Signal einer geomagnetischen Hauptphase |
| Horizontales Band im Schweif | **Plasmaschicht** (Harris-Stromschicht) — dünne Lage dichten Plasmas in der magnetischen Äquatorebene des Schweifs, in Echtzeit flatternd |
| Heller orangener Fleck hinter der Erde (Bz südwärts) | **Substurm-Rekonnexionslinie** — wo gestreckte Schweif-Feldlinien aufreißen und gespeicherte Energie explosiv freisetzen |
| Leuchtende Polringe | **Auroren-Ovale** — wo energiereiche Teilchen in die Atmosphäre regnen |
| Terminator-Linie auf der Erde | Die echte Tag/Nacht-Grenze zur aktuellen UTC-Zeit |
| Erdoberfläche | NASA Blue Marble (monatlich/saisonal) für den Tag; Black Marble Stadtlichter für die Nacht |
| Statusanzeige (oben links) | Live-Messwerte vom Satelliten DSCOVR am L1-Lagrangepunkt, ~1,5 Millionen km erdwärts der Sonne |

---

## Die Verbindung: Sonne → Sonnenwind → Magnetosphäre

Die Sonne verliert ständig einen Strom geladener Teilchen (Elektronen und Protonen) — den **Sonnenwind**. Er reist mit 300–800 km/s und trägt das Magnetfeld der Sonne mit sich — das **Interplanetare Magnetfeld (IMF)**.

Wenn der Sonnenwind auf die Erdmagnetosphäre trifft, komprimiert er die sonnenzugewandte Seite auf etwa 10 Erdradien (~64.000 km) und zieht die Nachtseite in einen Millionen Kilometer langen Schweif. Die Form ändert sich ständig, abhängig von Geschwindigkeit und Druck des Sonnenwinds.

Die entscheidende Größe ist **Bz** — die Nord-Süd-Komponente des IMF:

- **Bz nach Norden (+)** → IMF und Erdfeld zeigen in dieselbe Richtung → Magnetosphäre geschlossen, ruhig
- **Bz nach Süden (−)** → Feldlinien reconnektieren → Sonnenwind pumpt Energie und Teilchen ins System → Geomagnetischer Sturm, Auroren, Störungen

---

## Physikalische Zeit: Warum die Szene L1 um ~30–60 Minuten nachläuft

DSCOVR steht am **Lagrangepunkt L1**, rund 1,5 Millionen Kilometer sonnenwärts der Erde. Das Plasma, das DSCOVR jetzt misst, hat die Erde noch nicht erreicht — es muss erst mit der eigenen Sonnenwindgeschwindigkeit stromabwärts driften.

Diese Advektionszeit ist genau das, was du in der Szene siehst:

`t_lag ≈ 1,5 × 10⁶ km ÷ v_sw`

- Bei einem typischen 450 km/s → **~55 Minuten**
- Bei einem schnellen 800 km/s-CME → **~31 Minuten**

AEGIS puffert jede L1-Messung in einen 90-Minuten-Ring und rendert den Snapshot von `t_lag` zurück. Eine Bz-Stufe an L1 bleibt für die Laufzeit unsichtbar und schwappt dann in die Szene. Der modellierte Dst integriert über das **verzögerte** Bz und den verzögerten Druck — der Ringstrom-Wert reagiert also in physikalischer Reihenfolge: eine Süddrehung an L1 komprimiert zuerst die Magnetopause und lädt den Schweif, *danach* erst zeichnet sich die Dst-Signatur ab.

Es ist bewusst ein einfaches Advektionsmodell. Die feinere Differenzierung zwischen Schweifladung (Minuten) und vollständiger Ausdehnung des Auroren-Ovals (Substurm-Wachstumsphase, weitere zig Minuten) bleibt einer späteren Ausbaustufe vorbehalten; heute teilen sich beide denselben L1-Verzug.

---

## Datenquellen

Alle Daten werden live vom **Space Weather Prediction Center (SWPC) der NOAA** abgerufen. Der wichtigste Satellit ist **DSCOVR**, der am Lagrangepunkt L1 zwischen Erde und Sonne stationiert ist.

| Anzeige | Quelle | Was gemessen wird | Aktualisierung |
|---|---|---|---|
| **Bz** | DSCOVR/MAG — IMF-Magnetfeld | Nord-Süd-Komponente des Sonnenwindfeldes [nT]. Negativ = Sturmtreiber. | 1 min |
| **Bt** | DSCOVR/MAG — IMF-Magnetfeld | Gesamtfeldstärke des IMF [nT] | 1 min |
| **Spd** | DSCOVR/PLASMAN — Plasma-Instrument | Sonnenwindgeschwindigkeit [km/s] | 1 min |
| **P** | Berechnet aus Dichte + Geschwindigkeit | Dynamischer Druck auf die Magnetopause [nPa] | 1 min |
| **Kp** | Globales Magnetometernetznetz | Planetarischer geomagnetischer Störungsindex (0–9) | 3 min |
| **Flare** | GOES-Satelliten (Röntgensensoren) | Solarflare-Klasse (A → B → C → M → X) | 1 min |
| **Dst** | Modelliert — Burton/O'Brien-Kopplung (2000) | Ringstromstärke [nT], aus dem Sonnenwind-Input integriert. Eine Schätzung, *nicht* der offizielle Kyoto-Dst. | 1 min |
| **Phase** | Abgeleitet aus dDst/dt | Sturmphase — Injektion überwiegt = Hauptphase (↓), Ringstromzerfall überwiegt = Erholung (↑) | 1 min |
| **Auroren-Ovale** | NOAA OVATION-Modell | Vorhergesagte Auroraleistung pro Grad Breite/Länge | 5 min |

### Wie die Daten die Darstellung beeinflussen

- **Bz + Druck → Magnetopause-Form**: Das Shue-Modell (1997) wird jeden Frame neu berechnet. Ein stark südwärts gerichtetes Bz lässt die Magnetosphäre sichtbar schrumpfen und verformen.
- **Bz südwärts → Sturm-Anatomie**:
  - Die Plasmapause schrumpft von L ≈ 4,2 auf L ≈ 2,6 (Carpenter & Anderson 1992)
  - Der Ringstrom verlagert sich von L ≈ 4 nach L ≈ 3 nach innen, verstärkt sich und wird zu einem mittag–mitternacht-asymmetrischen *partiellen* Ringstrom, der auf den geschlossenen Feldlinien sitzt — die Dst-Signatur der Sturm-Hauptphase
  - Die Stromschicht im Magnetschweif wird dünner (Substurm-Wachstumsphase), Farbe verschiebt sich von kühlem Blau zu warmem Orange-Violett
  - Eine erdnahe Rekonnexionslinie zündet bei ca. 17 R_E hinter der Erde und pulsiert auf Substurm-Zeitskalen
- **Sonnenwindgeschwindigkeit → Helligkeit von Bugstoßwelle und Magnetosheath**: Die Aufheizung skaliert mit ρv², schnellerer Wind erzeugt eine heißere, sichtbarere Schockfront.
- **Kp → Größe der Auroren-Ovale**: Ein höherer Kp-Wert dehnt die leuchtenden Ringe in Richtung niedrigerer Breitengrade aus.
- **Flare → Lichtimpuls**: Ein M- oder X-Flare erzeugt einen sichtbaren Lichtblitz aus Sonnenrichtung.
- **Geschwindigkeit + Dichte → Helligkeit des inneren Plasmascheins**: Erhöhter Sonnenwind komprimiert und erhitzt die innere Magnetosphäre.
- **Dst → Ringstrom-Anzeige**: Die Dst-Anzeige integriert bei jeder Abfrage die Burton- (1975) / O'Brien-&-McPherron-Gleichung (2000) `dDst*/dt = Q − Dst*/τ` — eine explizite Rückkopplung aus Injektion und Zerfall, druckkorrigiert. Sie fällt während der Sturm-Hauptphase und erholt sich über Stunden.

---

## Solarereignisse: Flares, CMEs, Filamente, Protuberanzen

**Solarflares**
Plötzliche, intensive Strahlungsausbrüche (Röntgen- und UV-Strahlung) von der Sonnenoberfläche. Sie reisen mit Lichtgeschwindigkeit und erreichen die Erde in ~8 Minuten. Gemessen in Klassen: A und B sind Hintergrundrauschen, C ist gering, M ist mittel, X ist stark (X10+ ist extrem). Flares können Funkkommunikation nahezu sofort stören.

**Koronale Massenauswürfe (CMEs)**
Riesige Wolken magnetisierten Plasmas, die die Sonne in den Weltraum schleudert. Im Gegensatz zu Flares (Strahlung) sind CMEs physische Materie. Sie reisen mit 500–3.000 km/s und brauchen 1–3 Tage bis zur Erde. Wenn sie mit südwärts gerichtetem Bz ankommen, verursachen sie die stärksten Magnetstürme.

**Filamente und Protuberanzen**
Filamente sind dichte, kühle Plasmastränge, die über der Sonnenoberfläche durch Magnetfeldlinien gehalten werden. Vom Rand der Sonne aus gesehen erscheinen sie als über die Oberfläche hinausragende Strukturen und werden dann als Protuberanzen bezeichnet. Wenn ein Filament ausbricht, wird es häufig zu einem CME. Sie sind in dieser Visualisierung nicht direkt dargestellt, gelten aber als wichtige Vorläufer.

---

## Weltraumwetter im Alltag

Weltraumwetter ist keine rein akademische Angelegenheit. Die Auswirkungen sind messbar und manchmal schwerwiegend:

| Bereich | Auswirkung |
|---|---|
| **GPS / Navigation** | Ionosphärische Störungen beugen Radiosignale → Positionierungsfehler von Metern bis Kilometern |
| **Kurzwelle / Luftfahrt** | Röntgenflares verursachen Funkausfälle auf der Sonnenseite der Erde — für Minuten bis Stunden |
| **Stromnetze** | Geomagnetisch induzierte Ströme (GIC) fließen durch Leitungen und Pipelines → Transformatorschäden oder Blackouts (Québec 1989: 6 Millionen Haushalte ohne Strom) |
| **Satelliten** | Erhöhter atmosphärischer Luftwiderstand in niedrigen Umlaufbahnen → Orbitabfall; energiereiche Teilchen können Elektronik beschädigen |
| **Astronauten** | Erhöhtes Strahlungsrisiko — Weltraumspaziergänge werden anhand von Weltraumwettervorhersagen geplant |
| **Pipelines** | GIC korrodieren Metallpipelines langfristig |
| **Aurorensichtbarkeit** | Bei G2+ Stürmen sind Polarlichter weit außerhalb der Polarregionen sichtbar — Mitteleuropa und Nordamerika in mittleren Breiten |

---

## Kp / G-Sturm-Skala auf einen Blick

| Kp | NOAA G | Beschreibung | Aurorensichtbarkeit |
|---|---|---|---|
| 0–4 | — | Ruhig bis unruhig | Nur Polarregionen |
| 5 | G1 Gering | Kleiner Sturm | ~60° magnetische Breite |
| 6 | G2 Mäßig | Mäßiger Sturm | ~55° (südl. Skandinavien, nördl. Kanada) |
| 7 | G3 Stark | Starker Sturm | ~50° (Deutschland, nördliche USA) |
| 8 | G4 Schwer | Schwerer Sturm | ~45° |
| 9 | G5 Extrem | Extremsturm | Bis ~40° — selten, einmal pro Sonnenzyklus |

---

## Darstellungsmodi (F3)

AEGIS zeigt dieselbe Live-Physik in drei Abstraktionsstufen. Mit `F3` (oder Klick auf **Mode: …** oben rechts) wechselst du zwischen ihnen. Die Auswahl bleibt über Reloads erhalten.

| Modus | Was zu sehen ist | Wozu er gut ist |
|---|---|---|
| **Visual** | Die volle volumetrische Szene — ray-marched Magnetosheath, Plasmaschicht, Quallen-Feldlinien, Polarlicht, Ringstrom. | Sehen, *wie der erdnahe Weltraum gerade aussieht*. |
| **Structural** | Nur die unsichtbaren **Flächen**: Shue-Magnetopause, Cairns/Fairfield-Bugstoßwelle, Dipol-L-Schalen L = 2…6 — als dünne cyan-weiße Konturlinien auf schwarzem Himmel, Erde gedimmt auf ~28%. | Die Optik weglassen und fragen: *„Welche Flächen liegen eigentlich unter dem Bild?"* Die Linien verformen sich live mit `r₀`, `α` und der sturmabhängigen Schalenverzerrung — man sieht direkt, wie sich die Magnetopause komprimiert und der Schweif ausbeult. |
| **Data** | Visual darunter, **plus** eine Tafel mit jeder Uniform der Szene — Wert, Einheit, Zitat und welcher Effekt damit gesteuert wird. Inklusive der Phase-1-Verzögerung `lag` = `1,5 × 10⁶ km ÷ v_sw`. | Fragen: *„Welche Zahlen stecken hinter diesem Bild?"* Hilft, eine Sturmphase zu deuten oder ein Feature dem zugrundeliegenden Modell zuzuordnen. |

`F2` blendet die Visual-Tuning-Slider ein (Kamera, Belichtung, Layer-Intensitäten). Die beiden Tafeln sind unabhängig und können gleichzeitig offen sein.

---

*Daten: NOAA SWPC · DSCOVR am L1 · GOES-16/18 · Erdbilder: NASA Blue Marble / Black Marble*
