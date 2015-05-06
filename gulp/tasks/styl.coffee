gulp = require 'gulp'
gulpif = require 'gulp-if'
plumber = require 'gulp-plumber'
stylus = require 'gulp-stylus'
concat = require 'gulp-concat'
autoprefixer = require 'gulp-autoprefixer'
minify = require 'gulp-minify-css'
sourcemaps = require 'gulp-sourcemaps'
config = require '../config'

gulp.task 'styl', ->
    gulp
    .src config.styl.src
    .pipe plumber()
    .pipe sourcemaps.init()
    .pipe stylus()
    .pipe concat(config.styl.output)
    .pipe autoprefixer(config.styl.autoprefixer)
    .pipe gulpif(config.styl.minify, minify())
    .pipe sourcemaps.write('.')
    .pipe gulp.dest(config.styl.dest)
