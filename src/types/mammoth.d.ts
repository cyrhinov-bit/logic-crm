declare module 'mammoth' {
  export function convertToHtml(input: { arrayBuffer: ArrayBuffer } | { buffer: any } | { path: string }): Promise<{ value: string; messages: any[] }>;
  export function extractRawText(input: { arrayBuffer: ArrayBuffer } | { buffer: any } | { path: string }): Promise<{ value: string; messages: any[] }>;
}

