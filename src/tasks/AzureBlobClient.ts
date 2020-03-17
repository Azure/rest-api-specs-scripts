// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License in the project root for license information.

import { BlobServiceClient } from "@azure/storage-blob";

export class AzureBlobClient {
  private blobServiceClient: BlobServiceClient;
  constructor(private sasURL: string) {
    this.blobServiceClient = new BlobServiceClient(sasURL);
  }

  public async uploadLocal(
    path: string,
    blobName: string,
    containerName: string,
    createContainer: boolean = false
  ): Promise<boolean> {
    const containerClient = this.blobServiceClient.getContainerClient(
      containerName
    );
    if (createContainer && !(await containerClient.exists())) {
      const resp = await containerClient.create();
      if (resp.errorCode) {
        console.error(`Failed to create container for ${containerName}`);
        return false;
      }
    }

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const resp = await blockBlobClient.uploadFile(path);
    if (resp.errorCode) {
      console.error(`Failed to upload ${path} to container ${containerName}`);
      return false;
    }

    return true;
  }
}

export async function main() {
  const sasURL = process.env["AZURE_BLOB_SAS_URL"] || "";
  if (!sasURL) {
    throw new Error("Please specify AZURE_SAS_URL")
  }
  const wrapper = new AzureBlobClient(sasURL);
  const resp = await wrapper.uploadLocal(
    "../../package.json",
    "hello/package2.json",
    "pipelinelogs",
    false
  );
  console.log(resp);
}

main().catch(err => {
  console.error("Error:", err.message);
});
