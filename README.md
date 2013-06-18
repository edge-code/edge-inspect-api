The Edge Inspect JavaScript API
=================================

The Edge Inspect team has created a simple JavaScript library that will allow other pieces of software to easily integrate with a limited subset of Edge Inspect features. 

##Glossary##
For the purposes of this document the following terms are defined.
* User - An individual or team making use of the API to integrate their software with Edge Inspect.
* End User - An individual using the Edge Inspect product.
* Device Manager (DM) - Refers to the Edge Inspect Device Manager, the application that is installed and runs on the end user's computer.
* Driver - Any application that is connected to the Device Manager that sends control messages to it. An example of a driver is the Edge Inspect Chrome extension.
* Control message - A message sent to the DM for the purposes of causing a particular action on one or more connected devices, e.g navigation messages, screenshot messages, etc.

##Edge Inspect API##
###Functions###
* connect(driverName, driverId, encryptionToken) - Connects the driver to the Edge Inspect Device Manager. Each driver must send a name, unique ID, and encryptionToken to the DM when trying to connect so that the end user can be prompted and decide if they wish to authorize that driver. The encryptionToken can be null or an empty string if the driver has never connected previously to the DM. A new encryptionToken may be returned in the onConnectedEvent() on each connection to the DM.
* disconnect() - Disconnects the driver.
* sendURL(url) - Tells all connected devices to browse to the specified URL string parameter.
* takeScreenshot(fullPage, dualOrientation) - Tells all connected devices to take a screenshot of the URL they are currently previewing. The screenshot will be stored in the folder specified in the Chrome Extension options page. 
    + fullPage - a boolean parameter that, when true, tells the devices to attempt to take a full page screenshot, or as much of the page as memory permits. If false, the device will take a screenshot of the viewport. 
    + dualOrientation - a boolean parameter that when true, tells the devices to take screenshots in both landscape and portrait orientations and then return to the original orientation. When false, a screenshot is taken of the current orientation only.
* generateUUID() - generate a UUID. Utility function provided in case a user needs to generate a new UUID.
* subscribe(event, callback) - Subscribe to events for the purposes of executing a callback function.

###Events###
* CONNECTED_EVENT - fired each time the DM and the driver become connected. A new encryptionToken can be returned as a parameter to the event handler on each connection to the DM, and the most recent value should always be stored and used for the next connection attempt with the DM.
* DISCONNECTED_EVENT - fired each time the DM connection is lost. A reason code is returned as a paramter to the event handler. Reasons include:
    + CLOSE_REASON_CLEAN - The connection was closed normally by either the DM or the API.
    + CLOSE_REASON_ABNORMAL - The web socket connection closed abnormally. Generally caused attempting to open the connection when the DM is not running.
    + CLOSE_REASON_SERVER_REJECTED - The end user chose chose not to authorize the driver.
    + CLOSE_REASON_VERSION_MISMATCH - There is a version mismatch and the DM needs to be updated.
    + CLOSE_REASON_UNKNOWN - ?
* SCREENSHOTS_COMPLETE_EVENT - Screenshots have been taken and returned from all devices to the screenshots folder.

###Known Issues and Limitations###
* The API will currently only connect to Edge Inspect running on the same machine.
* Using the API it would be very easy to overwhelm the DM and devices with requests, especially for screenshots. Right now there is no code in the DM to prevent this from happening. We are considering adding something in the future to help prevent this situation.

###Notes###
* Multiple drivers can be connected simultaneously
    + The API is not tracked as a device, since that would mean that free users' single device limit would already be reached and they could effectively have no actual devices connected. Consequentially any number of drivers may be simultaneously connected.
* With multiple drivers connected simultaneously, the last driver to send a command wins. The Chrome extension has no special precedence or handling for it's messages.

* The library will attempt to discern if you are running in a node context or in a browser.  Each context has different requirements.
    + Node - you will need to install these additional libraries:
        - ws
        - node-localstorage
        - cryptojs        
    + Browser - include the third-party Crypto-JS v2.5.3 library

###NOTICE###
The API/code available on this site is governed by the Apache 2.0 license. However, in order to use this API, you or your end users are required to have a valid license to Adobe Edge Inspect software. Use of Adobe Edge Inspect or any other software is governed under separate terms and licenses provided with such software. Nothing in this project grant rights to any other software or service.  
