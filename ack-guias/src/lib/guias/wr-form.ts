/**
 * The values of the warehouse receipt form. They live apart from the form component because the pages that fill the
 * form are server components, and a value exported from a client component cannot be used by them.
 */
export type ReceiptFormLine = {
  pieces: string;
  packageType: string;
  length: string;
  width: string;
  height: string;
  weightKg: string;
  location: string;
  description: string;
  notes: string;
  pcTracking: string;
};

export type ReceiptFormValues = {
  id?: string;
  warehouse: string;
  receivedBy: string;
  client: string;
  shipper: string;
  shipperAddress: string;
  consignee: string;
  consigneeAddress: string;
  carrier: string;
  driver: string;
  driverLicense: string;
  supplier: string;
  invoiceNumber: string;
  poNumber: string;
  pickupNumber: string;
  trackingNumber: string;
  proNumber: string;
  htPallet: boolean;
  palletType: string;
  dangerousGood: string;
  sealedDrum: string;
  notes: string;
  pickupRequestId: string;
  lines: ReceiptFormLine[];
};

export const EMPTY_RECEIPT_LINE: ReceiptFormLine = { pieces: "1", packageType: "", length: "", width: "", height: "", weightKg: "", location: "", description: "", notes: "", pcTracking: "" };

export const EMPTY_RECEIPT: ReceiptFormValues = {
  warehouse: "Warehouse 2 - Site 1",
  receivedBy: "",
  client: "",
  shipper: "",
  shipperAddress: "",
  consignee: "",
  consigneeAddress: "",
  carrier: "",
  driver: "",
  driverLicense: "",
  supplier: "",
  invoiceNumber: "",
  poNumber: "",
  pickupNumber: "",
  trackingNumber: "",
  proNumber: "",
  htPallet: false,
  palletType: "",
  dangerousGood: "",
  sealedDrum: "",
  notes: "",
  pickupRequestId: "",
  lines: [{ ...EMPTY_RECEIPT_LINE }],
};
