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
    
    var width = gl.canvas.width;
    var height =  gl.canvas.height;  
    
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
            "   sum += texture2D(leftTexture, vec2(texcoord.x * 2.0, texcoord.y));",
            "   }",

            "   else{",
            "   texcoord.x = (texX - 0.5);",
            "   texcoord.y = (gl_FragCoord.y / canvasSize.y);",
            "   sum += texture2D(rightTexture, vec2(texcoord.x * 2.0, texcoord.y));",
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

            uniformVariables.canvasSize = [width, height];
            
            // Left and right buffers will be rendered onto these
            uniformVariables.leftTexture = [this.inputs.leftTexture.colorTarget.handle];
            uniformVariables.rightTexture = [this.inputs.rightTexture.colorTarget.handle];
            this.shaderProgram.setSystemUniformVariables(Object.keys(uniformVariables), uniformVariables);

            // Draw the full screen quad using the shader
            this.fullscreenQuad.draw(this.shaderProgram);

            // Undo any changes made to the GL state after rendering
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
            
            
            var i = this.prePasses.length;
            if (i == 2) {
                var rightPass = this.prePasses[0];
                var leftPass = this.prePasses[1];

                var fov_ = HMD.getEyeParameters("left").fieldOfView;
                fov.setFOV($view, $xml3d, $projectionMatrix, fov_);
                $eyeTransform.attr("transform", "#leftEyeTransform");
                XML3D.flushDOMChanges();
                leftPass.render(scene);
                
                fov_ = HMD.getEyeParameters("right").fieldOfView;
                fov.setFOV($view, $xml3d, $projectionMatrix, fov_);
                $eyeTransform.attr("transform", "#rightEyeTransform");
                XML3D.flushDOMChanges();
                rightPass.render(scene);

            } else {
                // If something unexpected happens
                while (i--)
                    this.prePasses[i].renderTree(scene);
            }
            this.render(scene);
            
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

            // Create the left and right Framebuffers, one for each eye
            var leftBuffer = this.renderInterface.createRenderTarget({
                width: leftEye.renderWidth,
                height: leftEye.renderHeight,
                colorFormat: context.gl.RGBA,
                depthFormat: context.gl.DEPTH_COMPONENT16,
                depthAsRenderbuffer: true,
                stencilFormat: null
            });
            var rightBuffer = this.renderInterface.createRenderTarget({
                width: rightEye.renderWidth,
                height: rightEye.renderHeight,
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
    var xml3dElement = document.getElementsByTagName("xml3d")[0]
    var renderInterface = xml3dElement.getRenderInterface();
    oldRenderTree = renderInterface.getRenderTree();
    var vrRenderTree = new vrTree(renderInterface);
    renderInterface.setRenderTree(vrRenderTree);

    //Christian: set XML3D to continuous rendering mode:
    XML3D.options.setValue("renderer-continuous", true);
};

render.resetRenderTree = function(){
    fov.resetFOV();
    
    var xml3dElement = document.getElementsByTagName("xml3d")[0]
        
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