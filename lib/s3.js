const file = require("./file");
const AWS = require("aws-sdk");
const moment = require("moment");

/**
 * Init AWS s3 sdk
 * @returns {AWS.s3}
 */

function init() {
    return new AWS.S3({
        accessKeyId: process.env.AWSACCESSKEYID,
        secretAccessKey: process.env.AWSSECRETACCESSKEY,
    });
}

/**
 * Upload a file to s3. The bucketPath is an
 * absolute path with a trailing slash ex. debug/
 * @param {string} bucketPath
 * @param {string} localFileName
 * @param {string} remoteFileName (optional)
 * @returns {object} s3.upload response data
 */

async function uploadFile(bucketPath, fileName) {
    if (!bucketPath) {
        console.log("Missing bucketPath");
        return;
    }
    if (!fileName) {
        console.log("Missing Local fileName");
        return;
    }

    const s3 = init();
    let s3Key;

    if (bucketPath === "/") {
        s3Key = `${fileName}`;
    } else {
        s3Key = `${bucketPath}${fileName}`;
    }
    // s3.upload can read in the file but it might be useful at some point to have a global (file.read)
    const fileContents = file.read(fileName);
    const params = {
        Bucket: process.env.AWSS3BUCKETNAME,
        Key: s3Key,
        Body: fileContents,
    };

    if (!process.env.DEVELOPMENT) {
        const uploadResponse = await new Promise((resolve, reject) => {
            s3.upload(params, function (err, data) {
                if (err) {
                    reject(err);
                }
                console.log(`File uploaded successfully. ${data.Location}`);
                resolve(data);
            });
        });

        return uploadResponse;
    }
    return fileName;
}

/**
 * getTimestampForFile
 * We remove the colons for filesystem integrity.
 * @returns {string}
 */

function getTimestampForFile() {
    return moment().utc().format("YYYY-MM-DDTHHmmss[Z]");
}

/**
 * savePageContent saves the page content and screenshot
 * to a directory on s3.
 * @param {string} siteName eg. Lowell General
 * @param {object} page - puppeteer browser page
 * @returns {object} with htmlFileName , screenshotFileName
 */

async function savePageContent(siteName, page) {
    // It appears puppeteer does not have a generic page.waitForNetworkIdle
    // so for now we just assume all XHR requests will complete within
    // a reasonable timeframe, for now 10s.
    siteName = siteName.replace(/ /g, "-");
    await page.waitForTimeout(10000);
    const html = await page.content();
    const timestamp = getTimestampForFile();
    const htmlFileName = `${siteName}-${timestamp}.html`;
    const screenshotFileName = `${siteName}-${timestamp}.png`;
    await page.screenshot({ path: screenshotFileName });
    file.write(htmlFileName, html);
    const s3Dir = "debug/";
    await uploadFile(s3Dir, htmlFileName);
    await uploadFile(s3Dir, screenshotFileName);
    return { htmlFileName, screenshotFileName };
}

/**
 * saveWebData stores the scraped data to s3
 * @param {string} webData
 * @returns {object} s3.upload response data
 */

async function saveWebData(webData) {
    const timestamp = getTimestampForFile();
    const webDataFileName = `data.json`;
    const webDataFileName2 = `data-${timestamp}.json`;
    file.write(webDataFileName, webData);
    file.write(webDataFileName2, webData);
    const s3Dir = "/";
    const upload = await uploadFile(s3Dir, webDataFileName);
    const upload2 = await uploadFile(s3Dir, webDataFileName2);
    return { upload, upload2 };
}

/**
 * List a directory in a bucket
 *
 * usage: directoryList(process.env.AWSS3BUCKETNAME, 'debug/', 20)
 *
 * @param {string} bucketName
 * @param {string} path
 * @param {int} maxKeys - ideally greater than zero to get results
 * @returns {object} the bucket keys found
 */

async function directoryList(bucketName, path, maxKeys) {
    const s3 = init();
    const listDirectories = new Promise((resolve, reject) => {
        let Prefix = path;
        const params = {
            Bucket: bucketName, // process.env.AWSS3BUCKETNAME
            MaxKeys: maxKeys,
            Delimiter: path,
            Prefix,
        };
        s3.listObjectsV2(params, (err, data) => {
            if (err) reject(err);
            resolve(data);
        });
    });
    const keys = await listDirectories;
    console.log(keys);
    return keys;
}

module.exports = {
    init,
    uploadFile,
    getTimestampForFile,
    savePageContent,
    saveWebData,
    directoryList,
};
