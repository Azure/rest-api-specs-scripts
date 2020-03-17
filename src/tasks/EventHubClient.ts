// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License in the project root for license information.

import { EventHubProducerClient, CreateBatchOptions } from "@azure/event-hubs";
import * as fs from "fs";

export class EventHubProducer {
  private producer: EventHubProducerClient;
  constructor(private sasUrl: string) {
    this.producer = new EventHubProducerClient(sasUrl);
  }

  public async send(eventsToSend: string[], partitionKey?: string) {
    console.log(`events to send: ${eventsToSend}`);
    try {
      const batchOptions: CreateBatchOptions = {};
      if (partitionKey) {
        batchOptions.partitionKey = partitionKey;
      }

      let batch = await this.producer.createBatch(batchOptions);
      let numEventsSent = 0;

      let i = 0;
      while (i < eventsToSend.length) {
        const isAdded = batch.tryAdd({ body: eventsToSend[i] });
        if (!isAdded) {
          console.error(`Failed to add ${eventsToSend[i]}`);
        }
        if (isAdded) {
          console.log(`Added eventsToSend[${i}] to the batch`);
          ++i;
          continue;
        }

        if (batch.count === 0) {
          console.log(
            `Message was too large and can't be sent until it's made smaller. Skipping...`
          );
          ++i;
          continue;
        }

        // otherwise this just signals a good spot to send our batch
        console.log(
          `Batch is full - sending ${batch.count} messages as a single batch.`
        );
        await this.producer.sendBatch(batch);
        numEventsSent += batch.count;

        // and create a new one to house the next set of messages
        batch = await this.producer.createBatch(batchOptions);
      }

      // send any remaining messages, if any.
      if (batch.count > 0) {
        console.log(
          `Sending remaining ${batch.count} messages as a single batch.`
        );
        await this.producer.sendBatch(batch);
        numEventsSent += batch.count;
      }

      console.log(`Sent ${numEventsSent} events`);

      if (numEventsSent !== eventsToSend.length) {
        throw new Error(
          `Not all messages were sent (${numEventsSent}/${eventsToSend.length})`
        );
      }
    } catch (err) {
      console.error("Error when creating & sending a batch of events: ", err);
    }
  }

  public async close() {
    await this.producer.close();
  }
}

export async function main(): Promise<void> {
  const connectionString = process.env["EVENTHUB_CONNECTION_STRING"] || "";
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
