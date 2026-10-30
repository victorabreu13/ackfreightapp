import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "../firebase/config";
import { ProofFile, RequestFile } from "../types";

export async function uploadFileToPath(
  localUri: string,
  path: string,
  fileName?: string
): Promise<{ url: string }> {
  // A picked file the browser can no longer read (moved, renamed, still
  // syncing from a cloud folder) fails here with a bare "Failed to fetch";
  // say which file it was so the customer can attach it again.
  let blob: Blob;
  try {
    const response = await fetch(localUri);
    blob = await response.blob();
  } catch {
    throw new Error(
      `Couldn't read ${fileName ? `"${fileName}"` : "an attached file"}. Remove it and attach it again (save it to your computer first if it is in a cloud folder).`
    );
  }
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);
  const url = await getDownloadURL(storageRef);
  return { url };
}

export async function uploadProofSvg(
  svg: string,
  driverId: string,
  fileName: string
): Promise<ProofFile> {
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const path = `proofs/${driverId}/${Date.now()}-${fileName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: "image/svg+xml" });
  const url = await getDownloadURL(storageRef);
  return { url, name: fileName, kind: "document" };
}

export async function uploadProofFile(
  localUri: string,
  driverId: string,
  fileName: string,
  kind: ProofFile["kind"]
): Promise<ProofFile> {
  const { url } = await uploadFileToPath(
    localUri,
    `proofs/${driverId}/${Date.now()}-${fileName}`
  );
  return { url, name: fileName, kind };
}

export async function uploadTripRequestFile(
  localUri: string,
  customerId: string,
  requestId: string,
  slot: string,
  fileName: string
): Promise<RequestFile> {
  const { url } = await uploadFileToPath(
    localUri,
    `tripRequestDocs/${customerId}/${requestId}/${slot}-${Date.now()}-${fileName}`,
    fileName
  );
  return { url, name: fileName };
}
