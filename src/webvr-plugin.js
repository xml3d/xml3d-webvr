"use strict";
/************************************************************


For further information, please see development_status.txt

*************************************************************/

var util = require("./utility.js");

$(document).ready(function () {  
   // Dynamically create VR-related buttons
    util.setupButtons();  
});

// Some global variables
var HMD, gl, myCanvas;
global.inVR = false;