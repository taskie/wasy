gulp = require 'gulp'
config = require '../config'

gulp.task 'js', ->
    gulp
    .src config.js.src
    .pipe gulp.dest(config.js.dest)
