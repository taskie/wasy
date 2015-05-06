gulp = require 'gulp'
coffee = require 'gulp-coffee'
plumber = require 'gulp-plumber'
sourcemaps = require 'gulp-sourcemaps'
config = require '../config'

gulp.task 'coffee', ->
    gulp
    .src config.coffee.src
    .pipe plumber()
    .pipe sourcemaps.init()
    .pipe coffee()
    .pipe sourcemaps.write('.')
    .pipe gulp.dest(config.coffee.dest)
