(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var fov = module.exports = {};

// Creates the <float4x4> for the projection matrix and adapts the <view> for its use
fov.initializeFOV = function(){
    var $view = $("#vr_view");
    // Placeholder for real projection matrix, to avoid errors by XML3D before rendering the next frame
    var temp = new Float32Array(16);
    for (var i = 0; i < 16; i++){
        temp[i] = 0.0;
    }
    
    var matrixString = "<float4x4 name='projectionMatrix'>" + arrayToString(temp) + "</float4x4>";
    $view.attr("model", "urn:xml3d:view:projective");
    $view.append(matrixString);
}

// Sets the FOV in the view element
fov.setFOV = function($view, $xml3d, $projectionMatrix, fov){
    var zNear, zFar;

    // Compute the clipping planes for zNear and zFar
    var viewMatrix = $view.getViewMatrix();    //View Matrix
    var bb = $xml3d.getWorldBoundingBox(); //BBox for the entire scene
    // Transform BBox to view space
    bb.transformAxisAligned(viewMatrix);
    
    zNear = -bb.max.z;
    zFar = -bb.min.z;

    // zNear should remain above 1 to avoid problems with camera
    if (zNear < 1.0 || zNear == Infinity || zNear == -Infinity){
        zNear = 1.0;
    }
    // Clamp the value to enable further calculations
    if (zFar == Infinity || zFar == -Infinity){
        zFar = 1000;
    }    
    // Assumes left and right FOV are equal
    // TODO: Not necessarily equal, possibly set FOV per left/right view?
    //fov = HMD.getEyeParameters("right").fieldOfView;
    
    // Calculate the projection matrix
    var projectionMatrix = fieldOfViewToProjectionMatrix(fov, zNear, zFar);

    // Update the projection matrix
    $projectionMatrix.textContent = arrayToString(projectionMatrix);
}

fov.resetFOV = function(){
    var $view = $("view"); 
    $view.removeAttr("model");
    document.querySelector("float4x4[name=projectionMatrix]").remove();
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
    //To avoid this value being -Infinity
    out[14] = -(2.0 * zFar * zNear) / (zFar - zNear);
    var float_MinValue = -3.40282347e+38;
    out[14] = (Number.isFinite(out[14])) ? out[14] : float_MinValue;
    out[15] = 0.0;

    return out;
}

// Returns array as a String with format: "[1] [2] [3] ..."
function arrayToString(array){
    var result = "";
    for (var i = 0; i < array.length; i++){
        result = result + " " + array[i].toString();
    }
    return result;
}
},{}],2:[function(require,module,exports){
(function (global){
var render = module.exports = {};

var fov = require("./fov.js");

// Scales values dat WebVR gives in metres
window.XML3D.webvr = {};
window.XML3D.webvr.translationScale = 50.0;
var eyeScale = 10.0;
var oldRenderTree;
var oldView;

//******************************************** Custom RenderTree

render.vrRenderTree = function(){    
    console.log("creating custom render tree");
    
    //initialising stats
    try{
        var stats = new Stats();
        stats.showPanel( 0 ); // 0: fps, 1: ms, 2: mb, 3+: custom
        document.body.appendChild( stats.dom );
    } catch(error){ // Dummy stats in case the script is not included
        var stats = {}
        stats.begin = function(){};
        stats.end = function(){};
    }
    

    var leftEye = HMD.getEyeParameters("left");
    var rightEye = HMD.getEyeParameters("right");
    var leftOffset = leftEye.offset;
    var rightOffset = rightEye.offset;
    
    
    // Create groups around view to apply the eye and head transformations to
    var $view = $("#" + document.getElementsByTagName("xml3d")[0].view.substr(1));
    
    if ($("#headTransformGroup").length == 0 && $("#eyeTransform").length == 0 ){
        if ($view.attr("transform")) {
            //old view has a transform, we need to move it to above the head transform in the hierarchy to preserve current camera position and orientation
            $view.before('<group id="oldCameraTransform"><group id="headTransformGroup"><group id="eyeTransform"><view id="vr_view"></view></group></group></group>');
            $("#oldCameraTransform").attr("transform", $view.attr("transform"));
        } else {
            $view.before('<group id="headTransformGroup"><group id="eyeTransform"><view id="vr_view"></view></group></group>');
        }
    }
      
    // cache jQuery lookups
    var $eyeTransform = $("#eyeTransform");
    var $headTransformGroup = $("#headTransformGroup");
    
    // Prepare the headTransformGroup for use
    if ($("#headTransform").length == 0){
        $headTransformGroup.before('<transform id="headTransform"></transform>');
    }
    $headTransformGroup.attr("transform", "#headTransform")
    
    var $headTransform = $("#headTransform");
    
    // Define the translations for the left/right eye
    if ($("#leftEyeTransform").length == 0 && $("#rightEyeTransform").length == 0 && $("#defaultEyeTransform").length == 0){
        $eyeTransform.before('<transform id="leftEyeTransform" translation="' + leftOffset[0] * eyeScale + ' ' + leftOffset[1] * eyeScale + ' ' + leftOffset[2] * eyeScale + '"></transform>');
        $eyeTransform.before('<transform id="rightEyeTransform" translation="' + rightOffset[0] * eyeScale + ' ' + rightOffset[1] * eyeScale + ' ' + rightOffset[2] * eyeScale + '"></transform>');
        $eyeTransform.before('<transform id="defaultEyeTransform" translation="0 0 0"></transform>');
    }
    
    gl.canvas.width = leftEye.renderWidth + rightEye.renderWidth;
    gl.canvas.height = Math.max(leftEye.renderHeight, rightEye.renderHeight);
    console.log("Canvas: " + gl.canvas.width + ", " + gl.canvas.height);

    // Enageble the WebGL Scissortest, needed to properly render to the two different viewports
    gl.enable(gl.SCISSOR_TEST);
    
    // prepare to apply the FOV transformation
    fov.initializeFOV();
    
    // Cache the lookups used for calculating the FOV
    var $xml3d = document.getElementsByTagName("xml3d")[0];
    var $projectionMatrix = document.querySelector("float4x4[name=projectionMatrix]");
    
    oldView = $xml3d.getAttribute("view");
    $xml3d.setAttribute("view", "#vr_view");
    
    var $view = getActiveView();
    
    var oldPosition = [0.0, 0.0, 0.0];
    var oldOrientation = [0.0, 0.0, 0.0, 1.0];

    // Define the VR RenderPass
    var VRPass = function (renderInterface, output, opt) {
        XML3D.webgl.BaseRenderPass.call(this, renderInterface, output, opt);
    };
    
    XML3D.createClass(VRPass, XML3D.webgl.BaseRenderPass);
    XML3D.extend(VRPass.prototype, {
        render: function (scene) {
            var gl = this.renderInterface.context.gl;
            this.output.bind();

            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.disable(gl.DEPTH_TEST);

            // Undo any changes made to the GL state after rendering
            this.output.unbind();
            gl.enable(gl.DEPTH_TEST);
        },

        setProcessed: function (processed) {
            this.processed = processed;
            this.prePasses[0].processed = processed;
            this.prePasses[1].processed = processed;
        },

        // Custom VR-rendertree, swapping cameras in between rendering the prepasses
        renderTree: function (scene) {
            if (this.processed)
                return;
            this.processed = true;
            stats.begin();
            
            // Stereo view

            // Get pose as late as possible to minimize latency!
            var pose = HMD.getPose();

            // Rotation of the head:
            // Get the orientation (given as quaternion)
            var orientationQ = pose.orientation ? pose.orientation : [0, 0, 0, 1];
            orientationQ[0] = orientationQ[0] ? orientationQ[0] : oldOrientation[0];
            orientationQ[1] = orientationQ[1] ? orientationQ[1] : oldOrientation[1];
            orientationQ[2] = orientationQ[2] ? orientationQ[2] : oldOrientation[2];
            orientationQ[3] = orientationQ[3] ? orientationQ[3] : oldOrientation[3];
            oldOrientation = orientationQ;

            // Transform into axis + angle
            var orientationAA = new XML3D.AxisAngle.fromQuat(new XML3D.Quat(orientationQ[0], orientationQ[1], orientationQ[2], orientationQ[3]));
            // Update rotation attribute
            var oriString = orientationAA.axis.x + ' ' + orientationAA.axis.y + ' ' + orientationAA.axis.z + ' ' + orientationAA.angle;
            // Apply rotation transformation to head
            $headTransform.attr("rotation", oriString);

            // Movement of the head:
            // Get position as 3D vector
            // Make sure the position is never null
            var position = pose.position ? pose.position : [0, 0, 0];
            position[0] = position[0] ? position[0] : oldPosition[0];
            position[1] = position[1] ? position[1] : oldPosition[1];
            position[2] = position[2] ? position[2] : oldPosition[2];
            oldPosition = position;
            
            // Convert to string
            var posiString = position[0]* window.XML3D.webvr.translationScale + ' ' + position[1] * window.XML3D.webvr.translationScale + ' ' + position[2] * window.XML3D.webvr.translationScale;
            // Apply position transformation to head
            $headTransform.attr("translation", posiString);

            
            
            var leftEye = HMD.getEyeParameters("left");
            var rightEye = HMD.getEyeParameters("right");
            
            var i = this.prePasses.length;
            if (i == 2) {
                var rightPass = this.prePasses[0];
                var leftPass = this.prePasses[1];
                
                
                // Only render to one half of the canvas
                var fov_ = HMD.getEyeParameters("left").fieldOfView;
                fov.setFOV($view, $xml3d, $projectionMatrix, fov_);
                $eyeTransform.attr("transform", "#leftEyeTransform");
                gl.scissor(0, 0, leftEye.renderWidth, leftEye.renderHeight);        // So the other half will not be overwritten
                gl.viewport(0, 0, leftEye.renderWidth, leftEye.renderHeight);
                XML3D.flushDOMChanges();
                leftPass.render(scene);
                
                fov_ = HMD.getEyeParameters("right").fieldOfView;
                fov.setFOV($view, $xml3d, $projectionMatrix, fov_);
                $eyeTransform.attr("transform", "#rightEyeTransform");
                gl.scissor(leftEye.renderWidth, 0, rightEye.renderWidth, rightEye.renderHeight);
                gl.viewport(leftEye.renderWidth, 0, rightEye.renderWidth, rightEye.renderHeight);
                XML3D.flushDOMChanges();
                rightPass.render(scene);
                

            } else {
                // If something unexpected happens
                while (i--)
                    this.prePasses[i].renderTree(scene);
            }                  
            stats.end();
            HMD.submitFrame(pose);
        },
    });


    // Define the VR-RenderTree
    var vrTree = function (renderInterface) {
        XML3D.webgl.BaseRenderTree.call(this, renderInterface);
        this.createRenderPasses();
    };
    
    XML3D.createClass(vrTree, XML3D.webgl.BaseRenderTree);
    XML3D.extend(vrTree.prototype, {
        //Define the custom renderpass for VR
        createRenderPasses: function () {
            var context = this.renderInterface.context;

            var empty = function () {};
            global.oldBind = context.canvasTarget.__proto__.bind;
            console.log(oldBind);

            // Make sure the vieport cannot be reset with .bind()
            context.canvasTarget.__proto__.bind = empty;
            
            var leftPass = this.renderInterface.createSceneRenderPass();
            var rightPass = this.renderInterface.createSceneRenderPass();
            
            var opts = {};
            
            // Create the VR-pass
            var vrPass_ = new VRPass(this.renderInterface, context.canvasTarget, opts);

            // Add the left and right pre-passes to the VR-pass
            vrPass_.addPrePass(rightPass);
            vrPass_.addPrePass(leftPass);

            // Set the main-pass to the custom VR-pass
            this.mainRenderPass = vrPass_;
        },

        // Standard render function
        render: function (scene) {
            this.mainRenderPass.setProcessed(false);
            XML3D.webgl.BaseRenderTree.prototype.render.call(this, scene);
        }
    });

    //Create the VR-rendertree and activate it, using the renderinterface    
    var xml3dElement = document.getElementsByTagName("xml3d")[0];
    var renderInterface = xml3dElement.getRenderInterface();
    oldRenderTree = renderInterface.getRenderTree();
    var vrRenderTree = new vrTree(renderInterface);
    renderInterface.setRenderTree(vrRenderTree);

    //Christian: set XML3D to continuous rendering mode:
    XML3D.options.setValue("renderer-continuous", true);
};

render.resetRenderTree = function(){
    gl.disable(gl.SCISSOR_TEST);
    fov.resetFOV();
    
    var xml3dElement = document.getElementsByTagName("xml3d")[0]
    var bcr = xml3dElement.getBoundingClientRect();
    var renderInterface = xml3dElement.getRenderInterface();
    var context = renderInterface.context;
    // Reset .bind() to its previous state
    context.canvasTarget.__proto__.bind = global.oldBind;
    
    gl.canvas.width = bcr.width;
    gl.canvas.height = bcr.height;
    
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)

    xml3dElement.getRenderInterface().setRenderTree(oldRenderTree);
    xml3dElement.setAttribute("view", oldView);
    $("#headTransformGroup").remove();
    $("#oldCameraTransform").remove();
}

function getActiveView(){
    var xml3dElement = document.getElementsByTagName("xml3d")[0]
    var viewId = xml3dElement.view;
    if (viewId) {
        return document.getElementById(viewId.substr(1));
    }
}
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./fov.js":1}],3:[function(require,module,exports){
(function (global){
var utility = module.exports = {};
 
//var render = require("./render.js");              // Uses a shader to combine the 2 views from buffers to the canvas
var render = require("./render_viewports.js");      // Uses viewports to directly render onto the canvas

var orig_requestAnimationFrame = window.requestAnimationFrame;

// Initiates VR, user interaction necessary
utility.initiateVR = function() {
    console.log("Entering VR!")
       
	// Default: Use first registered device
	HMD = global.devices[0];
	console.log(HMD);

	// Get the Canvas
	myCanvas = document.getElementsByClassName("_xml3d")[0]; //TODO: review this
	console.log(myCanvas);
	
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

    $("body").append("<div id='ButtonBar' style='position: fixed; bottom: 0px'></div>");
    
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

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./render_viewports.js":2}],4:[function(require,module,exports){
(function (global){
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
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./utility.js":3}]},{},[4]);
