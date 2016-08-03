"use strict";

//TODO: (Christian) break this up into multiple files and import what you need with require()
//TODO: (Christian) maybe create the WebVR enable/reset buttons dynamically. Position them with style="position: fixed" in the bottom left corner

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

//TODO: (Christian) make this part of the RenderTree to ensure it's synced with XML3D
//TODO: handle special cases, like HMD disconnected, exiting presentation, ...
function onAnimationFrame() {

    //gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); 
    gl.clear(gl.DEPTH_BUFFER_BIT);

    if (HMD) {
        //TODO: (Christian) replace window.requestAnimationFrame with your own function that returns HMD.requestAnimationFrame (once HMD is initialized)
        //TODO: this should 'trick' XML3D into using the HMD's. Then you can move this whole function into the vrTree.
        // Ensures that scene is rendered at the right refresh rate for the primary HMD
        HMD.requestAnimationFrame(onAnimationFrame);

        if (HMD.isPresenting) {
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
            //TODO: (Christian) cache this jquery element lookup and any others that happen inside the render loop, can be very costly
            $("#headTransform").attr("rotation", oriString);
            
            // Movement of the head:
            // Get position as 3D vector
            var position = pose.position ? pose.position : [0, 0, 0];
            // Convert to string
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
    console.log("creating custom render tree");

    var leftEye = HMD.getEyeParameters("left");
    var rightEye = HMD.getEyeParameters("right");
    var leftOffset = leftEye.offset;
    var rightOffset = rightEye.offset;
    
    // Prepare the headTransformGroup for use
    $("#headTransformGroup").before('<transform id="headTransform"></transform>');
    $("#headTransformGroup").attr("transform", "#headTransform")

    // Define the translations for the left/right eye
    $("#eyeTransform").before('<transform id="leftEyeTransform" translation="' + leftOffset[0] * scale + ' ' + leftOffset[1] * scale + ' ' + leftOffset[2] * scale + '"></transform>');
    $("#eyeTransform").before('<transform id="rightEyeTransform" translation="' + rightOffset[0] * scale + ' ' + rightOffset[1] * scale + ' ' + rightOffset[2] * scale + '"></transform>');
    $("#eyeTransform").before('<transform id="defaultEyeTransform" translation="0 0 0"></transform>');

    //TODO: (Christian) jquery does some weird stuff in wrap(), try doing this manually (add group to DOM, remove view, add view under group)
    // Create a group around view to apply the eye transformation to
    // Dynamically creating this does not work with XML3D??
    //$("view").wrap('<group id="eyeTransform" transform="#defaultEyeTransform">');
    //$("#eyeTransform").append($("#Generated_Camera_Transform_0"));

    // TODO: Maybe change to leftEye + rightEye?
    var width = Math.max(leftEye.renderWidth, rightEye.renderWidth) * 2;
    var height = Math.max(leftEye.renderHeight, rightEye.renderHeight);

    console.log("x: " + width + ", y: " + height);


    // Register the VR shader
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

            // TODO: old comment
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

                //TODO: (Christian) Could try using gl.viewPort to only render to the left/right side of the canvas. This
                //TODO: could avoid the extra step of combining the left/right textures with the vr-shader. You would have to
                //TODO: replace the .bind() function on the canvasTarget with your own though (check GLCanvasTarget in rendertarget.js in xml3d)

                //TODO: (Christian) cache this jquery lookup as this.eyeTransform up in the constructor for better performance
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
    //TODO: (Christian) find XML3D element by tag name instead of id
    var xml3dElement = document.getElementById("MyXml3d");
    var renderInterface = xml3dElement.getRenderInterface();
    var vrRenderTree = new vrTree(renderInterface);
    renderInterface.setRenderTree(vrRenderTree);

    //Christian: set XML3D to continuous rendering mode:
    XML3D.options.setValue("renderer-continuous", true);
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
        vrRenderTree();

        //TODO: (Christian) Here you should replace window.requestAnimationFrame to return HMD.requestAnimationFrame.
        //TODO onAnimationFrame can then be moved into vrTree and doesn't need to request its own animation frame from the HMD anymore
        // Start showing frames on HMD
        onAnimationFrame();

    });
};

// Resets the pose of the HMD if it is not null
function resetPosition() {
    if (HMD){
        HMD.resetPose();
    }  
}
