import { EventHubProducer } from './EventHubClient';
import { AzureBlobClient } from './AzureBlobClient';
import * as fs from "fs";

type Stage = "Queued" | "InProgress" | "Completed"

export async function main(): Promise<void> {
  const connectionString = process.env["EVENTHUB_CONNECTION_STRING"] || "";
  const pipelineRunId = process.env["PIPELINE_RUN_ID"] || "",
  const producer = new EventHubProducer(connectionString);

  console.log("Creating and sending events...");
  let jsonData = "";
  let summaryPath = "../../package-lock.json";
  try {
    jsonData = fs.readFileSync(summaryPath, "utf8");
    // const j: ValidationSummary = JSON.parse(jsonData);
    // j.logPath = logTargetName;
    // jsonData = JSON.stringify(j);
    console.log(jsonData);
  } catch (e) {
    console.log(
      `Failed to read summary results from file ${summaryPath}: ${e}`
    );
    process.exit(1);
  }

  await producer.send([jsonData]);
  await producer.close();
}

main().catch(error => {
  console.error("Error:", error);
});
