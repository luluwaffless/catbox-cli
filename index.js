#!/usr/bin/env node

// catbox-cli by luluwaffless
import { readFileSync, writeFileSync, statSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline/promises";
import { basename, normalize } from "node:path";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import FormData from "form-data";
import chalk from "chalk";
import got from "got";

// option parser
const rl = createInterface({ input: process.stdin, output: process.stdout });
const options = { help: false, anon: false, userhash: null, time: null, filePath: null };
const args = process.argv.slice(2);
if (args.includes('--help')) {
    options.help = true;
} else {
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--userhash') {
            options.userhash = args[i + 1];
            i++;
        } else if (arg === '--time') {
            options.time = args[i + 1];
            i++;
        } else if (arg === '--anon') {
            options.anon = true;
        } else if (!arg.startsWith('--')) {
            options.filePath = arg;
        };
    };
};
const argFlags = [options.help, options.userhash, options.time].filter(Boolean);
if (argFlags.length > 1) {
    console.error("Only one option (--help, --anon, --userhash, or --time) can be used at a time.");
    process.exit(1);
};

// colors
const blue = chalk.hex("#333EBD");
const lightBlue = chalk.hex("#5BCEFA");
const purple = chalk.hex("#BE18D6");
const pink = chalk.hex("#FF75A2");
const lightPink = chalk.hex("#F5A9B8");

// code begin
(async () => {
    // userhash file
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const userhashPath = join(__dirname, ".userhash");
    let defaultHash;
    try {
        defaultHash = readFileSync(userhashPath, "utf8");
    } catch (err) {
        if (err.code === 'ENOENT') {
            writeFileSync(userhashPath, "", "utf8");
        } else {
            console.error(purple("Error reading userhash file:"), err);
            process.exit(1);
        };
    };
    
    const validTimes = ['1h', '12h', '24h', '72h'];
    if (options.help) { // help message
        console.log(`${lightBlue("Usage:")} ${lightPink("catbox")} ./path/to/file ${blue("[OPTION]")}
${pink("Uploads the file to Catbox and returns the URL.")}
${lightPink("Options:")}
    --help: ${pink("Show usage information.")}
    --anon: ${pink("Upload anonymously (no userhash).")}
    --userhash ${purple("<hash>")}: ${pink("Use a specific Catbox userhash for uploads (prompts to save as default if not set). If used without a file, saves the userhash as default.")}
    --time ${purple("<time>")}: ${pink(`Upload to Litterbox (temporary), valid times: "${validTimes.join('", "')}".`)}`);
        process.exit(0);
    } else if (options.userhash && !options.filePath) {
        writeFileSync(".userhash", options.userhash, "utf8");
        console.log(purple(`Userhash "${options.userhash}" saved as default.`));
        process.exit(0);
    } else if (options.filePath) { // file upload
        const filePath = normalize(options.filePath);
        let stats;
        try {
            stats = statSync(filePath);
        } catch (err) {
            if (err.code === 'ENOENT') {
                console.error(purple('File does not exist.'));
                process.exit(1);
            } else {
                console.error(purple('Error checking file:'), err);
                process.exit(1);
            };
        };
        if (options.time) { // litterbox
            if (validTimes.includes(options.time)) {
                try { // uploading
                    if (stats.size > 1073741824) {
                        console.error(purple("ERROR: File size exceeds the 1GB limit for Litterbox. You will need to use another service."));
                        process.exit(1);
                    };

                    const fileName = basename(filePath);
                    const form = new FormData();
                    form.append("reqtype", "fileupload");
                    form.append("time", options.time);
                    form.append("fileToUpload", createReadStream(filePath), fileName);
                    const totalLength = await new Promise((resolve, reject) => {
                        form.getLength((err, length) => {
                            if (err) reject(err);
                            else resolve(length);
                        });
                    });
                    let uploaded = 0;
                    form.on("data", chunk => {
                        uploaded += chunk.length;
                        process.stdout.write(`\rUploading ${pink(`"${fileName}"`)} to ${lightBlue("Litterbox")} for ${options.time}... ${purple(`(${((uploaded / totalLength) * 100).toFixed(2)}%)`)}`);
                    });
                    const response = await got.post("https://litterbox.catbox.moe/resources/internals/api.php", {
                        body: form,
                        headers: form.getHeaders(),
                    }).text();
                    console.log(`\nUploaded ${pink(`"${fileName}"`)} successfully! URL: ${blue(response)}`);
                    process.exit(0);
                } catch (err) {
                    console.error(purple("\nError uploading file:"), err);
                    process.exit(1);
                }
            } else {
                console.error(purple(`ERROR: Invalid time option. Use --help for usage example.`));
                process.exit(1);
            };
        } else { // catbox
            const userhash = options.anon ? "" : (options.userhash || defaultHash); // use the userhash from the command line or the default one
            if (userhash && options.userhash && !defaultHash) { // prompt to save userhash if not already saved
                const saveHash = await rl.question(purple(`No default userhash. Would you like to set the inputted userhash "${userhash}" as default for future uploads? (y/n) `));
                if (saveHash.toLowerCase().startsWith("y")) {
                    writeFileSync(".userhash", userhash, "utf8");
                    console.log(purple(`Userhash "${userhash}" saved as default.`));
                } else console.log(purple(`Userhash "${userhash}" not saved.`));
            } else if (!userhash && !options.anon) { // prompt to upload anonymously or cancel
                const uploadAnyways = await rl.question(purple(`No userhash inputted. Would you like to upload anyways? (y/n) `));
                if (uploadAnyways.toLowerCase().startsWith("y")) {
                    console.log(purple(`Uploading anonymously.`));
                } else {
                    console.log(purple(`Upload cancelled. You may set a default userhash by uploading again using --userhash followed by your userhash.`));
                    process.exit(0);
                };
            } else if (options.anon) console.log(purple(`Uploading anonymously.`));

            try { // uploading
                if (stats.size > 209715200) {
                    console.error(purple("ERROR: File size exceeds the 200MB limit for Catbox. Try using Litterbox instead (although temporary), check --help for details."));
                    process.exit(1);
                };
                const fileName = basename(filePath);
                const form = new FormData();
                form.append("reqtype", "fileupload");
                form.append("fileToUpload", createReadStream(filePath), fileName);
                if (userhash) form.append("userhash", userhash);
                const totalLength = await new Promise((resolve, reject) => {
                    form.getLength((err, length) => {
                        if (err) reject(err);
                        else resolve(length);
                    });
                });
                let uploaded = 0;
                form.on("data", chunk => {
                    uploaded += chunk.length;
                    process.stdout.write(`\rUploading ${pink(`"${fileName}"`)} to ${lightPink("Catbox")}... ${purple(`(${((uploaded / totalLength) * 100).toFixed(2)}%)`)}`);
                });
                const response = await got.post("https://catbox.moe/user/api.php", {
                    body: form,
                    headers: form.getHeaders(),
                }).text();
                console.log(`\nUploaded ${pink(`"${fileName}"`)} successfully! URL: ${blue(response)}`);
                process.exit(0);
            } catch (err) {
                console.error(purple("\nError uploading file:"), err);
                process.exit(1);
            };
        };
    } else {
        console.error(purple(`ERROR: No file path specified. Use --help for usage example.`));
        process.exit(1);
    };
})();