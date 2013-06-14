/*
 * edge-inspect
 *
 * Copyright (c) 2013 Adobe Systems Inc
 * Licensed under the MIT license.
 */

/*jslint node:true */
/*global module */


module.exports = function (grunt) {
    'use strict';

  // Project configuration.
    grunt.initConfig({
        jshint: {
            all: [
                'Gruntfile.js',
                'tasks/*.js',
                '<%= nodeunit.tests %>'
            ],
            options: {
                jshintrc: '.jshintrc'
            }
        },

    // Before generating any new files, remove any previously-created files.
        clean: {
            tests: ['tmp']
        },

    // Configuration to be run (and then tested).
        edge_inspect: {
            default_options: {
                delay: 5000,
                urls: ['http://html.adobe.com', 'http://adobe.com', 'http://html.adobe.com/edge/inspect' ]
            }
        },

        // Unit tests.
        nodeunit: {
            tests: ['test/*_test.js']
        }
    });

    // Actually load this plugin's task(s).
    grunt.loadTasks('tasks');
    
    // These plugins provide necessary tasks.
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-contrib-nodeunit');
    
    // Whenever the "test" task is run, first clean the "tmp" dir, then run this
    // plugin's task(s), then test the result.
    grunt.registerTask('test', ['clean', 'edge_inspect', 'nodeunit']);
    
    // By default, lint and run all tests.
    grunt.registerTask('default', ['jshint', 'test']);
    
};
