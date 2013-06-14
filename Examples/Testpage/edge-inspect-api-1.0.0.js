/*************************************************************************

Copyright (c) 20136 Adobe Systems Incorporated. All rights reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

**************************************************************************/

/*jslint node:true, bitwise:true */
/*global localStorage, Crypto, EdgeInspectGlobals:true, Uint8Array, WebSocket, Window */

/*  
    runInBrowserMode:  defaults to false, assuming that you are running this in Node.
        If you are running this in node, it will attempt to require the following libraries for you:
            - ws
            - node-localstorage
            - cryptojs        
        If you are running this in a browser, you will also need to include the third-party Crypto-JS v2.5.3 library
*/

var runInBrowserMode = false;

(function (that) {
    'use strict';
    if (that.window !== undefined) {
        runInBrowserMode = that instanceof Window;
    }
}(this));

EdgeInspectGlobals = {};

EdgeInspectGlobals.StorageManager = function (localStorage) {
    'use strict';
    
    var my = {};

    // localStorage only holds strings.

    my.get = function (key) {
        return localStorage.getItem(key);
    };
    my.put = function (key, value) {
        return localStorage.setItem(key, value);
    };
    my.clear = function (key) {
        return localStorage.removeItem(key);
    };
    my.log = function (message) {
        if (typeof message !== 'string') {
            // Anything but a string gets kicked back
            return false;
        }
        var log,
            unpacked;
        try {
            // Unpack the message, in case we have to scrub data
            unpacked = JSON.parse(message);
        } catch (ex) {
            // Can't parse the JSON, it's an error;
            return false;
        }
        if (unpacked.payload && unpacked.payload.action === "publish") {
            unpacked.payload.options.message.options.url = "***scrubbed***";
            message = JSON.stringify(unpacked);
        } else if (unpacked.payload && unpacked.payload.options.rand) {
            delete unpacked.payload.options.rand;
            message = JSON.stringify(unpacked);
        }
        log = my.get("log");
        if (log === null) {
            // This is an empty object
            log = [];
        } else {
            log = JSON.parse(log);
        }
        if (log.length > 1000) {
            log.shift();
        }
        log.push(message);
        my.put("log", JSON.stringify(log));
        return JSON.stringify(log);
    };
    my.destroySavedSettings = function () {
        var i;
        for (i = 0; i < localStorage.length; i += 1) {
            localStorage.removeItem(localStorage.key(i));
        }
    };
    return my;
};

EdgeInspectGlobals.CryptoHandler = function (Crypto) {
    'use strict';
    
    var my = {},
        salt,
        passcode,
        keyAsBytes,
        keyAsHex,
        challenge;
    
    function calculateKey(asBytes) {
        if (typeof asBytes === 'undefined') {
            asBytes = false;
        }
        var result = Crypto.PBKDF2(passcode, salt, 32, { iterations: 1000, asBytes: asBytes});
        return result;
    }

    function encryptAsBytes(plaintext) {
        return Crypto.util.base64ToBytes(Crypto.AES.encrypt(plaintext, keyAsBytes, { mode: new Crypto.mode.CBC(Crypto.pad.pkcs7) }));
    }
    
    function encryptAsHex(plaintext) {
        return Crypto.util.bytesToHex(encryptAsBytes(plaintext));
    }
    
    function decryptAsBytes(encrypted) {
        return (Crypto.AES.decrypt(Crypto.util.bytesToBase64(encrypted), keyAsBytes, { mode: new Crypto.mode.CBC(Crypto.pad.pkcs7), asBytes: true }));
    }

    function decryptAsHex(encrypted) {
        return decryptAsBytes(Crypto.util.hexToBytes(encrypted));
    }
    
    my.verify = function () {
        try {
            if (Crypto.MD5('test') === '098f6bcd4621d373cade4e832627b4f6') {
                return true;
            } else {
                return false;
            }
        } catch (ex) {
            return false;
        }
    };
    
    my.configure = function (parameters) {
        if (parameters.encryptionkey) {
            challenge = my.getRandomString();
            keyAsHex = parameters.encryptionkey;
            keyAsBytes = Crypto.util.hexToBytes(parameters.encryptionkey);
        } else {
            salt = parameters.salt;
            passcode = parameters.passcode;
            challenge = my.getRandomString();
            keyAsHex = calculateKey(false);
            keyAsBytes = calculateKey(true);
        }
    };
    
    my.getRandomString = function () {
        return Crypto.util.bytesToHex(Crypto.util.randomBytes(16));
    };

    my.getChallengeString = function () {
        return challenge;
    };
    
    my.getKeyAsHex = function () {
        return keyAsHex;
    };
    
    my.verifyChallenge = function (candidate) {
        var unpacked, mine, yours;
        try {
            unpacked = Crypto.util.bytesToHex(decryptAsHex(candidate));
            mine = unpacked.substring(0, 32);
            yours = unpacked.substring(32, 64);
        } catch (ex) {
            // Cannot Decrypt
            return false;
        }
        if (mine === challenge) {
            return encryptAsHex(Crypto.util.hexToBytes((yours + my.getRandomString())));
        } else {
            // rand mismatch
            return false;
        }
    };
    
    my.decryptMessageFromDM = function (encrypted) {
        try {
            return JSON.parse(Crypto.charenc.UTF8.bytesToString(decryptAsBytes(new Uint8Array(encrypted))));
        } catch (ex) {
            return false;
        }
    };
    
    my.encryptMessageForDM = function (plaintext) {
        return encryptAsBytes(plaintext);
    };

    return my;

};

EdgeInspectGlobals.MessageFormatter = function (CryptoHandler) {
    'use strict';

    var my = {},
        uuid,
        inspectionUrl,
        clientName = 'unset client name',
        mergeObjects,
        createAdminMessage,
        createDeviceMessage,
        createInventoryMessage,
        createPreferencesMessage,
        createBasicMessage,
        createPingMessage,
        actionMap;
    
    my.configure = function (parameters) {
        uuid = parameters.uuid;
        inspectionUrl = parameters.inspectionUrl;
        clientName = parameters.clientName;
    };
    
    mergeObjects = (function () {
        return function (object, retval) {
            var i;
            for (i in object) {
                if (object.hasOwnProperty(i)) {
                    if (typeof object[i] === 'string' || object[i] === null) {
                        // This allows us to overload existing parameters
                        if (!retval[i]) {
                            retval[i] = object[i];
                        }
                    } else {
                        if (typeof retval[i] === 'undefined') {
                            retval[i] = {};
                        }
                        retval[i] = mergeObjects(object[i], retval[i]);
                    }
                }
            }
            return retval;
        };
    }());
    
    createAdminMessage = (function () {
        return function (parameters) {
            var basicMessage = {
                options: {
                    name: clientName,
                    type: "administrator",
                    id: uuid,
                    rand: CryptoHandler.getChallengeString()
                },
                source: uuid
            };
            return JSON.stringify(mergeObjects(basicMessage, parameters));
        };
    }());

    createInventoryMessage = (function () {
        return function (parameters) {
            if (typeof parameters.deviceids === 'string') {
                parameters.deviceids = [parameters.deviceids];
            }
            var basicMessage = {
                    action: 'inventory',
                    options: {
                        random: CryptoHandler.getRandomString()
                    },
                    source: uuid
                },
                wrappedParameters = {action: 'inventory', options: parameters };
            return JSON.stringify(mergeObjects(basicMessage, wrappedParameters));
        };
    }());
    
    createDeviceMessage = (function () {
        return function (parameters) {
            var basicMessage = {
                    action: 'publish',
                    options: {
                        message: {
                            source: uuid,
                            options: {
                            }
                        },
                        random: CryptoHandler.getRandomString(),
                        destinations: []
                    },
                    source: uuid
                },
                wrappedParameters = {action: 'publish', options: parameters };
            return JSON.stringify(mergeObjects(basicMessage, wrappedParameters));
        };
    }());
    
    createPingMessage = (function () {
        return function () {
            return {
                action: 'ping',
                source: uuid,
                options: {
                    random: CryptoHandler.getRandomString()
                }
            };
        };
    }());

    createPreferencesMessage = (function () {
        return function (parameters) {
            var basicMessage = {
                    action: 'preferences',
                    options: {
                        random: CryptoHandler.getRandomString()
                    },
                    source: uuid
                },
                wrappedParameters = {action: 'preferences', options: parameters };
            return JSON.stringify(mergeObjects(basicMessage, wrappedParameters));
        };
    }());
    
    createBasicMessage = (function () {
        return function (parameters) {
            var basicMessage = {
                    options: {
                        random: CryptoHandler.getRandomString()
                    },
                    source: uuid
                };
            return JSON.stringify(mergeObjects(basicMessage, parameters));
        };
    }());
    
    my.basic = function (parameters) {
        return createAdminMessage(parameters);
    };
    
    my.pairFirst = function () {
        var parameters = {
                action: 'pair',
                options: {
                    passcode: CryptoHandler.getKeyAsHex()
                }
            };
        return createAdminMessage(parameters);
    };
    
    my.pair = function () {
        var parameters = {
                action: 'pair'
            };
        return createAdminMessage(parameters);
    };
    
    my.ping = function () {
        return createPingMessage();
    };
    
    my.connect = function (verified) {
        var parameters = {
                action: 'connect',
                options: {
                    challenge: verified
                }
            };
        return createAdminMessage(parameters);
    };
    
    my.inventory = function (status) {
        var parameters = {
                subaction: 'listresources',
                status: status,
                type: 'device'
            };
        return createInventoryMessage(parameters);
    };
    
    my.passcode = function (passcode, deviceid) {
        var parameters = {
                subaction: 'passcode_response',
                passcode: passcode,
                id: deviceid
            };
        return createInventoryMessage(parameters);
    };
    
    my.eject = function (devices) {
        var parameters = {
                subaction: 'eject_device',
                deviceids: devices
            };
        return createInventoryMessage(parameters);
    };
    
    my.forget = function (devices) {
        var parameters = {
                subaction: 'forget_device',
                deviceids: devices
            };
        return createInventoryMessage(parameters);
    };
    
    my.cancel = function (devices) {
        var parameters = {
                subaction: 'cancel_connect',
                deviceids: devices
            };
        return createInventoryMessage(parameters);
    };
    
    my.hostinfo = function () {
        var parameters = {
                subaction: 'get_manager_info'
            };
        return createInventoryMessage(parameters);
    };
    
    my.browse = function (url, devices, fullscreen) {
        var parameters = {
                message: {
                    action: 'browser_navigate',
                    options: {
                        url: url,
                        fullscreen: fullscreen
                    }
                },
                destinations: devices
            };
        return createDeviceMessage(parameters);
    };

    my.inspect = function (url, devices, fullscreen) {
        var parameters = {
                message: {
                    action: 'browser_navigate',
                    options: {
                        url: url,
                        remoteinspect: inspectionUrl,
                        fullscreen: fullscreen
                    }
                },
                destinations: devices
            };
        return createDeviceMessage(parameters);
    };

    my.screenshot = function (requestId, fullPage, dualOrientation, devices) {
        var parameters = {
                message: {
                    action: 'screenshot_request',
                    options: {
                        request_id: requestId,
                        full_page: fullPage,
                        dual_orientation: dualOrientation
                    }
                },
                destinations: devices
            };
        return createDeviceMessage(parameters);
    };

    my.refresh = function (requestId, devices) {
        var parameters = {
                message: {
                    action: 'force_refresh',
                    options: {
                        request_id: requestId
                    }
                },
                destinations: devices
            };
        return createDeviceMessage(parameters);
    };

    my.cancelScreenshot = function (requestId, devices) {
        var parameters = {
                message: {
                    action: 'transfer_cancel',
                    options: {
                        request_id: requestId
                    }
                },
                destinations: devices
            };
        return createDeviceMessage(parameters);
    };
    

    my.showChrome = function (requestId, devices) {
        var parameters = {
                message: {
                    action: 'show_chrome',
                    options: {
                        request_id: requestId
                    }
                },
                destinations: devices
            };
        return createDeviceMessage(parameters);
    };
    

    my.hideChrome = function (requestId, devices) {
        var parameters = {
                message: {
                    action: 'full_screen',
                    options: {
                        request_id: requestId
                    }
                },
                destinations: devices
            };
        return createDeviceMessage(parameters);
    };
    
    my.preferences = function (action, prefs) {
        var parameters = {
                subaction: action
            };
        if (typeof prefs !== 'undefined') {
            parameters.prefs = prefs;
        }
        return createPreferencesMessage(parameters);
    };
    
    my.basic = function (action) {
        var parameters = {
                action: action
            };
        return createBasicMessage(parameters);
    };

    return my;

};

EdgeInspectGlobals.MessageParser = function (StorageManager, CryptoHandler) {
    'use strict';
    
    var my = {};
    
    my.parse = function (message) {
        var parsed;
        if (typeof message.data === 'string') {
            try {
                parsed = JSON.parse(message.data);
            } catch (ex) {
                StorageManager.log(JSON.stringify('MessageParser Error (Not Valid JSON): ' + message.data));
                return false;
            }
        } else {
            parsed = CryptoHandler.decryptMessageFromDM(message.data);
        }
        if (parsed === false) {
            StorageManager.log(JSON.stringify('MessageParser Error (Could Not Decrypt): ' + message.data));
            return false;
        }
        if (parsed.action !== 'pong') {
            if (parsed.options) {
                delete parsed.options.random;
            }
            StorageManager.log(JSON.stringify(parsed));
            return parsed;
        } else {
            return false;
        }
    };

    return my;

};

EdgeInspectGlobals.ConnectionManager = function (WebSocket, StorageManager) {
    'use strict';

    var my = {
            isConnected: false
        },
        handle,
        subscribers = {},
        connectionData = {},
        isConnecting = false,
        defaultConnectionData = {
            protocol: 'ws',
            host: '127.0.0.1',
            port: '7682'
        };

    function performFirstRunCheck() {
        if (StorageManager.get('protocol') === null || StorageManager.get('host') === null || StorageManager.get('port') === null) {
            StorageManager.put('protocol', defaultConnectionData.protocol);
            StorageManager.put('host', defaultConnectionData.host);
            StorageManager.put('port', defaultConnectionData.port);
        }
    }

    function loadConnectionSettings() {
        connectionData.protocol = StorageManager.get('protocol');
        connectionData.host     = StorageManager.get('host');
        connectionData.port     = StorageManager.get('port');
    }
    

    function publish(name, data) {
        var i;
        if (typeof subscribers[name] !== 'undefined') {
            for (i = 0; i < subscribers[name].length; i += 1) {
                subscribers[name][i](data);
            }
        }
    }
    
    my.subscribe = function (name, handler) {
        if (typeof subscribers[name] === 'undefined') {
            subscribers[name] = [];
        }
        subscribers[name].push(handler);
    };

    my.connect = function () {
        if (!isConnecting) {
            isConnecting = true;
            loadConnectionSettings();
            handle = new WebSocket(connectionData.protocol + "://" + connectionData.host + ":" + connectionData.port + "/shadow");
            handle.binaryType = 'arraybuffer';
            handle.onopen = function (ev) {
                my.isConnected = true;
                isConnecting = false;
                publish('connect');
            };
            handle.onclose = function (ev) {
                my.isConnected = false;
                isConnecting = false;
                publish('disconnect', ev);
            };
            handle.onmessage = function (ev) {
                // Call out to a browser specific function
                publish('message', ev);
            };
            handle.onerror = function (ev) {
                // Call out to a browser specific function
                publish('error', ev);
            };
        }
    };
    
    my.disconnect = function () {
        handle.close(1000, "All Done");
    };
    
    my.send = function (message) {
        var bufferedMessage;
        if (my.isConnected) {
            if (Array.isArray(message)) {
                if (runInBrowserMode) {
                    // Convert array of binary into a typed array and send the buffer 
                    return handle.send(new Uint8Array(message).buffer);
                } else {
                    // Expects node is using an instance of ws for WebSockets
                    return handle.send(message, {mask: false, binary: true});
                }
            } else {
                return handle.send(message);
            }
        }
    };
    
    my.configure = function () {
        performFirstRunCheck();
    };
    
    my.reset = function () {
        StorageManager.clear('protocol');
        StorageManager.clear('host');
        StorageManager.clear('port');
        connectionData = {};
        return;
    };
    
    my.getConnectionSettings = function () {
        return connectionData;
    };

    return my;

};

if (typeof exports !== 'undefined') {
    exports.EdgeInspectGlobals = EdgeInspectGlobals;
}

var EdgeInspect = function () {
    'use strict';
    var my = {
            deviceManagerFirstRun: false,
            isConnected: false,
            uuid: null,
            CONNECTED_EVENT: 'connected',
            DISCONNECTED_EVENT: 'disconnected',
            SCREENSHOTS_COMPLETE_EVENT: "screenshotsComplete",
            CLOSE_REASON_CLEAN: 1001,
            CLOSE_REASON_SERVER_SHUTDOWN: 2001,
            CLOSE_REASON_SERVER_EJECTED: 2002,
            CLOSE_REASON_SERVER_REJECTED: 2003,
            CLOSE_REASON_SERVER_MAX_CONNECTIONS: 2004,
            CLOSE_REASON_VERSION_MISMATCH: 3001,
            CLOSE_REASON_UNKNOWN: 4001
        },
        messageActionMap = {},
        verifiedChallenge = false,
        deviceManagerMessageVersion = 0,
        hasSubscribed = false,
        keepAliveTimer = null,
        shutdownCode = false,
        subscribers = {},
        defaultSalt = 'b8b5d15f0de11ceed565376436d25d74',
        StorageManager,
        ConnectionManager,
        CryptoHandler,
        MessageFormatter,
        MessageParser,
        WebSocketObject,
        LocalStorageObject,
        LocalStorageInstance,
        CryptoObject;
    
    if (runInBrowserMode) {
        // We're in a browser as far as we know, use the native objects.
        WebSocketObject         = WebSocket;
        LocalStorageObject      = {};
        LocalStorageInstance    = localStorage;
        CryptoObject            = Crypto;
    } else {
        // We're not in a browser as far as we know. Probably Node, try requiring.
        WebSocketObject         = require('ws');
        LocalStorageObject      = require('node-localstorage').LocalStorage;
        LocalStorageInstance    = new LocalStorageObject('./EdgeInspect');
        CryptoObject            = require('cryptojs').Crypto;
    }
    
    StorageManager      = new EdgeInspectGlobals.StorageManager(LocalStorageInstance);
    ConnectionManager   = new EdgeInspectGlobals.ConnectionManager(WebSocketObject, StorageManager);
    CryptoHandler       = new EdgeInspectGlobals.CryptoHandler(CryptoObject);
    MessageFormatter    = new EdgeInspectGlobals.MessageFormatter(CryptoHandler);
    MessageParser       = new EdgeInspectGlobals.MessageParser(StorageManager, CryptoHandler);

    function publish(name, data) {
        var i;
        if (typeof subscribers[name] !== 'undefined') {
            for (i = 0; i < subscribers[name].length; i += 1) {
                subscribers[name][i](data);
            }
        }
    }
    
    function checkForSupportedDeviceManager() {
        if (deviceManagerMessageVersion < 1) {
            shutdownCode = my.CLOSE_REASON_VERSION_MISMATCH;
            ConnectionManager.disconnect();
            return false;
        } else {
            return true;
        }
    }

    function pingDeviceManager() {
        if (my.isConnected) {
            var pingMessage = MessageFormatter.ping();
            StorageManager.log(pingMessage);
            ConnectionManager.send(CryptoHandler.encryptMessageForDM(pingMessage));
        }
    }
    
    function startKeepAliveTimer() {
        keepAliveTimer = setInterval(pingDeviceManager, 20000);
    }
    
    function stopKeepAliveTimer() {
        if (keepAliveTimer) {
            clearInterval(keepAliveTimer);
            keepAliveTimer = null;
        }
    }
    
    function configure(driverName, driverId, encryptionToken) {
        if (typeof driverName === 'undefined') {
            throw new Error('You must provide at least a name and a UUID');
        }
        if (driverName === '') {
            throw new Error('Your name cannot be empty.');
        }
        if (!driverId.match(/^[0-9a-z]{8}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{12}$/)) {
            throw new Error('Your driver ID is not a UUID.');
        }
        var configureParameters = {};
        my.uuid = driverId;
        if (typeof encryptionToken === 'undefined' || String(encryptionToken) === '') {
            configureParameters = {salt: defaultSalt, passcode: my.generateUUID()};
        } else {
            configureParameters = {encryptionkey: encryptionToken};
        }
        CryptoHandler.configure(configureParameters);

        // This should be refactored
        MessageFormatter.configure({uuid: my.uuid, inspectionUrl: '', clientName: driverName});
        ConnectionManager.configure();
        if (!hasSubscribed) {
            ConnectionManager.subscribe('connect', function () {
                var pairMessage = MessageFormatter.pair();
                StorageManager.log(pairMessage);
                ConnectionManager.send(pairMessage);
            });
            ConnectionManager.subscribe('message', function (message) {
                var parsed = MessageParser.parse(message);
                if (parsed) {
                    if (typeof messageActionMap[parsed.action] !== 'undefined') {
                        messageActionMap[parsed.action](parsed);
                    }
                }
            });
            ConnectionManager.subscribe('disconnect', function (message) {
                var reasonCode = parseInt(message.code, 10);
                my.isConnected = false;
                if (shutdownCode !== false) {
                    reasonCode = shutdownCode;
                }
                publish(my.DISCONNECTED_EVENT, reasonCode);
                shutdownCode = false;
            });
            hasSubscribed = true;
        }
    }
    
    function updateDeviceManagerMessageVersion(message) {
        deviceManagerMessageVersion = parseInt(message.version, 10);
        StorageManager.put('dmmsgversion', deviceManagerMessageVersion);
    }

    messageActionMap = {
        'pair_ready' : function (message) {
            updateDeviceManagerMessageVersion(message);
            if (checkForSupportedDeviceManager()) {
                verifiedChallenge = CryptoHandler.verifyChallenge(message.options.challenge);
                var responseMessage;
                if (verifiedChallenge) {
                    responseMessage = MessageFormatter.connect(verifiedChallenge);
                    StorageManager.log(responseMessage);
                    ConnectionManager.send(responseMessage);
                } else {
                    responseMessage = MessageFormatter.pairFirst();
                    StorageManager.log(responseMessage);
                    ConnectionManager.send(responseMessage);
                }
            }
        },
        'passcode_request' : function (message) {
            var responseMessage = MessageFormatter.pairFirst();
            StorageManager.log(responseMessage);
            updateDeviceManagerMessageVersion(message);
            if (checkForSupportedDeviceManager()) {
                ConnectionManager.send(responseMessage);
            }
        },
        'connect_ok' : function () {
            my.isConnected = true;
            startKeepAliveTimer();
            publish(my.CONNECTED_EVENT, CryptoHandler.getKeyAsHex());
        },
        'transfer_complete' : function () {
            publish(my.SCREENSHOTS_COMPLETE_EVENT);
        }
    };
    my.subscribe = function (name, handler) {
        if (typeof subscribers[name] === 'undefined') {
            subscribers[name] = [];
        }
        subscribers[name].push(handler);
    };
    
    my.connect = function (driverName, driverId, encryptionToken) {
        configure(driverName, driverId, encryptionToken);
        if (!ConnectionManager.isConnected) {
            ConnectionManager.connect();
        }
    };
    
    my.disconnect = function () {
        if (ConnectionManager.isConnected) {
            stopKeepAliveTimer();
            shutdownCode = my.CLOSE_REASON_CLEAN;
            ConnectionManager.disconnect();
        }
    };
    
    my.reset = function () {
        ConnectionManager.reset();
        my.uuid = null;
        StorageManager.destroySavedSettings();
    };
    
    my.getConnectionSettings = function () {
        return ConnectionManager.getConnectionSettings();
    };
    
    my.sendURL = function (url, fullscreen) {
        if (typeof fullscreen === 'undefined' || fullscreen === false) {
            fullscreen = "false";
        } else {
            fullscreen = "true";
        }
        var sendUrlMessage = MessageFormatter.browse(url, [], fullscreen);
        StorageManager.log(sendUrlMessage);
        ConnectionManager.send(CryptoHandler.encryptMessageForDM(sendUrlMessage));
    };
    
    my.takeScreenshot = function (fullPage, dualOrientation) {
        var screenshotMessage = MessageFormatter.screenshot(my.generateUUID(), fullPage, dualOrientation, []);
        ConnectionManager.send(CryptoHandler.encryptMessageForDM(screenshotMessage));
    };

    my.generateUUID = function () {
        // Big hat tip to the https://github.com/jed and his public gist for this https://gist.github.com/982883
        function b(a) {
            return a ? (a ^ Math.random() * 16 >> a / 4).toString(16) : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, b);
        }
        return b();
    };
    

    return my;
};

if (typeof exports !== 'undefined') {
    exports.EdgeInspect = EdgeInspect;
}
