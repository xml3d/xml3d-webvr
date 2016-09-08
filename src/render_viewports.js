var render = module.exports = {};

// Scales values dat WebVR gives in metres
var scale = 10.0;

//******************************************** Custom RenderTree

render.vrRenderTree = function(){    
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
    
    gl.canvas.width = Math.max(leftEye.renderWidth, rightEye.renderWidth) * 2;
    gl.canvas.height = Math.max(leftEye.renderHeight, rightEye.renderHeight);
    console.log("Canvas: " + gl.canvas.width + ", " + gl.canvas.height);


    // Define the VR RenderPass
    var VRPass = function (renderInterface, output, opt) {
        XML3D.webgl.BaseRenderPass.call(this, renderInterface, output, opt);

        // The left and right passes will be combined onto this fullscreen quad
        //this.fullscreenQuad = renderInterface.createFullscreenQuad();

    };
    XML3D.createClass(VRPass, XML3D.webgl.BaseRenderPass);
    XML3D.extend(VRPass.prototype, {
        render: function (scene) {
            var gl = this.renderInterface.context.gl;
            this.output.bind();

            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.disable(gl.DEPTH_TEST);

            // TODO: old comment
            // It's good practice to undo any changes you've made to the GL state after rendering
            // failure to do so can have unintended side effects in subsequent render passes!
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
            //TODO: (Christian) cache this jquery element lookup and any others that happen inside the render loop, can be very costly
            $("#headTransform").attr("rotation", oriString);

            // Movement of the head:
            // Get position as 3D vector
            var position = pose.position ? pose.position : [0, 0, 0];
            // Convert to string
            var posiString = position[0] * scale + ' ' + position[1] * scale + ' ' + position[2] * scale;
            // Apply position transformation to head
            $("#headTransform").attr("translation", posiString);

            
            var leftEye = HMD.getEyeParameters("left");
            var rightEye = HMD.getEyeParameters("right");
            
            var i = this.prePasses.length;
            if (i == 2) {
                var rightPass = this.prePasses[0];
                var leftPass = this.prePasses[1];

                //TODO: (Christian) Could try using gl.viewPort to only render to the left/right side of the canvas. This
                //TODO: could avoid the extra step of combining the left/right textures with the vr-shader. You would have to
                //TODO: replace the .bind() function on the canvasTarget with your own though (check GLCanvasTarget in rendertarget.js in xml3d)

                //TODO: (Christian) cache this jquery lookup as this.eyeTransform up in the constructor for better performance
                $("#eyeTransform").attr("transform", "#leftEyeTransform");
                gl.viewport(0, 0, leftEye.renderWidth, leftEye.renderHeight);
                XML3D.flushDOMChanges();
                //leftPass.renderTree(scene);
                leftPass.render(scene);
                
                
                $("#eyeTransform").attr("transform", "#rightEyeTransform");
                gl.viewport(leftEye.renderWidth, 0, rightEye.renderWidth, rightEye.renderHeight);
                XML3D.flushDOMChanges();
                //rightPass.renderTree(scene);
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
            /*
            XML3D.extend(context.canvasTarget.prototype, {
                getWidth: function () {
                    return this.width;
                }, getHeight: function () {
                    return this.height;
                }, getScale: function () {
                    return 1;
                }, bind: empty
                , unbind: empty
                , resize: empty
                , new: empty
            });*/
            
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
    //TODO: (Christian) find XML3D element by tag name instead of id
    var xml3dElement = document.getElementById("MyXml3d");
    var renderInterface = xml3dElement.getRenderInterface();
    var vrRenderTree = new vrTree(renderInterface);
    renderInterface.setRenderTree(vrRenderTree);

    //Christian: set XML3D to continuous rendering mode:
    XML3D.options.setValue("renderer-continuous", true);
};