gulp = require 'gulp'
config = require '../config'

gulp.task 'html', ->
    gulp
    .src config.html.src
    .pipe gulp.dest(config.html.dest)
