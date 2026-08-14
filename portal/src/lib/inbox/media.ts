export type InboxOutboundAttachmentKind = "image" | "audio" | "video" | "file";

export interface InboxOutboundAttachment {
  id: string;
  name: string;
  size: number;
  contentType: string;
  kind: InboxOutboundAttachmentKind;
  url: string;
  token: string;
}
