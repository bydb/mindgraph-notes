export interface RMDocumentSummary {
  id: string
  name: string
  type: 'DocumentType' | 'CollectionType'
  parent: string
  modifiedClient: string
}

export interface ReMarkableTransport {
  connect(): Promise<boolean>
  listDocuments(folderId?: string): Promise<RMDocumentSummary[]>
  downloadDocumentPdf(documentId: string): Promise<Uint8Array>
  uploadPdf(fileName: string, content: Uint8Array): Promise<void>
}
