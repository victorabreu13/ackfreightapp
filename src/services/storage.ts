import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "../firebase/config";
import { ProofFile } from "../types";

export async function uploadProofFile(
  localUri: string,
  driverId: string,
  fileName: string,
  kind: ProofFile["kind"]
): Promise<ProofFile> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const path = `proofs/${driverId}/${Date.now()}-${fileName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);
  const url = await getDownloadURL(storageRef);
  return { url, name: fileName, kind };
}
