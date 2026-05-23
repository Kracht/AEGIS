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
| Bogenförmige Stränge in „Quallen"-Form | Geomagnetische **Feldlinienschalen** (McIlwain L = 2…6) — geschlossene Feldlinien, sonnenseitig zu einer Glocke komprimiert und in nachlaufende Schweiffilamente ausgezogen (die echte Tropfenform der Magnetosphäre). Sie **reagieren auf den Sturm**: Der Staudruck presst die Tagseiten-Glocke nach innen, der Ringstrom (sinkendes Dst) bläht die inneren Schalen nach außen, und südwärtiges Bz zieht die Schweiffilamente aus — die schnelle Kompression und die langsame Aufblähung zeitlich sichtbar getrennt |
| Innerer Plasmaschimmer | Die **Plasmaphäre** — ein Ring aus kühlem, dichtem Plasma nahe der Erde; schrumpft bei Stürmen nach innen |
| Karmesinrotes Leuchten dicht um die Erde (nur bei Sturm) | **Partieller Ringstrom** — westwärts driftende energiereiche Ionen auf den geschlossenen Feldlinien; asymmetrisch (eng am Mittag, ausgebeult zur Mitternacht); das magnetische Signal einer geomagnetischen Hauptphase |
| Horizontales Band im Schweif | **Plasmaschicht** (Harris-Stromschicht) — dünne Lage dichten Plasmas in der magnetischen Äquatorebene des Schweifs, in Echtzeit flatternd |
| Heller orangener Fleck hinter der Erde (Bz südwärts) | **Substurm-Rekonnexionslinie** — wo gestreckte Schweif-Feldlinien aufreißen und gespeicherte Energie explosiv freisetzen |
| Leuchtende Polringe | **Auroren-Ovale** — wo energiereiche Teilchen in die Atmosphäre regnen. Live: der NOAA-OVATION-Nowcast. In Sturm-Wiedergaben: ein Modell-Oval (Gussenhoven-1983-Grenze, ~2°/Kp) als Tropfenform — breit und tief bis in mittlere Breiten auf der Nachtseite, ein schmaler Bogen auf der Tagseite — das sich ~30 min *nach* der Schweifladung ausdehnt |
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

Es ist bewusst ein einfaches Advektionsmodell. Darauf aufgesetzt trägt das Auroren-Oval einen **weiteren Verzug von ~30 min (Wachstumsphase)**: Sein steuerndes Bz wird eine halbe Stunde weiter zurück abgetastet, sodass in einer Wiedergabe erst der Schweif lädt und die X-Linie zündet und sich das Oval erst Minuten später ausdehnt und aufhellt — die Substurm-Wachstumsphase sichtbar gemacht. Der L1-Verzug und dieser zusätzliche Aurora-Verzug werden beide live in der Statusanzeige gezeigt (`lag · L1→shock NN min · aurora NN min`).

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

AEGIS zeigt dieselbe Live-Physik in vier Abstraktionsstufen. Mit `F3` (oder Klick auf **Mode: …** oben rechts) wechselst du zwischen ihnen. Die Auswahl bleibt über Reloads erhalten.

| Modus | Was zu sehen ist | Wozu er gut ist |
|---|---|---|
| **Visual** | Die volle volumetrische Szene — ray-marched Magnetosheath, Plasmaschicht, Quallen-Feldlinien, Polarlicht, Ringstrom. | Sehen, *wie der erdnahe Weltraum gerade aussieht*. |
| **Structural** | Nur die unsichtbaren **Flächen**: Shue-Magnetopause, Cairns/Fairfield-Bugstoßwelle, Dipol-L-Schalen L = 2…6 — als dünne cyan-weiße Konturlinien auf schwarzem Himmel, Erde gedimmt auf ~28%. | Die Optik weglassen und fragen: *„Welche Flächen liegen eigentlich unter dem Bild?"* Die Linien verformen sich live mit `r₀`, `α` und der sturmabhängigen Schalenverzerrung — man sieht direkt, wie sich die Magnetopause komprimiert und der Schweif ausbeult. |
| **Data** | Visual darunter, **plus** eine Tafel mit jeder Uniform der Szene — Wert, Einheit, Zitat und welcher Effekt damit gesteuert wird. Inklusive der Phase-1-Verzögerung `lag` = `1,5 × 10⁶ km ÷ v_sw`. | Fragen: *„Welche Zahlen stecken hinter diesem Bild?"* Hilft, eine Sturmphase zu deuten oder ein Feature dem zugrundeliegenden Modell zuzuordnen. |
| **Physics** | Das Structural-Liniengerüst **plus** ein kamerasynchrones 2D-Overlay des *Mechanismus*: schematische Feldrichtungs-Glyphen, farbcodiert nach **offen vs. geschlossen** (geschlossen = blau, kehrt zur Erde zurück; offen = bernstein, mit dem IMF verbunden), die angeströmten IMF-Pfeile und die **zwei Rekonnexions-X-Linien**. | Fragen: *„Wie kommt die Energie eigentlich herein?"* Offener Fluss ist die Tür: bei südlichem Bz öffnet sich die Tagseite, die **Tagseiten-X-Linie** rutscht zum Äquator (bei nördlichem Bz wandert sie zur hochbreitigen Lobe-Rekonnexion), und — Minuten später, über den verzögerten Schweif-Treiber — leuchtet die **erdnahe neutrale Linie** im Schweif auf. Diese Verzögerung zwischen den beiden X-Linien *ist* der Substurm. Jeder Marker ist auf dem Bild beschriftet; zum Anfahren erscheint die jeweilige Gleichung. Das Feld ist ein ehrliches **Schema** (analytischer Dipol + angeströmtes IMF), keine MHD-Lösung. |

`F2` blendet die Visual-Tuning-Slider ein (Kamera, Belichtung, Layer-Intensitäten). Die beiden Tafeln sind unabhängig und können gleichzeitig offen sein.

### Kamera & Free-Look (C)

Standardmäßig fliegt die Kamera einen langsamen Kinobogen über die **Flanke** — den seitlichen 3/4-Blickwinkel, in dem die Sturmverformung am besten lesbar ist — und schwenkt bewusst nie den Magnetschweif hinab (was sie im Schweif-Inneren vergraben würde). Mit `C` (oder Klick auf **Cam: …** oben rechts) aktivierst du **Free-Look**: **Ziehen zum Umkreisen** der Erde, **Scrollen zum Zoomen** (4–45 Rₑ). Die Ansicht bleibt in beiden Modi auf die Erde zentriert — du kannst also genau den Winkel wählen, der die Tagseiten-Kompression und den aufgeblähten Ringstrom einfängt, und dann zurückschalten, damit sie von selbst weiterkreist.

---

## Kausal-HUD & Sturm-Wiedergabe (F4)

Die Darstellungsmodi beantworten, *was* du siehst. Das **Kausal-HUD** (`F4`) beantwortet, *warum es sich geändert hat*. Es zeichnet die Antriebskette der Magnetosphäre als **zwei getrennte Stränge**, denn es sind tatsächlich unabhängige Mechanismen mit verschiedenen Zeitskalen:

- **Kompressions-Strang (schnell):** `Pdyn = ρv²  →  r₀ Standoff`. Der Staudruck des Sonnenwinds drückt die Tagseiten-Grenze nach innen. Das geschieht in Minuten und hängt kaum von der Feldrichtung ab.
- **Sturm-Strang (langsam):** `Bz → Rekonnexion (VBs) → Ringstrom-Injektion (Q) → Dst`. Nur *südwärts* gerichtetes IMF öffnet die Tagseite, lädt den Schweif und speist den Ringstrom — der sich dann über *Stunden* auf- und wieder abbaut.

Die Knoten leuchten nach den Live-Werten; die Kanten tragen die **echten Laufzeit-Verzögerungen** — die L1-Advektionsuhr (`⏱ ~30–60 min`) auf dem Hinweg, die Ringstrom-Abklingzeit (`τ`, mehrere Stunden) auf dem Rückweg. **Fahre über einen Knoten**, um seine Gleichung, den aktuellen Wert und die Quelle zu sehen. Genau das ist der Unterschied zwischen *Aquarium betrachten* und *Weltraumwetter verstehen*: dieselbe schöne Szene, aber mit explizit gemachter und korrekt verzögerter Ursache-Wirkung.

Die **Transportleiste** am unteren Rand spielt echte, aufgezeichnete Stürme ab, statt auf den Live-Himmel zu warten:

| Szenario | Was es lehrt |
|---|---|
| **Live (NOAA)** | Der echte Himmel, jetzt gerade. |
| **High-Speed Stream** (Mai 2007) | *Kompression ≠ Sturm.* Ein korotierender Strom drückt r₀ fast so stark hinein wie ein Supersturm, doch Dst bleibt ein Zehntel so tief — der obere Strang leuchtet, der untere kaum. Der sauberste Beleg, dass die beiden Stränge unabhängig sind. |
| **St. Patrick's 2015** | Der klassische zweistufige Sturm: erst komprimiert eine CME-Sheath, dann treibt das südwärtige Bz des Ejektas Minuten später die Hauptphase — die Stränge leuchten *nacheinander*. |
| **November 2004** | Ein tiefer Supersturm aus Sonnenzyklus 23 — beide Stränge hart getroffen, in zwei getrennten Schlägen. |
| **Gannon 2024** | Der stärkste Sturm seit zwei Jahrzehnten (Polarlicht bis in die Tropen) — das Extrem beider Stränge. |
| **Januar 2026** | Der schnelle CME eines X1.9-Flares (Sonnenwind über 1200 km/s) erzeugte die härteste Tagseiten-Kompression im Satz — r₀ unter 6 Rₑ gedrückt — samt S4-Strahlungssturm. Beide Stränge gleichzeitig hart getroffen. |

Wähle einen Sturm, dann **Play / Pause / Scrubben** und eine **Zeitraffer-Stufe** (ein mehrtägiger Sturm wird auf wenige Minuten gerafft). Da alles durch *dasselbe* Physikmodell wie der Live-Modus läuft, ticken die Verzögerungsuhren ehrlich: ein gescrubbter Sturm lässt die Tagseiten-Kompression *vor* der Ringstrom-Reaktion aufleuchten, nie im selben Frame. Bei Auswahl eines Sturms erscheint das Kausal-HUD automatisch.

Während ein Sturm läuft, zeigt die Statusanzeige das **gemessene SYM-H** (der echte Ringstrom-Index aus dem OMNI-Datensatz) direkt neben dem modellierten Dst — so kann man verfolgen, wie die Burton/O'Brien-Schätzung dem echten Sturm folgt und wo sie abweicht. Ehrliche Validierung, kein verstecktes Schönen.

> **Hinweis zu Halloween 2003.** Der berühmte Supersturm von 2003 fehlt bewusst: Seine vorgelagerten Sonnenwind-Monitore (ACE/Wind) waren während des Ereignisses gesättigt, OMNI hat also keine brauchbaren *Antriebsdaten* — eine Wiedergabe wäre flach. November 2004, vergleichbar tief und vollständig erfasst, springt ein. (Dasselbe Prinzip schließt Carrington 1859 aus: keine Messdaten, keine ehrliche Wiedergabe.)

Die Sturmdaten sind echte NASA-**OMNI**-Daten (Instrumentenära, 5-Minuten-Takt), offline gebündelt. Der modellierte Dst ist die Burton/O'Brien-Schätzung — nahe am gemessenen Index, aber nicht identisch.

---

*Daten: NOAA SWPC · DSCOVR am L1 · GOES-16/18 · NASA OMNI (Wiedergabe) · Erdbilder: NASA Blue Marble / Black Marble*
