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
  downloadDocumentPdf(documentId: string): Promise<Buffer>
  uploadPdf(fileName: string, content: Buffer): Promise<void>
}
