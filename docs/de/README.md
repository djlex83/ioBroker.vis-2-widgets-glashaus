# Glashaus-Widgets für ioBroker vis-2

**Glashaus** ist ein ruhiges Design im Glas-Look für [ioBroker vis-2](https://github.com/ioBroker/ioBroker.vis-2):
Milchglas-Kacheln, große Schrift mit kursivem Serifen-Akzent, hell und dunkel, und im Hintergrund Linienzeichnungen,
die bei Berührung in Partikel zerfließen. Gedacht für Wand-Tablets, läuft in jedem Browser.

Die Widgets sind allgemein gehalten: Die Datenpunkte wählst du im vis-2-Editor selbst. Bis dahin zeigt jedes Widget
lebendige Demo-Werte, so kannst du eine Seite zuerst gestalten und danach verbinden.

![Startseite des Beispielprojekts](../../img/demo-zuhause.png)

| Dunkel | Energie | Haus |
|---|---|---|
| ![Dunkel](../../img/demo-zuhause-dark.png) | ![Energie](../../img/demo-energie.png) | ![Haus](../../img/demo-haus.png) |

Die Bilder zeigen das mitgelieferte Beispielprojekt in vis-2 (1280 × 800, Demo-Werte).

## Widgets

| Widget | Was es zeigt |
|---|---|
| **Hintergrund** | Hintergrund für die ganze Seite: warmes Beige oder dunkel, ein großes Wort und eine Linienzeichnung (Haus, Energie, Heizung, Hausgeräte, Einfahrt, Grundriss oder ein eigenes Bild), die unter dem Finger in Partikel zerfließt. Das Haus kann das Wetter zeigen. |
| **Überschrift** | Begrüßung nach Tageszeit, zweite Zeile kursiv, kurzer Text, Uhr und Knöpfe zu anderen Seiten. |
| **Navigation** | Name, Links zu deinen Seiten (die aktive unterstrichen), Hell/Dunkel-Umschalter, Uhr und Status. |
| **Wert** | Glas-Kachel mit Symbol, Titel, animierter Zahl, Einheit, Status nach Grenzwerten und 24-h-Linie aus dem Verlauf. |
| **Schalter** | Schalter-Kachel, die eingeschaltet schwarz wird; Taster und Szene, optional Dimmer. |
| **Ring** | Ring für Prozentwerte wie den Ladestand einer Batterie. |
| **Meldungen** | Bis zu 20 Bedingungen als Zeilen oder als Liste aktiver Meldungen („Alles in Ordnung“, wenn nichts ansteht). |
| **Energiefluss** | PV, Haus, Batterie, Netz, Wallbox und ein weiterer Verbraucher mit wanderndem Fluss, Batterie-Ring und Autarkie. |
| **Verlauf** | Bis zu vier Reihen aus dem Verlaufs-Adapter als Linien oder als Säulen je Stunde, Tag, Woche oder Monat. |
| **Jahres-Skyline** | Ein Jahr Tageswerte als 3D-Skyline (PV-Ertrag, Verbrauch, Heizung …), mehrere Jahre als Streifen. |
| **Wetter** | Aktuelles Wetter mit animiertem Symbol, Werten und optional 24-h- und 7-Tage-Vorhersage. |
| **Hausgerät** | Animierte Waschmaschine, Trockner oder Spülmaschine mit Fortschritts-Ring, Restzeit und „fertig“. |
| **Kamera** | Kamerabild mit Aktualisierung, Live- und Bewegungs-Anzeige und großer Ansicht beim Antippen. |
| **Hausmodell 3D** | 3D-Glashaus aus einem Grundriss in Metern, mit Lampen, Fenstern, Bewegungsmeldern und Thermostaten an ihrem Platz. |

## Installation

Gebraucht werden **vis-2 ab 2.20** und der **web**-Adapter. Installiert wird im ioBroker-Admin unter *Adapter*
(Suche „glashaus“). Neue Adapter erscheinen zuerst im Verzeichnis *latest*; falls das Widget-Set noch nicht
aufgeführt ist, in den Admin-Einstellungen das Verzeichnis *latest* wählen.

vis-2 startet danach neu, die Widgets stehen in der Palette unter **Glashaus**.

## Beispielprojekt

[`examples/glashaus-demo.zip`](../../examples/glashaus-demo.zip) ist ein fertiges vis-2-Projekt mit drei Seiten für ein
Wand-Tablet (1280 × 800): **Zuhause**, **Energie** und **Haus**, zusammen 22 Widgets. Einspielen im vis-2-Editor:
*Projekte* → *Importieren* → Zip-Datei wählen → Namen vergeben, z. B. `glashaus-demo`. Alle Widgets laufen mit
Demo-Werten; danach in den Attributen jedes Widgets die eigenen Datenpunkte wählen.

## Erste Schritte

1. Eine Seite anlegen und das Widget **Hintergrund** darauflegen. Größe `100%` × `100%`, Position `0`/`0`
   (so ist es voreingestellt) und ganz nach hinten.
2. Oben **Überschrift** und **Navigation**, darunter Kacheln wie **Wert**, **Schalter**, **Energiefluss**.
3. Jedes Widget hat die Gruppe **Design**: *Design hell/dunkel* (wie vis-2, hell, dunkel, wie das Gerät),
   *Glas-Kachel* und *Einblend-Animation*. „Wie vis-2“ folgt dem Thema von vis-2, das der Umschalter im
   Navigations-Widget wechselt.
4. Verlauf, Jahres-Skyline und Wert-Kachel lesen aus dem Verlaufs-Adapter (history, influxdb oder sql).
   Die Instanz lässt sich je Widget wählen; Vorgabe ist die Standard-Instanz des Systems.

## Datenschutz

Die Schriften (Geist und Instrument Serif, SIL Open Font License) sind im Widget-Set enthalten. Es wird nichts von
fremden Servern geladen.

## Weiterentwickeln

Siehe [DEVELOPMENT.md](../../DEVELOPMENT.md) (Englisch): Aufbau, Regeln, neues Widget anlegen, Harness zum
Entwickeln ohne ioBroker und der vis-2-Test.
