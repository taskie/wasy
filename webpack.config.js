const webpack = require("webpack");

module.exports = {
    entry: {
        wasy: "./src/lib.ts",
    },
    target: "node",
    output: {
        filename: "./build/[name].js"
    },
    devtool: "source-map",
    resolve: {
        extensions: [".ts", ".js"]
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: [
                    {loader: "ts-loader"}
                ]
            }
        ]
    }
};
