const path = require("path");
const glob = require("glob");

// directory
const cwd = process.cwd();
const src = path.join(cwd, "src");
const dst = path.join(cwd, "build");

// JS
const src_ts = glob.sync(path.join(src, "**", "*.ts"));
const src_js = glob.sync(path.join(src, "**", "*.js"));
const dst_js = [path.join(dst, "wasy.js")];

// generate *.mk
const conf = {
    src: [src],
    dst: [dst],
    src_ts,
    src_js,
    dst_js,
    config_js: ["package.json", "tsconfig.json"].map((s) => path.join(cwd, s)),
};

for (let key in conf) {
    console.log(`${key.toUpperCase()} := ${conf[key].join(" ")}`);
}
