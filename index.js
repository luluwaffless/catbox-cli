#!/usr/bin/env node

// catbox-cli by luluwaffless
import { readFileSync, writeFileSync, statSync, createReadStream } from "node:fs";
import { basename, normalize } from "node:path";
import FormData from "form-data";
import got from "got";
import { createInterface } from "node:readline/promises";

// option parser
const rl = createInterface({ input: process.stdin, output: process.stdout });
const options = { help: false, userhash: null, time: null, filePath: null };
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
        } else if (!arg.startsWith('--')) {
            options.filePath = arg;
        };
    };
};
const argFlags = [options.help, options.userhash, options.time].filter(Boolean);
if (argFlags.length > 1) {
    console.error("Only one option (--help, --userhash, or --time) can be used at a time.");
    process.exit(1);
};

// code begin
(async () => {
    const defaultHash = readFileSync(".userhash", "utf8");
    const validTimes = ['1h', '12h', '24h', '72h'];
    if (options.help) { // help message
        console.log(`Usage: catbox ./path/to/file [OPTION]
Uploads the file permanently to Catbox and returns the URL. (200MB file size limit)
Options:
    --help: Shows this message.
    --userhash <hash>: Uses a specific userhash for Catbox.
    --time <time>: Uploads the file temporarily to Litterbox, valid time options are "${validTimes.join('", "')}". (1GB file size limit)`);
        process.exit(0);
    } else if (options.filePath) { // file upload
        const filePath = normalize(options.filePath);
        let stats;
        try {
            stats = statSync(filePath);
        } catch (err) {
            if (err.code === 'ENOENT') {
                console.error('File does not exist.');
                process.exit(1);
            } else {
                console.error('Error checking file:', err);
                process.exit(1);
            };
        };
        if (options.time) { // litterbox
            if (validTimes.includes(options.time)) {
                try { // uploading
                    if (stats.size > 1073741824) {
                        console.error("ERROR: File size exceeds the 1GB limit for Litterbox. You will need to use another service.");
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
                        process.stdout.write(`\rUploading "${fileName}" to Litterbox for ${options.time}... (${((uploaded / totalLength) * 100).toFixed(2)}%)`);
                    });
                    const response = await got.post("https://litterbox.catbox.moe/resources/internals/api.php", {
                        body: form,
                        headers: form.getHeaders(),
                    }).text();
                    console.log(`\nUploaded "${fileName}" successfully! URL: ${response}`);
                    process.exit(0);
                } catch (err) {
                    console.error("\nError uploading file:", err);
                    process.exit(1);
                }
            } else {
                console.error(`ERROR: Invalid time option. Use --help for usage example.`);
                process.exit(1);
            };
        } else { // catbox
            const userhash = options.userhash || defaultHash; // use the userhash from the command line or the default one
            if (userhash && options.userhash && !defaultHash) { // prompt to save userhash if not already saved
                const saveHash = await rl.question(`No default userhash. Would you like to set the inputted userhash "${userhash}" as default for future uploads? (y/n) `);
                if (saveHash.toLowerCase().startsWith("y")) {
                    writeFileSync(".userhash", userhash, "utf8");
                    console.log(`Userhash "${userhash}" saved as default.`);
                } else console.log(`Userhash "${userhash}" not saved.`);
            } else if (!userhash) { // prompt to upload anonymously or cancel
                const uploadAnyways = await rl.question(`No userhash inputted. Would you like to upload anyways? (y/n) `);
                if (uploadAnyways.toLowerCase().startsWith("y")) {
                    console.log(`Uploading anonymously.`);
                } else {
                    console.log(`Upload cancelled. You may set a default userhash by uploading again using --userhash followed by your userhash.`);
                    process.exit(0);
                };
            };

            try { // uploading
                if (stats.size > 209715200) {
                    console.error("ERROR: File size exceeds the 200MB limit for Catbox. Try using Litterbox instead (although temporary), check --help for details.");
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
                    process.stdout.write(`\rUploading "${fileName}" to Catbox... (${((uploaded / totalLength) * 100).toFixed(2)}%)`);
                });
                const response = await got.post("https://catbox.moe/user/api.php", {
                    body: form,
                    headers: form.getHeaders(),
                }).text();
                console.log(`\nUploaded "${fileName}" successfully! URL: ${response}`);
                process.exit(0);
            } catch (err) {
                console.error("\nError uploading file:", err);
                process.exit(1);
            };
        };
    } else {
        console.error(`ERROR: No file path specified. Use --help for usage example.`);
        process.exit(1);
    };
})();