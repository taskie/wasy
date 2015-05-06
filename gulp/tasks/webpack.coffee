gulp = require 'gulp'
webpack = require 'gulp-webpack'
plumber = require 'gulp-plumber'
config = require '../config'

gulp.task 'webpack', ->
    gulp
    .src config.webpack.src
    .pipe plumber()
    .pipe webpack(config.webpack.options)
    .pipe gulp.dest(config.webpack.dest)
