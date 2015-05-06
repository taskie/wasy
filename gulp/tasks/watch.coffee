gulp = require 'gulp'
watch = require 'gulp-watch'
config = require '../config'

gulp.task 'watch', ['default'], ->
    for key, source of config.watch
        watch source, ((k) -> (-> gulp.start [k]))(key)
