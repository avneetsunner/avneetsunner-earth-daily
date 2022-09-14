import axios from "axios";
import { expect } from "chai";
import { CataglogJobResponse, checkIfTestDataFileExists, getObject, JobStatus, ProductJobResponse, uploadToS3FromFile } from "../../src";
import constants from "../../src/constants";
import { TestData } from "../util/models";
import { sleep } from "../util/sleep";
import { catelogIdToProductId, checkFile, downloadFile, generateTestDataFileName } from "../util/utils";
import fs from 'fs';
import path from "path";

describe('Catalog and Product Processor Jobs', async function () {
    const fileToUpload = './grumpycat.jpg';
    const baseUrl = 'https://6306707cdde73c0f845aa718.mockapi.io'
    const threeMinutesInMS = 180000;

    after(async function () {
        // Clean up step here to delete the file
    })

    it('should have the correct field when compledted', async function () {
        const testDataFileName = generateTestDataFileName();
        const testDataFileStatus = await checkIfTestDataFileExists(constants.testDataBucketName, testDataFileName);

        if (!testDataFileStatus) {
            throw new Error('No set up was run');
        }

        const testData: TestData = JSON.parse(await getObject(constants.testDataBucketName, testDataFileName));

        const catalogJobsResponse = await axios.get(`${baseUrl}/input`);

        if (catalogJobsResponse.status !== 200) {
            throw new Error('Failed to get a catalog job status');
        }

        const catalogJobs = catalogJobsResponse.data as CataglogJobResponse[];
        const catalogJob = catalogJobs.find(x => x.id === testData.id);
        

        if (catalogJob === undefined) {
            throw new Error('Catalog job in test data does not exist');
        }

        const productJobsResponse = await axios.get(`${baseUrl}/product`);
        if (productJobsResponse.status !== 200) {
            throw new Error('Failed to get a product job status');
        }

        const productJobs = productJobsResponse.data as ProductJobResponse[];
        const productJob = productJobs.find(x => x.input_id === catelogIdToProductId(testData.id));

        if (productJob === undefined) {
            throw new Error('Product job in test data does not exist');
        }

        expect(catalogJob).not.to.be.undefined;
        expect(catalogJob.status).to.be.equal(JobStatus.complete)
        expect(catalogJob.assets).not.to.be.empty;

        expect(productJob).not.to.be.undefined;
        expect(productJob.status).to.be.equal(JobStatus.complete)
        expect(productJob.assets).not.to.be.empty;

        //TS does not recognize that the above assertions are nullity checks
        if(catalogJob.assets === undefined || productJob.assets === undefined) {
            throw new Error('Catalog Job or product job assets are undefined');
        }

        //Download Files
        const testDirectoryArtifactsCatalog = `${constants.artifacts}/${Date.now()}-Catalog`;
        for (const fileUrl of catalogJob.assets as string[]) {
            await downloadFile(fileUrl, testDirectoryArtifactsCatalog);
            const fileName = path.basename(fileUrl);
            expect(checkFile(`${testDirectoryArtifactsCatalog}/${fileName}`)).to.be.true;
        }

        const testDirectoryArtifactsProduct = `${constants.artifacts}/${Date.now()}-Product`;
        for (const fileUrl of productJob.assets as string[]) {
            await downloadFile(fileUrl, testDirectoryArtifactsProduct);
            const fileName = path.basename(fileUrl);
            expect(checkFile(`${testDirectoryArtifactsProduct}/${fileName}`)).to.be.true;
        }
    })

/*
Test Cases:
For Production Testing:
    The above test is suficient for production testing. We don't want to overload it with too many test cases. This will effect performance of production.
    One main point of production testing is making sure every individual components of the system are connected properly. 
    Assuming that the above test case covers that, then there is no need to write multiple tests.
    One exception to the above point, is if a certain permutation behaves completely diffrently and has additional sub components being tartegeted.
    Another helpful way to determine if a test needs to be written is the Risk of the test case. Risk being calculated by the impact (cost) of the issue and
    the likelihood the issue occurring. High likelihood and high impact means high risk and there is value automating it.
For Testing on Non Production testing:
    1. Invalid Job (i.e. Corrupted Data) => Should result to catalog job failure and product job not starting
    2. Catalog Job Suceeds but Product Job Fails => Should the results of the catalog job be updated to failed?
    3. Verification of the assets them selves => Do they meet certain thresholds.
    4. Performance testing being another set of test cases.
    5. Different permutation of data. (i.e. image type: JPG, PNG,....; size of data ; different source ; different processing/output parameters )
*/

    it.skip('should be able to upload file to s3 bucket', async function () {
        const uploadedFileData = await uploadToS3FromFile(constants.bucketName, fileToUpload);
        expect(uploadedFileData.bucketName).not.to.be.empty;
        expect(uploadedFileData.fileName).not.to.be.empty;
        expect(uploadedFileData.eTag).not.to.be.empty;
    })

    // This is a basic test for demo and discussion sake.
    it.skip('Basic e2e tests worklow test', async function () {
        this.timeout(threeMinutesInMS) // This is the test time out. It will fail if  the execution exceeds the specified time.

        //Set up Upload the file
        await uploadToS3FromFile(constants.bucketName, fileToUpload);

        //Start the Cataglog job
        let completedCatalogJob: CataglogJobResponse | undefined;
        let start = Date.now()

        while (completedCatalogJob === undefined && Date.now() - start < threeMinutesInMS) {
            try {
                const catalogJobsResponse = await axios.get(`${baseUrl}/input`);
                if(catalogJobsResponse.status !== 200){
                    continue;
                }

                const catalogJobs = catalogJobsResponse.data as CataglogJobResponse[]
                completedCatalogJob = catalogJobs.find(x => x.status === JobStatus.complete)

                if(completedCatalogJob == undefined) {
                    sleep(10000); // Avoid Hammering the api
                }
            } catch (error) {
                // Axios will throw an error on api failure
                sleep(10000); // Avoid Hammering the api
                continue;
            }
            
        }

        if (completedCatalogJob === undefined) {
            throw new Error('Catalog Job did not'); 
        }

        //Start the product job after catalog job finishes.
        let completedProjectJob: ProductJobResponse | undefined;
        start = Date.now()

        while (completedProjectJob === undefined && Date.now() - start < threeMinutesInMS) {
            try {
                const productJobResponse = await axios.get(`${baseUrl}/product`);
                if (productJobResponse.status !== 200) {
                    continue;
                }

                const productJobs = productJobResponse.data as ProductJobResponse[]
                completedProjectJob = productJobs .find(x => x.status === JobStatus.complete && x.input_id === catelogIdToProductId(completedCatalogJob?.id as number))

                if (completedProjectJob === undefined) {
                    sleep(10000); // Avoid Hammering the api
                }
            } catch (error) {
                // Axios will throw an error on api failure
                sleep(10000); // Avoid Hammering the api
                continue;
            }
        }

        if (completedProjectJob === undefined) {
            throw new Error('Product Job did not'); 
        }

        expect(completedCatalogJob).not.to.be.undefined;
        expect(completedCatalogJob.assets).not.to.be.empty;
        expect(completedCatalogJob.status).to.be.equal(JobStatus.complete)

        expect(completedProjectJob).not.to.be.undefined;
        expect(completedProjectJob.assets).not.to.be.empty;
        expect(completedProjectJob.status).to.be.equal(JobStatus.complete)
    })

    
})
