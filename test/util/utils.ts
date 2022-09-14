import path from "path";
import fs from 'fs';
import axios from "axios";

export function generateTestDataFileName(){
    const now = new Date();
    return `${now.toISOString().split('T')[0]}.json`;
}

export async function downloadFile(fileUrl: string, directory: string) {
    checkOrCreateDirectory(directory);
    const fileName = path.basename(fileUrl);
    const writeStream = fs.createWriteStream(`${directory}\\${fileName}`);
    const response = await axios.get(fileUrl, {
        responseType: 'stream'
    });
    response.data.pipe(writeStream)
    writeStream.on('close', () => {return;})
}

export function checkOrCreateDirectory(directory:string) {
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory);
    }
}

export function checkFile(filePath: string) {
    const result = fs.existsSync(filePath)
    return result;
}

export function catelogIdToProductId(id: number) {
    return Number(`5${id.toString()}`);
}