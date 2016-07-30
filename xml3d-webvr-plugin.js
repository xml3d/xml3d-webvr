(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

/************************************************************
REQUIREMENTS:

In HTML DOM:
    view element must be wrapped in a group with id="eyeTransform",
    which, in turn, has to be wrapped in a group with id="headTransformGroup"
    
    button with id "VRenable" to enter VR
    button with id "ResetPos" to reset the position of the HMD

*************************************************************/

$(document).ready(function () {
    // Adds listener to enable VR
    document.getElementById("VRenable").addEventListener("click", function () {
        initiateVR();
    });
    
    // Adds listener to reset Position. 
    document.getElementById("ResetPos").addEventListener("click", function () {
        resetPosition();
    });

});

// Some global variables
var HMD, gl, myCanvas;
// Scales values dat WebVR gives in metres
var scale = 10.0;


//******************************************** Render the scene to HMD

//TODO: handle special cases, like HMD disconnected, exiting presentation, ...
// + some old comments
function onAnimationFrame() {

    //gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); 
    gl.clear(gl.DEPTH_BUFFER_BIT);

    if (HMD) {
        // Ensures that scene is rendered at the right refresh rate for the primary HMD
        HMD.requestAnimationFrame(onAnimationFrame);

        if (HMD.isPresenting) {
            // Stereo view
            // Show ExitVR-button

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
            $("#headTransform").attr("rotation", oriString);
            
            // NOT TESTED
            // Movement of the head:
            // Get position as 3D vector
            var position = pose.position ? pose.position : [0, 0, 0];
            // Convert to string
            //var posiString = position.x + ' ' + position.y + ' ' + position.z;
            var posiString = position[0] * scale + ' ' + position[1] * scale + ' ' + position[2] * scale;
            // Apply position transformation to head
            $("#headTransform").attr("translation", posiString);
            


            HMD.submitFrame(pose);
        } else {
            // Mono view
            // Show VR Button
        }
    } else {
        HMD.requestAnimationFrame(onAnimationFrame);

        // No VRDisplay found
        // Return to mono view
        // Hide VR-button
    }

}



//******************************************** Custom RenderTree

function vrRenderTree() {

    console.log("creating custom tree");
    console.log(XML3D);


    var leftEye = HMD.getEyeParameters("left");
    var rightEye = HMD.getEyeParameters("right");
    var leftOffset = leftEye.offset;
    var rightOffset = rightEye.offset;
    
    // Prepare the headTransformGroup for use
    $("#headTransformGroup").before('<transform id="headTransform"></transform>'); //necessary?
    $("#headTransformGroup").attr("transform", "#headTransform")

    // Define the translations for the left/right eye
    $("#eyeTransform").before('<transform id="leftEyeTransform" translation="' + leftOffset[0] * scale + ' ' + leftOffset[1] * scale + ' ' + leftOffset[2] * scale + '"></transform>');
    //$("#eyeTransform").before('<transform id="leftEyeTransform" translation="0 50 5"></transform>');
    $("#eyeTransform").before('<transform id="rightEyeTransform" translation="' + rightOffset[0] * scale + ' ' + rightOffset[1] * scale + ' ' + rightOffset[2] * scale + '"></transform>');
    $("#eyeTransform").before('<transform id="defaultEyeTransform" translation="0 0 0"></transform>');

    // Create a group around view to apply the eye transformation to
    // Dynamically creating this does not work with XML3D??
    //$("view").wrap('<group id="eyeTransform" transform="#defaultEyeTransform">');
    //$("#eyeTransform").append($("#Generated_Camera_Transform_0"));

    //TODO: Still needed?
    //var view = XML3D.XML3DViewElement;
    /*var viewName = document.querySelector("xml3d").getAttribute("view");
    console.log(viewName);
    console.log(document.querySelector("xml3d"));

    var view = document.getElementById("default") //TODO: make dis dependaple on viewName
    console.log(view);
    console.log(view.getViewMatrix());*/

    // TODO: Maybe change to leftEye + rightEye?
    var width = Math.max(leftEye.renderWidth, rightEye.renderWidth) * 2;
    var height = Math.max(leftEye.renderHeight, rightEye.renderHeight);

    console.log("x: " + width + ", y: " + height);

    //TODO: old comment/vertex code
    // Register the shader
    XML3D.materials.register("vr-shader", {
        vertex: [
            "attribute vec3 position;",

            "void main(void) {",
            "   gl_Position = vec4(position, 1.0);",
            "}"
        ].join("\n"),


        fragment: [
            "uniform sampler2D leftTexture;",
            "uniform sampler2D rightTexture;",
            "uniform vec2 canvasSize;",

            "void main(void) {",
            "   float texX = (gl_FragCoord.x / canvasSize.x);",
            "   vec2 texcoord;",
            "   vec4 sum = vec4(0.0);",

            "   if (texX < 0.5) {",
            "   texcoord = (gl_FragCoord.xy / canvasSize.xy);",
            "   sum += texture2D(leftTexture, vec2(texcoord.x, texcoord.y));",
            "   }",

            "   else{",
            "   texcoord.x = (texX - 0.5);",
            "   texcoord.y = (gl_FragCoord.y / canvasSize.y);",
            "   sum += texture2D(rightTexture, vec2(texcoord.x, texcoord.y));",
            "   }",

            "    gl_FragColor = sum;",
            "}"
        ].join("\n"),

        uniforms: {
            //Dont change here, but at uniformVariables
            canvasSize: [width, height],
        },

        samplers: {
            leftTexture: null,
            rightTexture: null
        }
    });

    // Define the VR RenderPass
    var VRPass = function (renderInterface, output, opt) {
        XML3D.webgl.BaseRenderPass.call(this, renderInterface, output, opt);

        // The left and right passes will be combined onto this fullscreen quad
        this.fullscreenQuad = renderInterface.createFullscreenQuad();

        this.shaderProgram = renderInterface.getShaderProgram(opt.shader);

    };
    XML3D.createClass(VRPass, XML3D.webgl.BaseRenderPass);
    XML3D.extend(VRPass.prototype, {
        render: function (scene) {
            var gl = this.renderInterface.context.gl;
            this.output.bind();
            this.shaderProgram.bind();

            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.disable(gl.DEPTH_TEST);

            // Uniform variables used by the shader 
            var uniformVariables = {};
            uniformVariables.canvasSize = [this.output.width, this.output.height];
            // Left and right buffers will be rendered onto these
            uniformVariables.leftTexture = [this.inputs.leftTexture.colorTarget.handle];
            uniformVariables.rightTexture = [this.inputs.rightTexture.colorTarget.handle];
            this.shaderProgram.setSystemUniformVariables(Object.keys(uniformVariables), uniformVariables);

            // TODO: old comment/code
            // Draw the full screen quad using the given shader program
            this.fullscreenQuad.draw(this.shaderProgram);

            //TODO: old comment
            // It's good practice to undo any changes you've made to the GL state after rendering
            // failure to do so can have unintended side effects in subsequent render passes!
            this.shaderProgram.unbind();
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

            var i = this.prePasses.length;
            if (i == 2) {
                var rightPass = this.prePasses[0];
                var leftPass = this.prePasses[1];

                $("#eyeTransform").attr("transform", "#leftEyeTransform");
                XML3D.flushDOMChanges();
                leftPass.renderTree(scene);
                //leftPass.render(scene);
                $("#eyeTransform").attr("transform", "#rightEyeTransform");
                XML3D.flushDOMChanges();
                rightPass.renderTree(scene);
                //rightPass.render(scene);

            } else {
                // If something unexpected happens
                while (i--)
                    this.prePasses[i].renderTree(scene);
            }
            this.render(scene);
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

            //TODO: use function to create buffers (instead of copy paste)
            // Create the left and right Framebuffers, one for each eye
            var leftBuffer = this.renderInterface.createRenderTarget({
                width: (context.canvasTarget.width),
                height: context.canvasTarget.height,
                colorFormat: context.gl.RGBA,
                depthFormat: context.gl.DEPTH_COMPONENT16,
                depthAsRenderbuffer: true,
                stencilFormat: null
            });
            var rightBuffer = this.renderInterface.createRenderTarget({
                width: context.canvasTarget.width,
                height: context.canvasTarget.height,
                colorFormat: context.gl.RGBA,
                depthFormat: context.gl.DEPTH_COMPONENT16,
                depthAsRenderbuffer: true,
                stencilFormat: null
            });

            // Instantiate the left and right pre-passes, each being a standard XML3D render pass
            // Both passes render to a respective buffer, which will be combined in the VR-pass
            // These can be replaced by standard passes, e.g. to apply postprocessing effects
            var leftPass = this.renderInterface.createSceneRenderPass(leftBuffer);
            var rightPass = this.renderInterface.createSceneRenderPass(rightBuffer);

            var opts = {
                inputs: {
                    'leftTexture': leftBuffer,
                    'rightTexture': rightBuffer
                },
                shader: "vr-shader",
                id: "vr"
            };

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
    var xml3dElement = document.getElementById("MyXml3d");
    var renderInterface = xml3dElement.getRenderInterface();
    var vrRenderTree = new vrTree(renderInterface);
    renderInterface.setRenderTree(vrRenderTree);
};

// ****************************************** Utility

// Initiates VR, user interaction necessary
function initiateVR() {
    navigator.getVRDisplays().then(function (devices) {
        
        // Cancel initalisation if no VRDisplays are detected
        if (devices.length < 1){
            console.log("No VRDisplays found, reload page to try again")
            return;
        }
        
        // Default: Use first registered device
        HMD = devices[0];
        console.log(HMD);

        //myCanvas = document.getElementById("canvas");
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

        //resize the canvas
        //TODO: currently not used, reimplement or not??
        //resize();

        //initialize VR render tree
        vrRenderTree();

        //Start showing frames on HMD
        onAnimationFrame();

    });
};

// Resets the pose of the HMD if it is not null
function resetPosition() {
    if (HMD){
        HMD.resetPose();
    }  
}

},{}]},{},[1]);
