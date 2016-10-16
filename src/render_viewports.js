var render = module.exports = {};

var fov = require("./fov.js");

// Scales values dat WebVR gives in metres
window.XML3D.webvr = {};
window.XML3D.webvr.translationScale = 3.0;
window.XML3D.webvr.scale = 10.0;
var oldRenderTree;
var oldView;

//******************************************** Custom RenderTree

render.vrRenderTree = function(){    
    console.log("creating custom render tree");

    var leftEye = HMD.getEyeParameters("left");
    var rightEye = HMD.getEyeParameters("right");
    var leftOffset = leftEye.offset;
    var rightOffset = rightEye.offset;
    
    
    // Create groups around view to apply the eye and head transformations to
    var $view = $("#" + document.getElementsByTagName("xml3d")[0].view.substr(1));
    
    if ($("#headTransformGroup").length == 0 && $("#eyeTransform").length == 0 ){
        if ($view.attr("transform")) {
            //old view has a transform, we need to move it to above the head transform in the hierarchy to preserve current camera position and orientation
            $view.before('<group id="oldCameraTransform"><group id="headTransformGroup"><group id="eyeTransform"></group><view id="vr_view"></view></group></group>');
            $("#oldCameraTransform").attr("transform", $view.attr("transform"));
        } else {
            $view.before('<group id="headTransformGroup"><group id="eyeTransform"></group><view id="vr_view"></view></group>');
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
        $eyeTransform.before('<transform id="leftEyeTransform" translation="' + leftOffset[0] * window.XML3D.webvr.scale + ' ' + leftOffset[1] * window.XML3D.webvr.scale + ' ' + leftOffset[2] * window.XML3D.webvr.scale + '"></transform>');
        $eyeTransform.before('<transform id="rightEyeTransform" translation="' + rightOffset[0] * window.XML3D.webvr.scale + ' ' + rightOffset[1] * window.XML3D.webvr.scale + ' ' + rightOffset[2] * window.XML3D.webvr.scale + '"></transform>');
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
            var posiString = position[0] * window.XML3D.webvr.scale * window.XML3D.webvr.translationScale + ' ' + position[1] * window.XML3D.webvr.scale * window.XML3D.webvr.translationScale + ' ' + position[2] * window.XML3D.webvr.scale * window.XML3D.webvr.translationScale;
            // Apply position transformation to head
            $headTransform.attr("translation", posiString);

            fov.setFOV($view, $xml3d, $projectionMatrix);
            
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