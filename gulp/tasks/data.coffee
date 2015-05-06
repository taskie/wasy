gulp = require 'gulp'
config = require '../config'

gulp.task 'data', ->
    gulp
    .src config.data.src
    .pipe gulp.dest(config.data.dest)
