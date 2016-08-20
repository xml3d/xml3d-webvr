var utility = module.exports = {};
 
var render = require("./render.js");

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

        // GL settings, necessary??
        // If no color is defined, background for HMD will be black
        //gl.clearColor(1.0, 1.0, 1.0, 1.0);
        // Near things obscure far things
        //gl.depthFunc(gl.LEQUAL);
        // Clear the color as well as the depth buffer.
        //gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        HMD.requestPresent([{
            source: myCanvas
        }]);

        // resize the canvas
        // TODO: currently not used, reimplement or not??
        //resize();

        // initialize VR render tree
        render.vrRenderTree();

        //TODO: (Christian) Here you should replace window.requestAnimationFrame to return HMD.requestAnimationFrame.
        //TODO onAnimationFrame can then be moved into vrTree and doesn't need to request its own animation frame from the HMD anymore
        // Start showing frames on HMD
        render.onAnimationFrame();

    });
};

// Helper function to create the VR-related buttons 
utility.setupButtons = function() {
    
    // TODO: include button css? (for hover)
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
            inVR = true;
        }else{
            // TODO: function to exit VR
            $("#VRenable").html("Enter VR");
            $("#ResetPos").remove();
            inVR = false;
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
