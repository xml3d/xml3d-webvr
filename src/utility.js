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
        
        // TODO: reposition code?
        // Setting canvas size
        var leftEye = HMD.getEyeParameters("left");
        var rightEye = HMD.getEyeParameters("right");
        gl.canvas.width = Math.max(leftEye.renderWidth, rightEye.renderWidth) * 2;
        gl.canvas.height = Math.max(leftEye.renderHeight, rightEye.renderHeight);
        console.log("Canvas: " + gl.canvas.height + ", " + gl.canvas.width);

        HMD.requestPresent([{
            source: myCanvas
        }]);
        
        // Set FOV
        setFOV();

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

//TODO try view transformation with headtransform etc


// Sets the FOV in the view element
function setFOV(){
    var fov, zNear, zFar;
    zNear = 0.01;
    zFar = 100;

    // Compute the clipping planes for zNear and zFar
    var viewMatrix = document.querySelector("view").getViewMatrix();    //View Matrix
    var bb = document.querySelector("xml3d").getWorldBoundingBox(); //BBox for the entire scene
    
    // Transform BBox to view space
    bb.transformAxisAligned(viewMatrix);
    
    zNear = -bb.max.z;
    zFar = -bb.min.z;

    // zNear should remain above 0.01 to avoid problems with camera
    zNear = (zNear < 0.01) ? 0.01 : zNear;
    
    // Assumes left and right FOV are equal
    // TODO: Not necessarily equal, possibly set FOV per left/right view?
    fov = HMD.getEyeParameters("right").fieldOfView;
    console.log("FOV: ");
    console.log(fov);
    
    var projectionMatrix = fieldOfViewToProjectionMatrix(fov, zNear, zFar);
        
    var matrixString = "<float4x4 name='projectionMatrix'>" + arrayToString(projectionMatrix) + "</float4x4>"
    $("view").attr("model", "urn:xml3d:view:projective");
    $("view").append(matrixString);
    
    
    $("#fovProjection").attr("transform", "#fovTransform");
    $("#fovProjection").attr("matrix3d", arrayToString(projectionMatrix));
    $("#fovProjection").before('<transform id="fovTransform" matrix3d="' + arrayToString(projectionMatrix) + '"></transform>');
}

// Returns FOV Projection Matrix, as given by: https://w3c.github.io/webvr/#interface-interface-vrfieldofview
function fieldOfViewToProjectionMatrix (fov, zNear, zFar) {
  var upTan = Math.tan(fov.upDegrees * Math.PI / 180.0);
  var downTan = Math.tan(fov.downDegrees * Math.PI / 180.0);
  var leftTan = Math.tan(fov.leftDegrees * Math.PI / 180.0);
  var rightTan = Math.tan(fov.rightDegrees * Math.PI / 180.0);
    
  var xScale = 2.0 / (leftTan + rightTan);
  var yScale = 2.0 / (upTan + downTan);

  var out = new Float32Array(16);
  out[0] = xScale;
  out[1] = 0.0;
  out[2] = 0.0;
  out[3] = 0.0;
  out[4] = 0.0;
  out[5] = yScale;
  out[6] = 0.0;
  out[7] = 0.0;
  out[8] = -((leftTan - rightTan) * xScale * 0.5);
  out[9] = ((upTan - downTan) * yScale * 0.5);
  out[10] = -(zNear + zFar) / (zFar - zNear);
  out[11] = -1.0;
  out[12] = 0.0;
  out[13] = 0.0;
  out[14] = -(2.0 * zFar * zNear) / (zFar - zNear);
  out[15] = 0.0;

  return out;
}

// Returns array as a String with format: "[1] [2] [3] ..."
function arrayToString(array){
    var result = "";
    for (var i = 0; i < array.length; i++){
        result = result + " " + array[i];
    }
    return result;
}