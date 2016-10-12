"use strict";
/************************************************************


For further information, please see development_status.txt

*************************************************************/

var util = require("./utility.js");

$(document).ready(function () {  
   // Dynamically create VR-related buttons
    navigator.getVRDisplays().then(function (devices) {
		// Cancel initalisation if no VRDisplays are detected
		if (devices.length < 1){
			console.log("No VRDisplays found, reload page to try again");
			return;
		}
		global.devices = devices;
		util.setupButtons();  
	});
});

// Some global variables
var HMD, gl, myCanvas;
global.inVR = false;