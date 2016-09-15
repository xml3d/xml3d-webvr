(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var fov = module.exports = {};

// Sets the FOV in the view element
fov.setFOV = function(){
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
    
    var projectionMatrix = fieldOfViewToProjectionMatrix(fov, zNear, zFar);
        
    var matrixString = "<float4x4 name='projectionMatrix'>" + arrayToString(projectionMatrix) + "</float4x4>";
    var $view = $("view");
    var $fovProjection = $("#fovProjection");
    
    $view.attr("model", "urn:xml3d:view:projective");
    $view.append(matrixString);

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
},{}],2:[function(require,module,exports){
var render = module.exports = {};

var fov = require("./fov.js");

// Scales values dat WebVR gives in metres
var scale = 10.0;
var translationScale = 3.0;

//******************************************** Custom RenderTree

render.vrRenderTree = function(){    
    console.log("creating custom render tree");

    var leftEye = HMD.getEyeParameters("left");
    var rightEye = HMD.getEyeParameters("right");
    var leftOffset = leftEye.offset;
    var rightOffset = rightEye.offset;
    
    // cache jQuery lookups
    var $eyeTransform = $("#eyeTransform");
    var $headTransformGroup = $("#headTransformGroup");
    
    // Prepare the headTransformGroup for use
    $headTransformGroup.before('<transform id="headTransform"></transform>');
    $headTransformGroup.attr("transform", "#headTransform")
    
    var $headTransform = $("#headTransform");

    // Define the translations for the left/right eye
    $eyeTransform.before('<transform id="leftEyeTransform" translation="' + leftOffset[0] * scale + ' ' + leftOffset[1] * scale + ' ' + leftOffset[2] * scale + '"></transform>');
    $eyeTransform.before('<transform id="rightEyeTransform" translation="' + rightOffset[0] * scale + ' ' + rightOffset[1] * scale + ' ' + rightOffset[2] * scale + '"></transform>');
    $eyeTransform.before('<transform id="defaultEyeTransform" translation="0 0 0"></transform>');

    //TODO: (Christian) jquery does some weird stuff in wrap(), try doing this manually (add group to DOM, remove view, add view under group)
    // Create a group around view to apply the eye transformation to
    // Dynamically creating this does not work with XML3D??
    //$("view").wrap('<group id="eyeTransform" transform="#defaultEyeTransform">');
    //$eyeTransform.append($("#Generated_Camera_Transform_0"));
    
    gl.canvas.width = Math.max(leftEye.renderWidth, rightEye.renderWidth) * 2;
    gl.canvas.height = Math.max(leftEye.renderHeight, rightEye.renderHeight);
    console.log("Canvas: " + gl.canvas.width + ", " + gl.canvas.height);

    gl.enable(gl.SCISSOR_TEST);

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
            
            // Stereo view

            // Get pose as late as possible to minimize latency!
            var pose = HMD.getPose();

            // Rotation of the head:
            // Get the orientation (given as quaternion)
            var orientationQ = pose.orientation ? pose.orientation : [0, 0, 0, 1];
            // Transform into axis + angle
            var orientationAA = new XML3D.AxisAngle.fromQuat(new XML3D.Quat(orientationQ[0], orientationQ[1], orientationQ[2], orientationQ[3]));
            // Update rotation attribute
            var oriString = orientationAA.axis.x + ' ' + orientationAA.axis.y + ' ' + orientationAA.axis.z + ' ' + orientationAA.angle;
            // Apply rotation transformation to head
            $headTransform.attr("rotation", oriString);

            // Movement of the head:
            // Get position as 3D vector
            var position = pose.position ? pose.position : [0, 0, 0];
            // Convert to string
            var posiString = position[0] * scale * translationScale + ' ' + position[1] * scale * translationScale + ' ' + position[2] * scale * translationScale;
            // Apply position transformation to head
            $headTransform.attr("translation", posiString);

            fov.setFOV();
            
            var leftEye = HMD.getEyeParameters("left");
            var rightEye = HMD.getEyeParameters("right");
            
            var i = this.prePasses.length;
            if (i == 2) {
                var rightPass = this.prePasses[0];
                var leftPass = this.prePasses[1];

                // Only render to one half of the canvas
                $eyeTransform.attr("transform", "#leftEyeTransform");
                gl.scissor(0, 0, leftEye.renderWidth, leftEye.renderHeight);        // So the other half will not be overwritten
                gl.viewport(0, 0, leftEye.renderWidth, leftEye.renderHeight);
                XML3D.flushDOMChanges();
                leftPass.render(scene);
                
                $eyeTransform.attr("transform", "#leftEyeTransform");
                gl.scissor(leftEye.renderWidth, 0, rightEye.renderWidth, rightEye.renderHeight);
                gl.viewport(leftEye.renderWidth, 0, rightEye.renderWidth, rightEye.renderHeight);
                XML3D.flushDOMChanges();
                rightPass.render(scene);
                

            } else {
                // If something unexpected happens
                while (i--)
                    this.prePasses[i].renderTree(scene);
            }                  
            
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
    var xml3dElement = document.getElementsByTagName("xml3d")[0]
    var renderInterface = xml3dElement.getRenderInterface();
    var vrRenderTree = new vrTree(renderInterface);
    renderInterface.setRenderTree(vrRenderTree);

    //Christian: set XML3D to continuous rendering mode:
    XML3D.options.setValue("renderer-continuous", true);
};


},{"./fov.js":1}],3:[function(require,module,exports){
(function (global){
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
            global.inVR = true;
        }else{
            // TODO: reset the render interface
            HMD.exitPresent();
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
REQUIREMENTS:

In HTML DOM:
    view element must be wrapped in a group with id="eyeTransform",
    which, in turn, has to be wrapped in a group with id="headTransformGroup"
    
    button with id "VRenable" to enter VR
    button with id "ResetPos" to reset the position of the HMD
    
*************************************************************

For further information, please see development_status.txt

*************************************************************/

var util = require("./utility.js");

$(document).ready(function () {  
   // Dynamically create VR-related buttons
    util.setupButtons();  
});

// Some global variables
var HMD, gl, myCanvas;
global.xml3d_original = XML3D;
// TODO: maybe use HMD.isPresenting() ?
global.inVR = false;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./utility.js":3}]},{},[4]);
