# MindGraph Notes – reMarkable Integration

> Technischer Bauplan für die bidirektionale reMarkable-Anbindung mit OCR und Graph-Verlinkung

---

## 1. Architekturübersicht

### Drei Transportschichten (Fallback-Kette)

```
MindGraph Notes
      │
      ├─► USB Web Interface (Primär – stabilste Option)
      │     http://10.11.99.1
      │     Kein Abo nötig, lokal, einfache REST-API
      │
      ├─► Cloud API (Sekundär – für Remote-Zugriff)
      │     Erfordert Connect-Abo
      │     REST + JSON, Token-basierte Auth
      │
      └─► SSH / SFTP (Fallback – Developer Mode)
            Direkter Dateisystemzugriff
            Erfordert Aktivierung (Geräte-Reset)
```

**Empfehlung:** USB Web Interface als Standard, Cloud API als optionale Erweiterung. SSH nur für Power-User. Die Architektur sollte über ein Transport-Interface abstrahiert werden, damit alle drei Wege austauschbar sind.

---

## 2. Transport-Abstraktionsschicht

```typescript
// src/remarkable/transport.ts

interface ReMarkableTransport {
  // Verbindung
  connect(): Promise<boolean>;
  disconnect(): void;
  isConnected(): boolean;

  // Dokumente
  listDocuments(folderId?: string): Promise<RMDocument[]>;
  getDocument(id: string): Promise<RMDocumentContent>;
  uploadDocument(file: Buffer, name: string, folderId?: string): Promise<string>;
  deleteDocument(id: string): Promise<void>;

  // Export
  exportPDF(id: string): Promise<Buffer>;
  exportNotebook(id: string): Promise<Buffer>; // .rmn raw format
}

interface RMDocument {
  id: string;
  name: string;
  type: 'DocumentType' | 'CollectionType'; // Datei oder Ordner
  parent: string;
  modifiedClient: string;
  currentPage: number;
  bookmarked: boolean;
  pages: RMPage[];
}

interface RMPage {
  id: string;
  layers: RMLayer[];
  template?: string;
}
```

### 2.1 USB Transport

```typescript
// src/remarkable/transports/usb.ts

class USBTransport implements ReMarkableTransport {
  private baseUrl = 'http://10.11.99.1';

  async connect(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/documents/`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async listDocuments(folderId?: string): Promise<RMDocument[]> {
    const url = folderId
      ? `${this.baseUrl}/documents/${folderId}`
      : `${this.baseUrl}/documents/`;
    const res = await fetch(url);
    return res.json();
  }

  async exportPDF(id: string): Promise<Buffer> {
    const res = await fetch(`${this.baseUrl}/download/${id}/placeholder`);
    return Buffer.from(await res.arrayBuffer());
  }

  async uploadDocument(file: Buffer, name: string): Promise<string> {
    const formData = new FormData();
    formData.append('file', new Blob([file]), name);
    const res = await fetch(`${this.baseUrl}/upload`, {
      method: 'POST',
      body: formData,
      headers: {
        'Origin': this.baseUrl,
        'Referer': `${this.baseUrl}/`,
      }
    });
    return res.text(); // returns document ID
  }
}
```

### 2.2 Cloud Transport

```typescript
// src/remarkable/transports/cloud.ts

class CloudTransport implements ReMarkableTransport {
  private deviceToken: string;
  private userToken: string;
  private storageHost: string;

  async connect(): Promise<boolean> {
    // 1. Service Discovery
    const discovery = await fetch(
      'https://service-manager-production-dot-remarkable-production.appspot.com' +
      '/service/json/1/document-storage?environment=production&apiVer=2'
    );
    const { Host } = await discovery.json();
    this.storageHost = `https://${Host}`;

    // 2. User Token erneuern (Device Token persistent gespeichert)
    const authRes = await fetch('https://my.remarkable.com/token/json/2/user/new', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.deviceToken}` }
    });
    this.userToken = await authRes.text();
    return true;
  }

  // Erstregistrierung mit One-Time-Code
  async register(oneTimeCode: string): Promise<string> {
    const res = await fetch('https://my.remarkable.com/token/json/2/device/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: oneTimeCode,
        deviceDesc: 'desktop-windows', // oder 'desktop-macos', 'desktop-linux'
        deviceID: crypto.randomUUID(),
      })
    });
    this.deviceToken = await res.text();
    return this.deviceToken; // persistent speichern!
  }

  async listDocuments(): Promise<RMDocument[]> {
    const res = await fetch(`${this.storageHost}/document-storage/json/2/docs`, {
      headers: { 'Authorization': `Bearer ${this.userToken}` }
    });
    return res.json();
  }
}
```

---

## 3. OCR-Pipeline für Handschrift

### Drei OCR-Optionen (absteigend nach Qualität)

| Engine | Qualität Handschrift | Kosten | Offline |
|--------|---------------------|--------|---------|
| Google Vision API | Exzellent | 1000 free/Monat, dann ~$1.50/1000 | Nein |
| reMarkable eigene OCR | Gut (auf dem Gerät) | Im Connect-Abo | Ja (auf Tablet) |
| Tesseract | Schlecht für Handschrift | Kostenlos | Ja |

### 3.1 Empfohlener Ansatz: Hybrid

```typescript
// src/remarkable/ocr.ts

interface OCREngine {
  recognize(image: Buffer): Promise<OCRResult>;
}

interface OCRResult {
  text: string;
  confidence: number;
  blocks: OCRBlock[]; // Positionsdaten für Linking
}

class OCRPipeline {
  private engines: OCREngine[];

  constructor(config: OCRConfig) {
    this.engines = [];

    // Priorität: reMarkable-eigene OCR > Google Vision > Tesseract
    if (config.useRemarkableOCR) {
      this.engines.push(new ReMarkableOCR());
    }
    if (config.googleVisionApiKey) {
      this.engines.push(new GoogleVisionOCR(config.googleVisionApiKey));
    }
    this.engines.push(new TesseractOCR()); // Fallback
  }

  async processPage(page: RMPage): Promise<OCRResult> {
    // 1. Page als PNG rendern (aus .rm Lines Format)
    const image = await renderPageToImage(page);

    // 2. Durch OCR-Engines laufen (erste mit Confidence > 0.7 gewinnt)
    for (const engine of this.engines) {
      const result = await engine.recognize(image);
      if (result.confidence > 0.7) return result;
    }

    return this.engines[this.engines.length - 1].recognize(image);
  }
}
```

### 3.2 reMarkable Lines-Format rendern

Das reMarkable speichert Handschrift nicht als Bilder, sondern als Vektordaten im `.rm` Lines-Format. Diese müssen zuerst gerendert werden:

```typescript
// src/remarkable/renderer.ts
// Nutzt die rm-lines Spezifikation

import { createCanvas } from 'canvas'; // node-canvas für Electron

interface RMStroke {
  pen: number;        // Stifttyp (Fineliner, Marker, etc.)
  color: number;      // 0=schwarz, 1=grau, 2=weiß
  width: number;
  points: { x: number; y: number; pressure: number; tilt: number }[];
}

async function renderPageToImage(
  pageData: Buffer,
  width = 1404,  // reMarkable Auflösung
  height = 1872
): Promise<Buffer> {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#FBFBFB'; // reMarkable Papierfarbe
  ctx.fillRect(0, 0, width, height);

  const strokes = parseRMLines(pageData);
  for (const stroke of strokes) {
    ctx.strokeStyle = getStrokeColor(stroke.color);
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    for (let i = 0; i < stroke.points.length; i++) {
      const p = stroke.points[i];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  return canvas.toBuffer('image/png');
}
```

---

## 4. Bidirektionaler Sync

### 4.1 Import: reMarkable → MindGraph (Handschrift → Markdown)

```typescript
// src/remarkable/sync/import.ts

interface ImportResult {
  markdown: string;
  sourceId: string;         // reMarkable Dokument-ID
  images: Buffer[];         // Gerenderte Seiten als Bilder
  detectedLinks: string[];  // Durch OCR erkannte [[wikilinks]]
}

class ReMarkableImporter {
  constructor(
    private transport: ReMarkableTransport,
    private ocr: OCRPipeline,
    private linkDetector: LinkDetector
  ) {}

  async importDocument(docId: string): Promise<ImportResult> {
    const doc = await this.transport.getDocument(docId);
    const markdownParts: string[] = [];
    const images: Buffer[] = [];
    const allLinks: string[] = [];

    // YAML Frontmatter mit reMarkable-Metadaten
    markdownParts.push('---');
    markdownParts.push(`title: "${doc.name}"`);
    markdownParts.push(`source: remarkable`);
    markdownParts.push(`remarkable_id: "${docId}"`);
    markdownParts.push(`imported: ${new Date().toISOString()}`);
    markdownParts.push(`last_modified: "${doc.modifiedClient}"`);
    markdownParts.push('---\n');

    for (let i = 0; i < doc.pages.length; i++) {
      const page = doc.pages[i];

      // OCR durchführen
      const ocrResult = await this.ocr.processPage(page);

      // Seite als Bild speichern (Referenz im Markdown)
      const pageImage = await renderPageToImage(page);
      images.push(pageImage);

      // Markdown zusammenbauen
      if (doc.pages.length > 1) {
        markdownParts.push(`## Seite ${i + 1}\n`);
      }

      // Eingebettetes Originalbild
      markdownParts.push(
        `![[${doc.name}_page_${i + 1}.png|Handschriftliche Notiz]]\n`
      );

      // OCR-Text
      markdownParts.push(ocrResult.text);
      markdownParts.push('');

      // Links erkennen
      const links = this.linkDetector.findPotentialLinks(
        ocrResult.text,
        existingNotes
      );
      allLinks.push(...links);
    }

    return {
      markdown: markdownParts.join('\n'),
      sourceId: docId,
      images,
      detectedLinks: allLinks,
    };
  }
}
```

### 4.2 Export: MindGraph → reMarkable (Markdown → PDF)

```typescript
// src/remarkable/sync/export.ts

class ReMarkableExporter {
  constructor(
    private transport: ReMarkableTransport,
    private pdfRenderer: MarkdownToPDFRenderer
  ) {}

  async exportNote(note: MindGraphNote): Promise<string> {
    // 1. Markdown → PDF rendern
    const pdfBuffer = await this.pdfRenderer.render(note.content, {
      pageSize: 'remarkable', // 1404x1872 optimiert
      fontSize: 14,
      fontFamily: 'serif',
      margins: { top: 100, bottom: 100, left: 80, right: 80 },
      includeBacklinks: true,  // Backlinks als Fußnoten
      includeGraphPosition: true, // Graph-Position als Metadaten
    });

    // 2. Auf reMarkable hochladen
    const rmFolderId = await this.ensureFolder('MindGraph');
    const docId = await this.transport.uploadDocument(
      pdfBuffer,
      `${note.title}.pdf`,
      rmFolderId
    );

    // 3. Sync-Metadaten in der Notiz speichern
    await this.updateNoteFrontmatter(note, {
      remarkable_id: docId,
      last_exported: new Date().toISOString(),
    });

    return docId;
  }
}
```

### 4.3 Sync-Manager

```typescript
// src/remarkable/sync/manager.ts

class SyncManager {
  private syncState: Map<string, SyncRecord> = new Map();

  interface SyncRecord {
    noteId: string;
    remarkableId: string;
    lastSyncedAt: string;
    lastModifiedLocal: string;
    lastModifiedRemote: string;
    direction: 'import' | 'export' | 'bidirectional';
    conflictStrategy: 'local-wins' | 'remote-wins' | 'ask';
  }

  async sync(): Promise<SyncReport> {
    const report: SyncReport = { imported: [], exported: [], conflicts: [] };

    // 1. Alle reMarkable-Dokumente laden
    const rmDocs = await this.transport.listDocuments();

    // 2. Alle lokalen Notizen mit remarkable_id laden
    const linkedNotes = this.vault.getNotesWithFrontmatter('remarkable_id');

    // 3. Änderungen erkennen
    for (const record of this.syncState.values()) {
      const rmDoc = rmDocs.find(d => d.id === record.remarkableId);
      const localNote = linkedNotes.find(n => n.id === record.noteId);

      if (!rmDoc || !localNote) continue;

      const remoteChanged = rmDoc.modifiedClient > record.lastModifiedRemote;
      const localChanged = localNote.modifiedAt > record.lastModifiedLocal;

      if (remoteChanged && localChanged) {
        // Konflikt!
        report.conflicts.push({
          noteId: record.noteId,
          remarkableId: record.remarkableId,
          localModified: localNote.modifiedAt,
          remoteModified: rmDoc.modifiedClient,
        });
      } else if (remoteChanged) {
        // Import: Änderungen vom reMarkable holen
        await this.importer.importDocument(record.remarkableId);
        report.imported.push(record.remarkableId);
      } else if (localChanged) {
        // Export: Lokale Änderungen ans reMarkable senden
        await this.exporter.exportNote(localNote);
        report.exported.push(record.noteId);
      }
    }

    // 4. Neue unverlinkte reMarkable-Dokumente anbieten
    const unlinked = rmDocs.filter(
      d => !this.syncState.has(d.id) && d.type === 'DocumentType'
    );
    report.newRemoteDocuments = unlinked;

    return report;
  }
}
```

---

## 5. Automatische Graph-Verlinkung

### 5.1 Link-Erkennung im OCR-Text

```typescript
// src/remarkable/linking/detector.ts

class LinkDetector {
  constructor(private vault: VaultIndex) {}

  findPotentialLinks(
    ocrText: string,
    options: { minConfidence: number } = { minConfidence: 0.6 }
  ): DetectedLink[] {
    const links: DetectedLink[] = [];
    const existingTitles = this.vault.getAllNoteTitles();

    // 1. Exakte Treffer: Notiz-Titel im OCR-Text finden
    for (const title of existingTitles) {
      if (title.length < 3) continue; // Zu kurz, zu viele False Positives
      const regex = new RegExp(`\\b${escapeRegex(title)}\\b`, 'gi');
      const matches = ocrText.matchAll(regex);
      for (const match of matches) {
        links.push({
          text: match[0],
          targetTitle: title,
          position: match.index!,
          confidence: 1.0,
          type: 'exact',
        });
      }
    }

    // 2. Fuzzy Matching: Ähnliche Begriffe finden (Levenshtein)
    const words = ocrText.split(/\s+/).filter(w => w.length > 3);
    for (const word of words) {
      for (const title of existingTitles) {
        const similarity = levenshteinSimilarity(
          word.toLowerCase(),
          title.toLowerCase()
        );
        if (similarity > options.minConfidence && similarity < 1.0) {
          links.push({
            text: word,
            targetTitle: title,
            position: ocrText.indexOf(word),
            confidence: similarity,
            type: 'fuzzy',
          });
        }
      }
    }

    // 3. Tag-Erkennung: #hashtags aus Handschrift
    const tagRegex = /#(\w+)/g;
    const tagMatches = ocrText.matchAll(tagRegex);
    for (const match of tagMatches) {
      links.push({
        text: match[0],
        targetTitle: match[1],
        position: match.index!,
        confidence: 0.9,
        type: 'tag',
      });
    }

    return links.sort((a, b) => b.confidence - a.confidence);
  }
}
```

### 5.2 Graph-Integration

```typescript
// src/remarkable/linking/graph-integration.ts

class ReMarkableGraphIntegrator {
  /**
   * Importierte reMarkable-Notiz in den Graph einfügen
   * und automatisch erkannte Links als Edges erstellen
   */
  async integrateIntoGraph(
    importResult: ImportResult,
    graphStore: GraphStore
  ): Promise<void> {
    // 1. Neuen Node im Graph erstellen
    const nodeId = await graphStore.addNode({
      id: importResult.sourceId,
      title: importResult.markdown.match(/title: "(.+)"/)?.[1] || 'Untitled',
      type: 'remarkable-import',
      icon: '✏️', // Visuell unterscheidbar
      // Automatische Positionierung neben verknüpften Notizen
      position: this.calculatePosition(importResult.detectedLinks, graphStore),
    });

    // 2. Erkannte Links als Edges hinzufügen
    for (const link of importResult.detectedLinks) {
      const targetNode = graphStore.findNodeByTitle(link.targetTitle);
      if (targetNode) {
        await graphStore.addEdge({
          source: nodeId,
          target: targetNode.id,
          type: link.confidence === 1.0 ? 'solid' : 'dashed',
          label: link.type === 'fuzzy' ? `~${Math.round(link.confidence * 100)}%` : undefined,
        });
      }
    }

    // 3. Optional: User zur Bestätigung auffordern
    if (importResult.detectedLinks.some(l => l.type === 'fuzzy')) {
      this.emitEvent('links-need-review', {
        nodeId,
        fuzzyLinks: importResult.detectedLinks.filter(l => l.type === 'fuzzy'),
      });
    }
  }

  /**
   * Position berechnen: In der Nähe der meisten verknüpften Notizen
   */
  private calculatePosition(
    links: DetectedLink[],
    graphStore: GraphStore
  ): { x: number; y: number } {
    const linkedPositions = links
      .map(l => graphStore.findNodeByTitle(l.targetTitle))
      .filter(Boolean)
      .map(n => n!.position);

    if (linkedPositions.length === 0) {
      return { x: Math.random() * 500, y: Math.random() * 500 };
    }

    // Schwerpunkt der verknüpften Nodes + Offset
    const center = {
      x: linkedPositions.reduce((s, p) => s + p.x, 0) / linkedPositions.length,
      y: linkedPositions.reduce((s, p) => s + p.y, 0) / linkedPositions.length,
    };

    return {
      x: center.x + 200 + Math.random() * 100,
      y: center.y + Math.random() * 200 - 100,
    };
  }
}
```

---

## 6. UI-Komponenten

### 6.1 reMarkable-Panel in der Sidebar

```
┌──────────────────────────┐
│ 📱 reMarkable            │
│ ┌──────────────────────┐ │
│ │ ● Verbunden (USB)    │ │
│ └──────────────────────┘ │
│                          │
│ 📁 Notebooks            │
│  ├── 📝 Meeting Notes   │ ← Doppelklick: Import
│  ├── 📝 Ideen           │
│  └── 📁 Projekte        │
│       ├── 📝 MindGraph  │ ⟷ Synced
│       └── 📝 Blog       │
│                          │
│ ┌──────────────────────┐ │
│ │ 🔄 Sync All  │ ⬆ Send│ │
│ └──────────────────────┘ │
│                          │
│ Letzter Sync: vor 5 Min │
└──────────────────────────┘
```

### 6.2 Import-Dialog mit Link-Review

```
┌─────────────────────────────────────────┐
│ Import: "Meeting Notes 24.02"           │
│─────────────────────────────────────────│
│                                         │
│ 📄 3 Seiten erkannt                     │
│ 🔤 OCR Confidence: 87%                 │
│                                         │
│ 🔗 Erkannte Verlinkungen:              │
│                                         │
│ ✅ "Telli KI"     → [[Telli KI]]      │ 100%
│ ✅ "PARA Methode"  → [[PARA]]          │ 100%
│ ⚠️ "Obsidean"      → [[Obsidian]]?    │  82%
│ ⚠️ "Digitl Brain"  → [[Digital Brain]]│  76%
│ ❌ "Mittwoch"       → (ignorieren)     │
│                                         │
│ Graph-Position: ○ Automatisch           │
│                 ● Manuell platzieren    │
│                                         │
│        [Abbrechen]  [Importieren]       │
└─────────────────────────────────────────┘
```

---

## 7. Einstellungen & Konfiguration

```typescript
// src/remarkable/config.ts

interface ReMarkableConfig {
  // Transport
  transport: 'usb' | 'cloud' | 'ssh' | 'auto';
  cloudToken?: string;        // Persistent gespeicherter Device Token
  sshHost?: string;           // Standard: 10.11.99.1
  sshPassword?: string;

  // OCR
  ocrEngine: 'google-vision' | 'remarkable' | 'tesseract' | 'auto';
  googleVisionApiKey?: string;
  ocrLanguage: string;        // Standard: 'de' für deutsch

  // Sync
  syncMode: 'manual' | 'on-connect' | 'interval';
  syncInterval?: number;      // Minuten
  conflictStrategy: 'local-wins' | 'remote-wins' | 'ask';
  autoImportFolder?: string;  // reMarkable-Ordner der automatisch importiert wird
  exportFolder: string;       // reMarkable-Zielordner für Exports

  // Graph
  autoLinkOnImport: boolean;  // Automatisch Links erkennen
  fuzzyLinkThreshold: number; // 0.0-1.0, Standard: 0.7
  showRemarkableIcon: boolean; // ✏️ Icon im Graph für importierte Notizen
  importImageFormat: 'png' | 'svg';
}
```

---

## 8. Implementierungsplan (Sprints)

### Sprint 1: Fundament (1 Woche)
- [ ] Transport-Interface definieren
- [ ] USB Transport implementieren
- [ ] Verbindungstest & Geräte-Erkennung
- [ ] Dokumentenliste abrufen und in Sidebar anzeigen

### Sprint 2: Import Basics (1 Woche)
- [ ] PDF-Export vom reMarkable abrufen
- [ ] .rm Lines Format parsen (Bibliothek: `rmscene` oder eigener Parser)
- [ ] Seiten als PNG rendern
- [ ] Basale Markdown-Datei erstellen mit eingebetteten Bildern

### Sprint 3: OCR-Pipeline (1-2 Wochen)
- [ ] Tesseract-Integration (Offline-Fallback)
- [ ] Google Vision API anbinden
- [ ] OCR-Ergebnis in Markdown-Text umwandeln
- [ ] Spracheinstellung (Deutsch/Englisch)

### Sprint 4: Export (1 Woche)
- [ ] Markdown → PDF Renderer (existiert vielleicht schon in MindGraph?)
- [ ] PDF-Upload ans reMarkable
- [ ] Ordner-Management auf dem reMarkable
- [ ] Frontmatter mit remarkable_id pflegen

### Sprint 5: Sync & Konflikte (1 Woche)
- [ ] Sync-State persistieren (JSON oder SQLite)
- [ ] Änderungserkennung (Timestamps vergleichen)
- [ ] Konflikt-Dialog UI
- [ ] Auto-Sync bei USB-Verbindung (optional)

### Sprint 6: Smart Linking (1-2 Wochen)
- [ ] Link-Erkennung im OCR-Text
- [ ] Fuzzy Matching gegen bestehende Notizen
- [ ] Import-Dialog mit Link-Review
- [ ] Graph-Positionierung für importierte Notizen
- [ ] Visuelle Unterscheidung im Graph (Icon, Farbe)

### Sprint 7: Cloud API (Optional, 1 Woche)
- [ ] Cloud Transport implementieren
- [ ] One-Time-Code Registrierung UI
- [ ] Token-Management (sicher speichern)
- [ ] Auto-Fallback: USB → Cloud

---

## 9. Abhängigkeiten

```json
{
  "dependencies": {
    "canvas": "^2.11.0",           // PNG-Rendering der Handschrift
    "tesseract.js": "^5.0.0",     // Offline-OCR
    "pdfkit": "^0.14.0",          // Markdown → PDF Export
    "chokidar": "^3.6.0",         // USB-Verbindung erkennen
    "better-sqlite3": "^11.0.0"   // Sync-State persistieren
  },
  "optionalDependencies": {
    "@google-cloud/vision": "^4.0.0"  // Google Vision OCR
  }
}
```

---

## 10. Risiken & Mitigationen

| Risiko | Impact | Mitigation |
|--------|--------|------------|
| Cloud API undokumentiert, kann sich ändern | Hoch | USB als primären Transport nutzen, Cloud optional |
| Hash-Tree bei Cloud API kann Account löschen | Kritisch | Nur lesend nutzen oder umfassende Tests |
| OCR-Qualität bei Handschrift variabel | Mittel | Multi-Engine Fallback, manuelle Korrektur erlauben |
| reMarkable Lines-Format undokumentiert | Mittel | Community-Bibliotheken nutzen (rmscene, lines-are-beautiful) |
| Performance bei vielen Seiten/Dokumenten | Mittel | Lazy Loading, Background Processing mit Web Workers |
| Developer Mode deaktiviert SSH nach Update | Niedrig | USB Web Interface als Standard, SSH nur als Bonus |

---

## 11. Differenzierung

Diese Integration wäre ein echtes Alleinstellungsmerkmal für MindGraph Notes:

- **Obsidian** hat kein natives reMarkable-Plugin (nur Community-Plugins mit eingeschränkter Funktionalität)
- **Logseq, Notion, etc.** haben keine reMarkable-Anbindung
- **Handschrift → Graph** gibt es nirgendwo – die automatische Verlinkung handschriftlicher Notizen in einen visuellen Wissensgraphen ist einzigartig
- **Bidirektionaler Sync** mit Konfliktmanagement geht weit über bestehende Tools hinaus

Für dein Zielpublikum (Wissensarbeiter, die handschriftlich denken und digital vernetzen wollen) wäre das ein Killer-Feature.
