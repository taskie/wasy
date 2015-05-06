gulp = require 'gulp'
runSequence = require 'run-sequence'
config = require '../config'

gulp.task 'default', (cb) ->
    sequence = config.default.sequence.concat([cb])
    runSequence(sequence...)
