import { S3Client, PutObjectCommand, PutObjectCommandInput, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import constants from "./constants";
import path from "path";
import fs from "fs";

export enum JobStatus {
    ingesting = 'ingesting',
    failed = 'failed',
    complete = 'complete'
}

export interface CataglogJobResponse {
    id: number;
    status: JobStatus;
    assets: string[] | undefined;
}

export interface ProductJobResponse extends CataglogJobResponse {
    input_id: number;
}

export interface UploadedFile {
    bucketName: string;
    fileName: string;
    eTag: string;
}

export async function uploadToS3(bucket: string, fileName: string, contents: string): Promise<UploadedFile> {
    const client = new S3Client({
        region: constants.region
    });

    const pubObjectParams = {
        Bucket: bucket,
        Key: fileName,
        Body: contents,
      } as PutObjectCommandInput;

      try {
        const data = await client.send(new PutObjectCommand(pubObjectParams))
        return {
            bucketName: pubObjectParams.Bucket as string,
            fileName: fileName,
            eTag: data.ETag as string
        }
      } catch (error) {
        throw new Error(`Encountered an error uploading file to S3`);
      }
}

export async function uploadToS3FromFile(bucket: string, filePath: string): Promise<UploadedFile> {
    const fileStream = fs.createReadStream(filePath);
    const fileName = `${Date.now()}-${path.basename(filePath)}`;// Just to make it unique every time
    const client = new S3Client({
        region: constants.region
    });

    const pubObjectParams = {
        Bucket: bucket,
        Key: fileName,
        Body: fileStream,
      } as PutObjectCommandInput;

      try {
        const data = await client.send(new PutObjectCommand(pubObjectParams))
        return {
            bucketName: pubObjectParams.Bucket as string,
            fileName: fileName,
            eTag: data.ETag as string
        }
      } catch (error) {
        throw new Error(`Encountered an error uploading file to S3`);
      }
}

export async function checkIfTestDataFileExists(bucket: string, fileName:string): Promise<boolean> {
    const client = new S3Client({
        region: constants.region
    });

    const headObjectCommand = {
        Bucket: bucket,
        Key: fileName
    }

    try {
        const data = await client.send(new HeadObjectCommand(headObjectCommand))
        if (data.ETag !== undefined) {
            return true;
        }

        return false;
    } catch (error: any) {
        if (error.$response.statusCode === 404) {
            return false
        }
        throw new Error(`Encountered an error checking file in S3`);
    }
}

export async function getObject(bucket: string, fileName:string): Promise<string> {
    const client = new S3Client({
        region: constants.region
    });

    const getObjectCommand = {
        Bucket: bucket,
        Key: fileName
    }

    try {
        const data = await client.send(new GetObjectCommand(getObjectCommand))
        const contents = await streamToString(data.Body);
        return contents;
    } catch (error) {
        throw new Error(`Encountered an error geting file from S3`);
    }
}

const streamToString = (stream: any ): Promise<string> =>
      new Promise((resolve, reject) => {
        const chunks:any[] = [];
        stream.on("data", (chunk: any) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      });