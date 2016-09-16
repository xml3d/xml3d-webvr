var utility = module.exports = {};
 
//var render = require("./render.js");              // Uses a shader to combine the 2 views from buffers to the canvas
var render = require("./render_viewports.js");      // Uses viewports to directly render onto the canvas

var orig_requestAnimationFrame = window.requestAnimationFrame;

// Initiates VR, user interaction necessary
utility.initiateVR = function() {
    navigator.getVRDisplays().then(function (devices) {
        
        // Cancel initalisation if no VRDisplays are detected
        if (devices.length < 1){
            console.log("No VRDisplays found, reload page to try again")
            return;
        }
        
        // Default: Use first registered device
        HMD = devices[0];
        console.log(HMD);

        // Get the Canvas
        myCanvas = document.getElementsByClassName("_xml3d")[0]; //TODO: review this

        gl = myCanvas.getContext('webgl');

        HMD.requestPresent([{
            source: myCanvas
        }]);

        // initialize VR render tree
        render.vrRenderTree();

        // Replace the original window.requestAnimationFrame() with the one for the HMD
        // .requestAnimationFrame() will be called by XML3D
        window.requestAnimationFrame = function(callback){
            HMD.requestAnimationFrame(callback);
        };
    });
};

// Helper function to create the VR-related buttons 
utility.setupButtons = function() {
    
    var btnStyle = {
        "width": "10rem",
        "border -width": "0px",
        "cursor": "pointer",
        "font-family": '"Helvetica Neue", "Helvetica", Helvetica, Arial, sans-serif',
        "font-weight": "normal",
        "line-height": "normal",
        "margin": "0 0 0rem",
        "position": "relative",
        "text-decoration": "none",
        "text-align": "center",
        "display": "inline-block",
        "padding-top": "1rem",
        "padding-right": "1rem",
        "padding-bottom": "1rem",
        "padding-left": "1rem",
        "font-size": "1rem",
        "background-color": "#008cba",
        "color": "white",
        "transition": "background-color 300ms ease-out"
    };

    $(".xml3d").first().before("<div id='ButtonBar' style='position: fixed; bottom: 0px'></div>");
    
    // Add the VRenable button
    utility.addVRenableBtn(btnStyle);  
}

// Add the "Enter VR" button
utility.addVRenableBtn = function(btnStyle) {
    $("#ButtonBar").append("<button id='VRenable'>Enter VR</button>");
    $("#VRenable").css(btnStyle);
    
    // Adds listener to enable VR
    document.getElementById("VRenable").addEventListener("click", function () {
        if (!(global.inVR)){
            utility.initiateVR();
            $("#VRenable").html("Exit VR");
            utility.addResetBtn(btnStyle);
            global.inVR = true;
        }else{
            // TODO: reset the render interface
            HMD.exitPresent();
            render.resetRenderTree();
            $("#VRenable").html("Enter VR");
            $("#ResetPos").remove();
            global.inVR = false;
        }
       
    });
}

// Add the "Reset Position" button
utility.addResetBtn = function(btnStyle) {
    $("#ButtonBar").append("<button id='ResetPos'>Reset Position</button>");
    $("#ResetPos").css(btnStyle);
    
    // Adds listener to reset Position. 
    document.getElementById("ResetPos").addEventListener("click", function () {
        resetPosition();
    });
}

// Resets the pose of the HMD if it is not null
function resetPosition() {
    if (HMD){
        HMD.resetPose();
    }  
}
