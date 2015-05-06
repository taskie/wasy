gulp = require 'gulp'
typescript = require 'gulp-typescript'
plumber = require 'gulp-plumber'
sourcemaps = require 'gulp-sourcemaps'
config = require '../config'

gulp.task 'ts', ->
    gulp
    .src config.ts.src
    .pipe plumber()
    .pipe sourcemaps.init()
    .pipe typescript(config.ts.options)
    .js
    .pipe sourcemaps.write('.')
    .pipe gulp.dest(config.ts.dest)
