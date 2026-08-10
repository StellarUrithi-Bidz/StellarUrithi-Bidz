// Shared IPFS upload logic for frontend and custodian portal.
export interface PinataUploadResult { cid: string; ipfsUri: string; gatewayUrl: string; }
const GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY || "https://gateway.pinata.cloud";

export async function uploadToPinata(file: File): Promise<PinataUploadResult> {
  const formData = new FormData(); formData.append("file", file);
  const res = await fetch("/api/ipfs/upload", { method: "POST", body: formData });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: "Upload failed" })); throw new Error(err.error || "Upload failed"); }
  return res.json();
}
export function cidToIpfsUri(cid: string): string { return `ipfs://${cid}`; }
export function ipfsUriToGateway(uri: string, gw?: string): string { return `${gw || GATEWAY}/ipfs/${uri.replace(/^ipfs:\/\//, "")}`; }
export function extractCid(ipfsUri: string): string { return ipfsUri.replace(/^ipfs:\/\//, ""); }
export function isValidCid(str: string): boolean { return /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58,})$/.test(extractCid(str)); }
