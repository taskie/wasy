gulp = require 'gulp'
jade = require 'gulp-jade'
config = require '../config'

gulp.task 'jade', ->
    gulp
    .src config.jade.src
    .pipe jade(config.jade.options)
    .pipe gulp.dest(config.jade.dest)
