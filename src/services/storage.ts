import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "../firebase/config";
import { ProofFile, RequestFile } from "../types";

export async function uploadFileToPath(
  localUri: string,
  path: string
): Promise<{ url: string }> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);
  const url = await getDownloadURL(storageRef);
  return { url };
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
    `tripRequestDocs/${customerId}/${requestId}/${slot}-${Date.now()}-${fileName}`
  );
  return { url, name: fileName };
}
