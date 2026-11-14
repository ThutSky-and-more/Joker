# JOKER Kemmental

Website und Portal für JOKER, das Kinderfreizeitangebot der Evangelischen Kirchgemeinde Kemmental.

## Was kann die Website?

- Öffentliche responsive Startseite mit dekorativen Farbverläufen (ohne Fotos), Informationen und kommenden Terminen.
- **Ein einziges Login mit Netlify Identity.** Neue Benutzer = Eltern. **Nur** Benutzer mit der Netlify-Identity-Rolle `admin` erhalten Zugang zum Leiterbereich.
- Eltern können beliebig viele Kinder erfassen, eigene Daten ändern und für jeden veröffentlichten Termin mehrere Kinder an- oder abmelden.
- Anmeldung bis zum Abend vor dem Termin (Schweizer Datum), oder bis zum von der Leitung gewählten Anmeldeschluss.
- Leiter mit Tag `admin` erstellen und bearbeiten Termine inkl. Titel, Ort, Datum, Uhrzeiten, Beschreibung, Freigabe und Anmeldeschluss.
- Leiter sehen pro Termin die angemeldeten Kinder mit Kontaktpersonen und können Galeriebilder hochladen/löschen.
- Leiter können im Bereich **Kinder erfassen** Kinder zu bereits registrierten Elternkonten anhand der E-Mail-Adresse hinzufügen und optional direkt für einen Termin anmelden.
- Vergangene Termine und zugehörige Anmeldungen werden Eltern nicht mehr angezeigt. Leiter finden alle früheren Termine und Teilnehmerlisten im Bereich **Verlauf**; Termine können dort auch endgültig gelöscht werden.
- Galerie-Bilder lassen sich in der öffentlichen Galerie sowie im Leiterbereich anklicken und in Grossansicht öffnen.
- Getrennte serverseitige Rechteprüfung. Niemand erhält den `admin`-Tag durch die Registrierung.

## Architektur

- **GitHub:** Quellcode und Änderungen.
- **Netlify Pro (bereits vorhanden):** Webhosting, Netlify Identity, Netlify Functions.
- **Supabase Free:** PostgreSQL-Datenbank und öffentlich zugängliche, kuratierte Bildergalerie. **Supabase Auth wird NICHT verwendet.**
- **Netlify Functions:** Fragen Identity nach dem eingeloggten Benutzer und dessen *serverseitiger* Rolle, überprüfen Eigentum an Kinderdatensätzen und führen alle Datenbankoperationen aus.
- Der `SUPABASE_SERVICE_ROLE_KEY` liegt **ausschliesslich** in Netlify-Umgebungsvariablen. Er darf weder im GitHub-Repository noch in HTML/JS auftauchen.

Das Projekt nutzt **nicht Decap CMS**. Für persönliche Kinderdaten und rollenabhängige Termin-Anmeldungen passt eine eigene Verwaltungsoberfläche besser als ein Git-basiertes CMS. Ein zweites Login ist dadurch nicht nötig.

## Einrichtung – einmalig

1. **GitHub-Repository bereits eingerichtet:** https://github.com/ThutSky-and-more/Joker. Änderungen auf `main` veröffentlichen. Das DJ-Repository nicht verwenden.
2. Auf [Netlify](https://app.netlify.com/) **Add new project → Import an existing project → GitHub** wählen. Das neue Repo importieren. Netlify liest die `netlify.toml` automatisch (Build `npm run build`, Publish `dist`, Functions `netlify/functions`).
3. Auf [Supabase](https://supabase.com/) **Das eigene Free-Projekt `JOKER Kemmental` wurde angelegt** (Projekt-ID `dyujnqhgabtlsbdevxxi`, Region `eu-west-1`), und das Schema wurde als Migration `initial_joker_kemmental_schema` eingespielt. **Nicht** das bestehende ThurSky-Projekt bearbeiten.
4. In Supabase unter **Project Settings → API** die **Project URL** und den geheimen **service_role**-Schlüssel kopieren. In Netlify unter **Project configuration → Environment variables** die Variablen `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` anlegen. Den Schlüssel niemals in `config.js` einsetzen.
5. Auf Netlify beim JOKER-Projekt unter **Identity → Enable Identity** die Anmeldung aktivieren. Registrierung auf **Open** stellen und die **E-Mail-Bestätigung** aktiviert lassen. Projekt nach Änderung der Umgebungsvariablen **neu deployen**.
6. Ein eigenes Elternkonto über die JOKER-Website erstellen, E-Mail bestätigen und einloggen. Im Netlify-Dashboard unter **Identity → Users → [eigenes Konto]** als Rolle/Tag exakt `admin` hinzufügen. Nach dem Aus- und Wiedereinloggen erscheint der **Leiterbereich**.
7. Weitere Leiter erstellen sich ebenfalls normale Konten. Weise ihnen in Netlify Identity nach manueller Prüfung das Tag `admin` zu. Entziehe es dort wieder, falls nötig. Diese Anpassungen werden mit neuem Login / Token-Refresh wirksam.
8. **Vor der Veröffentlichung** Datenschutztext, Verantwortlichkeit der Kirchgemeinde, Hosting/Standorte, Retention & Löschprozess, Foto-Einwilligungen und die vorgefertigten Beschreibungstexte fachlich prüfen. Danach einen Probe-Anlass erstellen und **mit einem Eltern-Testkonto sowie einem Admin-Testkonto** den kompletten Ablauf auf der echten Netlify-URL prüfen.

### Kostenhinweise

Die Einrichtung setzt keine bezahlte Supabase-Funktion und keine neuen bezahlten Dienste voraus. Das ist **keine Garantie**, dass beliebig hohe Nutzung kostenlos bleibt: Netlify-Pro-Credits / Function-Ressourcen und Supabase-Free-Grenzen gelten weiterhin. **Supabase Free kann bei geringer Aktivität pausieren**. Für eine dauerhaft verlässliche produktive Kinderanmeldung muss dies vor dem Livebetrieb mit der Kirchgemeinde bewertet werden. Ein Up-/Autoupgrade oder neue kostenpflichtige Abos sind nicht Teil des Projekts.

### Netlify Identity

Es wird die **aktuelle** Bibliothek `@netlify/identity` verwendet. Nicht das alte `netlify-identity-widget`. Bestätigungs-, Einladung- und Passwortzurücksetzungslinks werden über `handleAuthCallback()` verarbeitet. Das eigentliche Login und sämtliche geschützte Funktionen müssen **auf einer veröffentlichten Netlify-URL** getestet werden; eine lokale Vorschau kann das nicht vollständig ersetzen.

### Bilder – später ergänzen

Die erste Version verwendet **keine Fotos**, weder KI-Bilder noch echte ThurSky-Aufnahmen. Startseite und Infobereich nutzen dezente Farbverläufe; die Galerie zeigt zunächst einen leeren Zustand. **Leiter mit Tag `admin`** können später unter **Leiterbereich → Galerie** eigene freigegebene JPG/PNG/WebP-Dateien (maximal 2.5 MB pro Bild) hochladen und veröffentlichen.

Fotos mit erkennbaren Kindern nur mit gültiger Einwilligung veröffentlichen. Wer später persönliche ThurSky-Aufnahmen als grossflächigen Hintergrund verwenden will, kann die dafür vorgesehene Designfläche durch CSS ersetzen.

### Keine Daten in GitHub

Persönliche Angaben, Kinderlisten, Telefonnummern und Anmeldungen werden **nicht** im GitHub-Repository gespeichert. Diese Daten liegen nur in der Supabase-Datenbank; die für alle sichtbaren Termine/Bilder können öffentlich über `/api?view=public` geladen werden. Eltern sehen nur die eigenen Kinder, Leiter nur Anmeldungen und zugehörige Kontaktpersonen. Die API kontrolliert das serverseitig.

### Datensicherung

Vor dem Produktivbetrieb einen klaren Datensicherungs- und Löschprozess festlegen. Ein Backup der Datenbank darf **nicht** in ein öffentliches GitHub-Repository gelangen.

## Entwicklung / Test

```sh
npm install
npm run check
npm run build
```

`npm run dev` zeigt lokale Demo-Daten, **keine** echten Anmeldungen. Authentifizierung und Functions müssen auf einem **Netlify Deploy Preview / der produktiven URL** getestet werden. Für statische Sicherheitstests `npm test` ausführen.

## Hinweise zu realen Terminen

Die zwei in der lokalen Vorschau vorkonfigurierten Termine dienen **ausschliesslich** als Testdaten. Nach dem Live-Schalten ist die echte Termintabelle zunächst leer. Leiter erstellen die tatsächlichen Termine selbst.

## Quellen

- Netlify Identity: https://docs.netlify.com/manage/security/secure-access-to-sites/identity/get-started/
- Netlify Identity Role Handling: https://docs.netlify.com/manage/security/secure-access-to-sites/identity/manage-existing-users/
- Netlify Identity in Functions: https://docs.netlify.com/manage/security/secure-access-to-sites/identity/use-identity-in-functions/
- Netlify Identity Kosten: https://docs.netlify.com/manage/security/secure-access-to-sites/identity/plans-and-pricing/
- Kirchgemeinde: https://www.evang-kemmental.ch/joker

## Betrieb und Erweiterungen

Die Website ist mit Netlify Identity und dem separaten Supabase-Projekt verbunden. Änderungen auf dem GitHub-Branch `main` müssen per Netlify-Deploy veröffentlicht werden. Die neuen Leiterfunktionen und der Verlauf müssen auf dem produktiven Netlify-Deployment mit Testkonten geprüft werden.

Eine separat beigelegte **HTML-Vorschau** zeigt die Gestaltung und erlaubt das Durchspielen der Abläufe mit Fantasiedaten; die Vorschau speichert nichts dauerhaft.

## Anwesenheit und Teilnehmerlisten (Leiter)
- Mit Netlify-Identity-Rolle `admin` unter **Teilnehmer → Termin wählen** Anmeldungen ansehen.
- Checkbox **Anwesend** pro angemeldetem Kind; Status wird direkt im separaten JOKER-Supabase-Projekt als `registrations.checked_in_at` gespeichert. Die Anwesenheit kann wieder zurückgesetzt werden.
- **Teilnehmerliste als PDF** exportieren: Namen, Alter, Eltern-Kontakt, Fotoeinwilligung und Anwesenheitsstatus. Export nur nach Leiter-Login und nur aus dem geschützten Leiterbereich; die Datei wird lokal auf dem Gerät erstellt.
- Solche PDFs sind personenbezogene Daten von Minderjährigen: nicht öffentlich hochladen/weitergeben, sicher verwahren und nach dem Anlass gemäss vereinbartem Löschkonzept löschen.
- Datenbankmigration `supabase/attendance.sql` ist bereits im eigenständigen JOKER-Projekt eingespielt.

## Suchmaschinen (SEO)
- Öffentliche Seite hat einen suchmaschinenfreundlichen Titel, Description, Robots- und Open-Graph-/Twitter-Metadaten.
- `public/robots.txt` erlaubt das Indexieren der Startseite, aber nicht die API-Pfade. **Private Kinder-/Elterndaten werden unabhängig davon ausschliesslich nach Login ausgegeben**.
- Eine exakte Canonical-URL und Sitemap sollten erst nach Festlegung der endgültigen Netlify-Domain ergänzt werden. Indexierung kann nicht garantiert werden; für bessere Auffindbarkeit Website im Google Search Console anmelden und von der Kirchgemeindeseite verlinken.
