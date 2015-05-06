gulp = require 'gulp'
webserver = require 'gulp-webserver'
config = require '../config'

gulp.task 'webserver', ->
    gulp
        .src config.webserver.src
        .pipe webserver(config.webserver.options)
