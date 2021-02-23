const s3 = require("../lib/s3");
const sites = require("../data/sites.json");
const https = require("https");

const siteName = "Hannaford";
const site = sites[siteName];
const noAppointmentMatchString = "no locations with available appointments";

module.exports = async function GetAvailableAppointments(browser) {
    console.log(`${siteName} starting.`);
    const webData = await ScrapeWebsiteData(browser);
    console.log(`${siteName} done.`);
    return site.locations.map((loc) => {
        const newLoc = { ...loc };
        const response = webData[loc.zip];
        return {
            name: `${siteName} (${loc.city})`,
            hasAvailability: response.indexOf(noAppointmentMatchString) == -1,
            extraData: response.length
                ? response.substring(1, response.length - 1)
                : response, //take out extra quotes
            signUpLink: site.website,
            ...loc,
            timestamp: new Date(),
        };
    });
};

async function ScrapeWebsiteData(browser) {
    const page = await browser.newPage();
    const results = [];
    for (let [i, loc] of site.locations.entries()) {
        await page.goto(site.website);
        await page.solveRecaptchas().then(({ solved }) => {
            if (solved.length) {
                return page.waitForNavigation();
            } else {
                return;
            }
        });

        //if (!results[i]) {
        await page.evaluate(
            () => (document.getElementById("zip-input").value = "")
        );
        await page.type("#zip-input", loc.zip);
        const [searchResponse, ...rest] = await Promise.all([
            Promise.race([
                page.waitForResponse(
                    "https://hannafordsched.rxtouch.com/rbssched/program/covid19/Patient/CheckZipCode"
                ),
                page.waitForNavigation(),
            ]),
            page.click("#btnGo"),
        ]);

        let result = "";
        try {
            result = (await searchResponse.buffer()).toString();
            //console.log("got data back " + result);
        } catch (e) {
            //console.log("buffer failed, probably because the page changed during the 'waitForResponse'");
        }

        //await page.setRequestInterception(true);

        //if there's something available, log it with a unique name so we can check it out l8r g8r
        if (result.indexOf(noAppointmentMatchString) == -1) {
            console.log("didn't find no appointments string");

            const pageUrl = await page.url();
            if (!process.env.DEVELOPMENT) {
                await s3.savePageContent(`${siteName}-${loc.zip}`, page);
            }

            if (pageUrl.includes("Schedule")) {
                //
                const url =
                    "https://hannafordsched.rxtouch.com/rbssched/program/covid19/Calendar/PatientCalendar";

                const postData = ``;
                const cookies = await page.cookies();

                await page.waitForSelector("#address:not(:empty)");
                // the same facility could be returned for multiple zips
                // if the same facility is returned we don't need to get the same schedule data again

                //const handle = await page.evaluateHandle(() => ({window, document}));
                let facilityId = await page.evaluate(
                    () => window.$.calendar.facilityId
                );
                let address = await page.evaluate(() =>
                    window.$("#address").html().trim()
                );

                console.log(address.trim());
                if (address == loc.street) {
                    result = " appointments found ";
                } else {
                    result = noAppointmentMatchString;
                }
            }
        }

        results[i] = result;

        //} // end if results
    }

    return results;
}
