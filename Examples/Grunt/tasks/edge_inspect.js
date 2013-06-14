/*
 * edge_inspect
 * 
 *
 * Copyright (c) 2013 Adobe Systems Inc
 * Licensed under the MIT license.
 */
/*jslint node: true */
'use strict';

module.exports = function (grunt) {

    // Please see the Grunt documentation for more information regarding task
    // creation: http://gruntjs.com/creating-tasks
    
    grunt.registerMultiTask('edge_inspect', 'Grunt Task to consume the Edge Inspect JavaScript API.', function () {
        var EdgeInspect   = require('../tasks/lib/edge-inspect-api-1.0.0').EdgeInspect,
            EI                 = new EdgeInspect(),
            LocalStorage        = require('node-localstorage').LocalStorage,
            localStorage        = new LocalStorage('./EdgeInspect'),
            uuid                = localStorage.getItem('uuid'),
            urlCount            = 0,
            done                = this.async(),
            urls                = this.data.urls,
            delay               = this.data.delay;
        
        if (!uuid) {
            uuid = EI.generateUUID();
            localStorage.setItem('uuid', uuid);
        }
        
        function runUrl(index) {
            if (urls[index] !== undefined) {
                grunt.log.writeln("Sending " + urls[index] + " To Edge Inspect");
                EI.sendURL(urls[index]);
                urlCount = index + 1;
                // Give it a few seconds to load before taking the screenshot
                setTimeout(function () { EI.takeScreenshot(true, true); setTimeout(function () { runUrl(urlCount); }, delay); }, delay);
            } else {
                // We've hit the end.  Done now.
                done();
            }
        }

        EI.subscribe(EI.CONNECTED_EVENT, function () {
            // wait half a second before sending the first URL
            grunt.log.writeln("Connected!");
            if (urls.length > 0) {
                grunt.log.writeln("Kicking off the URL chain!");
                setTimeout(function () { runUrl(urlCount); }, 500);
            }
        });
        grunt.log.writeln("Connecting");
        
        EI.connect('Grunt Task', '5591944b-b354-404e-b714-70652e94ef03', '2bcf6b8854e61983b87b7756754ec6a694ce667aa1a2e2181c5d6dd949823d99');
    });

};
