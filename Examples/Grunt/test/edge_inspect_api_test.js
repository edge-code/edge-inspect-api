/*jslint node:true */
/*global exports, INSPECT */

'use strict';

var grunt               = require('grunt');

/*
  ======== A Handy Little Nodeunit Reference ========
  https://github.com/caolan/nodeunit

  Test methods:
    test.expect(numAssertions)
    test.done()
  Test assertions:
    test.ok(value, [message])
    test.equal(actual, expected, [message])
    test.notEqual(actual, expected, [message])
    test.deepEqual(actual, expected, [message])
    test.notDeepEqual(actual, expected, [message])
    test.strictEqual(actual, expected, [message])
    test.notStrictEqual(actual, expected, [message])
    test.throws(block, [error], [message])
    test.doesNotThrow(block, [error], [message])
    test.ifError(value)
*/

exports.edge_inspect = {
    setUp: function (done) {
        // setup here if necessary
        done();
    },
    run_urls: function (test) {
        test.expect(1);
        
        var EdgeInspect   = require('../tasks/lib/edge-inspect-api-1.0.0').EdgeInspect,
            EI                 = new EdgeInspect(),
            LocalStorage        = require('node-localstorage').LocalStorage,
            localStorage        = new LocalStorage('./EdgeInspect'),
            actual              = false,
            uuid                = localStorage.getItem('uuid'),
            expected            = true;

        if (!uuid) {
            uuid = EI.generateUUID();
            localStorage.setItem('uuid', uuid);
        }

        EI.subscribe(EI.CONNECTED_EVENT, function () {
            grunt.log.writeln('Connect Subscribed, Sending URL');
            EI.sendURL("http://bostonglobe.com");
            grunt.log.writeln('Sent URL, Sending URL');
            setTimeout(function () {EI.takeScreenshot(true, true); }, 5000);
        });
        EI.subscribe(EI.SCREENSHOTS_COMPLETE_EVENT, function () {
            actual = true;
            EI.disconnect();
            test.equal(actual, expected, 'should have taken and transferred some screenshots');
            test.done();
        });
        EI.connect('Grunt Task', '5591944b-b354-404e-b714-70652e94ef03', '2bcf6b8854e61983b87b7756754ec6a694ce667aa1a2e2181c5d6dd949823d99');
    }
};