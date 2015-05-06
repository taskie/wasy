gulp = require 'gulp'
del = require 'del'
config = require '../config'

gulp.task 'clobber', (cb) ->
    del config.clobber.src, cb
