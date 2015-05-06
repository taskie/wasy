dest = './build/'
src = './src/'
tmp = './tmp/'

webpack = require 'webpack'

NDEBUG = false

config =
    dest: dest

    js:
        src: src + 'js/**/!(_)*.js'
        dest: tmp + 'js'

    coffee:
        src: src + 'js/**/!(_)*.coffee'
        dest: tmp + 'js'
    
    ts:
        src: src + 'js/**/!(_)*.ts'
        dest: tmp + 'js'
        options:
            target: "ES6"
            removeComments: true

    html:
        src: src + 'html/**/!(_)*.html'
        dest: dest

    jade:
        src: src + 'html/**/!(_)*.jade'
        dest: dest
        options:
            pretty: true

    styl:
        src: src + 'css/**/!(_)*'
        dest: dest
        output: 'main.css'
        autoprefixer:
            browsers: ['last 2 versions']
        minify: false
    
    data: 
        src: src + 'data/**/!(_)*'
        dest: dest

    webpack:
        src: tmp + 'js/**/!(_)*.js'
        dest: dest
        options:
            entry: tmp + 'js/app.js'
            output:
                filename: 'main.js'
            resolve:
                extensions: ['', '.js']
            devtool: 'source-map'
            module:
                loaders:
                    [
                        test: /\.js$/
                        exclude: /node_modules/
                        loader: 'babel-loader'
                    ]
            plugins:
                [
                    # new webpack.optimize.UglifyJsPlugin()
                ]

    clean:
        src: [tmp]

    clobber:
        src: [tmp, dest]

    webserver:
        src: dest
        livereload: true
        directoryListing: true
        open: true

    default:
        sequence:
            [
                ['js', 'coffee', 'ts', 'html', 'jade', 'styl', 'data']
                ['webpack']
                ['webserver']
            ]

# release mode
if NDEBUG
    config.jade.options.pretty = false
    config.styl.minify = true
    config.webpack.options.plugins.push(new webpack.optimize.UglifyJsPlugin())

config.watch = {}
for keys in config.default.sequence
    for key in keys
        continue if key == 'webserver'
        config.watch[key] = config[key].src

module.exports = config
