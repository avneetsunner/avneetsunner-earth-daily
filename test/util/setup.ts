// This script will be put on the jenkins pipeline/git hub action with a cron timer
// Assuming test needs to run once a day only.

import axios from "axios";
import { CataglogJobResponse, checkIfTestDataFileExists, getObject, JobStatus, ProductJobResponse, uploadToS3, uploadToS3FromFile } from "../../src";
import constants from "../../src/constants";
import { catelogIdToProductId, generateTestDataFileName } from "./utils";
import { TestData } from "../util/models";



async function setUpData() {
    // Assuming test is run ones daily. If it is not the case the implementation would have to change to be more complex.
    const testDataFileName = generateTestDataFileName();
    const testDataFileStatus = await checkIfTestDataFileExists(constants.testDataBucketName, testDataFileName);

    const fileToUpload = './grumpycat.jpg';
    const baseUrl = 'https://6306707cdde73c0f845aa718.mockapi.io'

    
    if (!testDataFileStatus) {
        // Test data files does not exist. This means that the job is not scheduled for the day.
        // So this will upload the file and make the api call to start the catalog job.
        await uploadToS3FromFile(constants.bucketName, fileToUpload);
        const catalogJobsResponse = await axios.get(`${baseUrl}/input`);

        if (catalogJobsResponse.status !== 200) {
            throw new Error('Failed to schedule a catalog job');
        }

        const catalogJobs = catalogJobsResponse.data as CataglogJobResponse[];

        // Store the catalog job id to the test data so that the next iteration knows exactly the correct job id to look for.
        const testData: TestData = {
            id: catalogJobs[0].id
        }

        await uploadToS3(constants.testDataBucketName, testDataFileName, JSON.stringify(testData))

        return;
    }

    // Test data exist means that the catalog job was scheduled.
    // The setup first needs to grab the store test id on the test data file.
    // Then it can check if the catalog job is finished or not and make decision based on that.
    const testData: TestData = JSON.parse(await getObject(constants.testDataBucketName, testDataFileName))

    const catalogJobsResponse = await axios.get(`${baseUrl}/input`);

    if (catalogJobsResponse.status !== 200) {
        throw new Error('Failed to get a catalog job status');
    }

    const catalogJobs = catalogJobsResponse.data as CataglogJobResponse[];
    const catalogJob = catalogJobs.find(x => x.id === testData.id);

    if (catalogJob === undefined) {
        throw new Error('Catalog job in test data does not exist');
    }

    // Based on the job status the set up behaves appropriately.
    if (catalogJob?.status === JobStatus.failed) {
        throw new Error('Catalog Job Failed');
    } else if (catalogJob.status === JobStatus.ingesting) {
        // Catalog job is not finsihed, it will now exit and wait for the next iteration to check the status.
        return;
    } else if (catalogJob.status !== JobStatus.complete) {
        throw new Error('Unrecognized catalog job status');
    }

    // At this point the catalog job is finshed we need to check the product job now.
    const productJobsResponse = await axios.get(`${baseUrl}/product`);
    if (productJobsResponse.status !== 200) {
        throw new Error('Failed to get a product job status');
    }

    const productJobs = productJobsResponse.data as ProductJobResponse[];
    const productJob = productJobs.find(x => x.input_id === catelogIdToProductId(testData.id));

    if (productJob === undefined) {
        throw new Error('Product job in test data does not exist');
    }

    // Based on the job status the set up behaves appropriately.
    if (productJob?.status === JobStatus.failed) {
        throw new Error('Product Job Failed');
    } else if(productJob?.status === JobStatus.ingesting) {
        // Product job is not finsihed, it will now exit and wait for the next iteration to check the status.
        return;
    } else if (catalogJob.status !== JobStatus.complete) {
        throw new Error('Unrecognized product job status');
    }

    // At this point both catalog and product jobs have been confirmed to be finished.
    // Now the code can call what ever code that is needed to trigger the test workflow
}

setUpData()
    .then(() => console.log('Set up finished'))
    .catch((error) => {
        console.log('Encountered an error setting up data');
        throw error;
    })

